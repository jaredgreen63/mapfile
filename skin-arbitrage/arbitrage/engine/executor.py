"""Trader role, buy side: consume pending deals and execute purchases.

Hard guards, checked immediately before every buy:
  - dry_run: never touches real money, records a simulated purchase instead
  - daily budget cap
  - max open positions
  - deal freshness (stale deals expire un-bought)
"""
from __future__ import annotations

import asyncio
import datetime as dt
import logging

from sqlalchemy.orm import Session, sessionmaker

from ..config import AppConfig
from ..db import Deal, InventoryItem, Purchase, open_position_count, spent_today_cents, utcnow
from ..markets.base import MarketAdapter, MarketError
from ..models import MarketListing
from ..notify import Notifier, fmt_usd

log = logging.getLogger("executor")

DEAL_MAX_AGE_SECONDS = 120  # skin deals disappear fast; stale ones are worthless


class Executor:
    def __init__(self, app: AppConfig, adapters: dict[str, MarketAdapter],
                 session_factory: sessionmaker[Session], notifier: Notifier):
        self.app = app
        self.adapters = adapters
        self.session_factory = session_factory
        self.notifier = notifier

    def _claim_next_deal(self) -> Deal | None:
        """Atomically claim one pending deal (row-locked so two trader
        processes never buy the same listing)."""
        with self.session_factory() as session:
            query = session.query(Deal).filter(Deal.status == "pending") \
                .order_by(Deal.est_profit_cents.desc())
            if session.get_bind().dialect.name == "postgresql":
                query = query.with_for_update(skip_locked=True)
            deal = query.first()
            if deal is None:
                return None
            deal.status = "executing"
            session.commit()
            return deal

    def _guards_fail_reason(self, session: Session, deal: Deal) -> str | None:
        strat = self.app.strategy
        age = (utcnow() - deal.created_at.replace(tzinfo=dt.timezone.utc)
               if deal.created_at.tzinfo is None else utcnow() - deal.created_at)
        if age.total_seconds() > DEAL_MAX_AGE_SECONDS:
            return "expired"
        spent = spent_today_cents(session, self.app.dry_run)
        if spent + deal.buy_price_cents > strat.daily_budget_cents:
            return f"daily budget exceeded ({fmt_usd(spent)} spent)"
        if open_position_count(session, self.app.dry_run) >= strat.max_open_positions:
            return "max open positions reached"
        return None

    def _record_purchase(self, session: Session, deal: Deal, dry_run: bool) -> None:
        purchase = Purchase(
            deal_id=deal.id, venue=deal.buy_venue, listing_id=deal.listing_id,
            game=deal.game, market_hash_name=deal.market_hash_name,
            price_cents=deal.buy_price_cents, dry_run=dry_run,
        )
        session.add(purchase)
        session.flush()
        session.add(InventoryItem(
            purchase_id=purchase.id, game=deal.game,
            market_hash_name=deal.market_hash_name, cost_cents=deal.buy_price_cents,
            dry_run=dry_run, status="pending_delivery", sell_venue=deal.ref_venue,
        ))

    async def _execute(self, deal: Deal) -> None:
        adapter = self.adapters.get(deal.buy_venue)
        with self.session_factory() as session:
            reason = self._guards_fail_reason(session, deal)
            deal = session.merge(deal)
            if reason:
                deal.status = "expired" if reason == "expired" else "skipped"
                deal.note = reason
                session.commit()
                return

            if self.app.dry_run:
                deal.status = "simulated"
                self._record_purchase(session, deal, dry_run=True)
                session.commit()
                await self.notifier.send(
                    f"**{deal.market_hash_name}**",
                    kind="buy", title="🧪 [DRY RUN] Would buy",
                    fields=[
                        ("Price", f"{fmt_usd(deal.buy_price_cents)} on {deal.buy_venue}"),
                        ("Est. profit", f"{fmt_usd(deal.est_profit_cents)} "
                                        f"({deal.margin_pct:.1f}%)"),
                    ],
                )
                return

        if adapter is None or not adapter.can_buy or not adapter.cfg.buy_enabled:
            with self.session_factory() as session:
                deal = session.merge(deal)
                deal.status = "alert_only"
                deal.note = "venue not auto-buyable"
                session.commit()
            return

        listing = MarketListing(
            venue=deal.buy_venue, listing_id=deal.listing_id, game=deal.game,
            market_hash_name=deal.market_hash_name, price_cents=deal.buy_price_cents,
        )
        try:
            await adapter.buy(listing)
        except MarketError as e:
            log.warning("buy failed for deal %s: %s", deal.id, e)
            with self.session_factory() as session:
                deal = session.merge(deal)
                deal.status = "failed"
                deal.note = str(e)[:500]
                session.commit()
            await self.notifier.send(
                f"**{deal.market_hash_name}** on {deal.buy_venue}\n{e}",
                kind="error", title="❌ Buy failed",
            )
            return

        with self.session_factory() as session:
            deal = session.merge(deal)
            deal.status = "bought"
            self._record_purchase(session, deal, dry_run=False)
            session.commit()
        await self.notifier.send(
            f"**{deal.market_hash_name}**",
            kind="buy", title="✅ Bought",
            fields=[
                ("Paid", f"{fmt_usd(deal.buy_price_cents)} on {deal.buy_venue}"),
                ("Target sell", f"{fmt_usd(deal.ref_price_cents)} on {deal.ref_venue}"),
                ("Est. profit", fmt_usd(deal.est_profit_cents)),
            ],
        )

    async def run(self) -> None:
        log.info("executor running (dry_run=%s)", self.app.dry_run)
        while True:
            deal = self._claim_next_deal()
            if deal is None:
                await asyncio.sleep(2)
                continue
            try:
                await self._execute(deal)
            except Exception:
                log.exception("executor error on deal %s", deal.id)
                with self.session_factory() as session:
                    deal = session.merge(deal)
                    deal.status = "failed"
                    deal.note = "internal error"
                    session.commit()
