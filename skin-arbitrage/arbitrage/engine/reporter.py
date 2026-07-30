"""Periodic status summaries pushed to Discord/Telegram.

Runs on the trader role (or `all`) so the two-server setup posts exactly one
summary stream. Sends a startup message, then a summary every
summary_interval_minutes.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from ..config import AppConfig
from ..db import Deal, InventoryItem, Purchase, spent_today_cents, utcnow
from ..notify import Notifier, fmt_usd

log = logging.getLogger("reporter")


class Reporter:
    def __init__(self, app: AppConfig, session_factory: sessionmaker[Session],
                 notifier: Notifier):
        self.app = app
        self.session_factory = session_factory
        self.notifier = notifier

    def _summary_fields(self) -> list[tuple[str, str]]:
        day_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        with self.session_factory() as session:
            deal_counts = dict(session.execute(
                select(Deal.status, func.count(Deal.id))
                .where(Deal.created_at >= day_start).group_by(Deal.status)
            ).all())
            buys_today = session.execute(
                select(func.count(Purchase.id)).where(
                    Purchase.purchased_at >= day_start,
                    Purchase.dry_run == self.app.dry_run)
            ).scalar_one()
            spent = spent_today_cents(session, self.app.dry_run)
            inv_counts = dict(session.execute(
                select(InventoryItem.status, func.count(InventoryItem.id))
                .where(InventoryItem.dry_run == self.app.dry_run,
                       InventoryItem.status.in_(
                           ("pending_delivery", "held", "listed")))
                .group_by(InventoryItem.status)
            ).all())
            sold = session.execute(
                select(func.count(InventoryItem.id),
                       func.coalesce(func.sum(InventoryItem.sold_price_cents), 0),
                       func.coalesce(func.sum(
                           InventoryItem.sold_price_cents - InventoryItem.cost_cents), 0))
                .where(InventoryItem.status == "sold",
                       InventoryItem.dry_run == self.app.dry_run,
                       InventoryItem.sold_at >= day_start)
            ).one()

        budget = self.app.strategy.daily_budget_cents
        deals_found = sum(deal_counts.values())
        open_positions = sum(inv_counts.values())
        fields = [
            ("Deals found today", str(deals_found)),
            ("Buys today", str(buys_today)),
            ("Spent today", f"{fmt_usd(spent)} / {fmt_usd(budget)}"),
            ("Open positions", f"{open_positions} / {self.app.strategy.max_open_positions}"),
            ("Awaiting delivery", str(inv_counts.get("pending_delivery", 0))),
            ("Listed for sale", str(inv_counts.get("listed", 0))),
        ]
        if sold[0]:
            fields.append(("Sold today", f"{sold[0]} for {fmt_usd(int(sold[1]))} "
                                         f"(gross P/L {fmt_usd(int(sold[2]))})"))
        if deal_counts.get("failed"):
            fields.append(("Failed buys today", str(deal_counts["failed"])))
        if deal_counts.get("alert_only"):
            fields.append(("Manual-buy alerts", str(deal_counts["alert_only"])))
        return fields

    async def run(self) -> None:
        mode = "DRY RUN" if self.app.dry_run else "LIVE"
        await self.notifier.send(
            f"Bot online — role `{self.app.role}`, mode **{mode}**, "
            f"games: {', '.join(self.app.games)}",
            kind="info", title="🟢 Skin Arbitrage Bot started",
        )
        interval = max(self.app.summary_interval_minutes, 5) * 60
        while True:
            await asyncio.sleep(interval)
            try:
                fields = self._summary_fields()
                await self.notifier.send(
                    f"Status report ({mode})", kind="summary",
                    title="📊 Arbitrage status", fields=fields,
                )
            except Exception:
                log.exception("summary report failed")
