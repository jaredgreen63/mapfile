"""Trader role, sell side: list held inventory and reprice to stay competitive.

Flow per item: pending_delivery -> held -> listed -> sold.

pending_delivery -> held is a manual/venue-specific step (trade holds, item
transfer into the sell venue's inventory). Once the item is in the sell
venue's inventory, set the item's status to 'held' and fill sell_asset_id —
either by hand (see README) or via a future inventory-sync job. The relister
then creates the listing and keeps it competitively priced.

Pricing: start at (current lowest ask - undercut), never below the floor
cost * (1 + min_markup_over_cost_pct).
"""
from __future__ import annotations

import asyncio
import datetime as dt
import logging

from sqlalchemy.orm import Session, sessionmaker

from ..config import AppConfig
from ..db import InventoryItem, PriceRef, utcnow
from ..markets.base import MarketAdapter, MarketError
from ..notify import Notifier, fmt_usd

log = logging.getLogger("relister")


class Relister:
    def __init__(self, app: AppConfig, adapters: dict[str, MarketAdapter],
                 session_factory: sessionmaker[Session], notifier: Notifier):
        self.app = app
        self.adapters = adapters
        self.session_factory = session_factory
        self.notifier = notifier

    def _floor_cents(self, item: InventoryItem) -> int:
        return int(item.cost_cents * (1 + self.app.strategy.min_markup_over_cost_pct / 100.0))

    def _target_price(self, session: Session, item: InventoryItem) -> int:
        floor = self._floor_cents(item)
        ref = session.query(PriceRef).filter(
            PriceRef.venue == item.sell_venue,
            PriceRef.market_hash_name == item.market_hash_name,
        ).first()
        if ref is None:
            return floor
        undercut = ref.price_cents - self.app.strategy.relist_undercut_cents
        return max(undercut, floor)

    def _sell_adapter(self, item: InventoryItem) -> MarketAdapter | None:
        adapter = self.adapters.get(item.sell_venue)
        if adapter and adapter.can_sell and adapter.cfg.sell_enabled:
            return adapter
        # fall back to any sell-capable venue
        for a in self.adapters.values():
            if a.can_sell and a.cfg.sell_enabled:
                return a
        return None

    async def _list_item(self, item_id: int) -> None:
        with self.session_factory() as session:
            item = session.get(InventoryItem, item_id)
            if item is None or item.status != "held":
                return
            price = self._target_price(session, item)
            adapter = self._sell_adapter(item)

            if item.dry_run or adapter is None:
                item.status = "listed"
                item.sell_venue = adapter.name if adapter else item.sell_venue
                item.list_price_cents = price
                item.listed_at = utcnow()
                session.commit()
                await self.notifier.send(
                    f"🧪 [{'DRY RUN' if item.dry_run else 'MANUAL'}] Would list "
                    f"{item.market_hash_name} at {fmt_usd(price)} "
                    f"(cost {fmt_usd(item.cost_cents)})"
                )
                return

            if not item.sell_asset_id:
                log.info("item %s held but sell_asset_id empty; waiting", item.id)
                return
            try:
                listing_id = await adapter.create_sell_listing(item.sell_asset_id, price)
            except MarketError as e:
                log.warning("listing failed for item %s: %s", item.id, e)
                return
            item.status = "listed"
            item.sell_venue = adapter.name
            item.sell_listing_id = listing_id
            item.list_price_cents = price
            item.listed_at = utcnow()
            session.commit()
            await self.notifier.send(
                f"📤 Listed {item.market_hash_name} on {adapter.name} at {fmt_usd(price)} "
                f"(cost {fmt_usd(item.cost_cents)})"
            )

    async def _reprice_item(self, item_id: int) -> None:
        with self.session_factory() as session:
            item = session.get(InventoryItem, item_id)
            if item is None or item.status != "listed":
                return
            interval = dt.timedelta(seconds=self.app.strategy.reprice_interval_seconds)
            if item.listed_at and utcnow() - (
                item.listed_at if item.listed_at.tzinfo else
                item.listed_at.replace(tzinfo=dt.timezone.utc)
            ) < interval:
                return
            target = self._target_price(session, item)
            if target >= item.list_price_cents:
                return  # already competitive
            adapter = self._sell_adapter(item)
            if not item.dry_run and adapter and item.sell_listing_id:
                try:
                    await adapter.cancel_sell_listing(item.sell_listing_id)
                    item.sell_listing_id = await adapter.create_sell_listing(
                        item.sell_asset_id, target)
                except MarketError as e:
                    log.warning("reprice failed for item %s: %s", item.id, e)
                    return
            old = item.list_price_cents
            item.list_price_cents = target
            item.listed_at = utcnow()
            session.commit()
            log.info("repriced %s: %s -> %s", item.market_hash_name,
                     fmt_usd(old), fmt_usd(target))

    async def run(self) -> None:
        log.info("relister running (dry_run=%s)", self.app.dry_run)
        while True:
            with self.session_factory() as session:
                held_ids = [i.id for i in session.query(InventoryItem.id)
                            .filter(InventoryItem.status == "held").all()]
                listed_ids = [i.id for i in session.query(InventoryItem.id)
                              .filter(InventoryItem.status == "listed").all()]
            for item_id in held_ids:
                await self._list_item(item_id)
            for item_id in listed_ids:
                await self._reprice_item(item_id)
            await asyncio.sleep(15)
