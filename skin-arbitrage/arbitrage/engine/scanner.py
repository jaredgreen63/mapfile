"""Scanner role: refresh price references and scan listings for deals."""
from __future__ import annotations

import asyncio
import datetime as dt
import logging

from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from ..config import AppConfig
from ..db import Deal, PriceRef, utcnow
from ..markets.base import MarketAdapter
from ..models import MarketListing, PriceReference
from ..notify import Notifier, fmt_usd
from .detector import evaluate_listing

log = logging.getLogger("scanner")


class Scanner:
    def __init__(self, app: AppConfig, adapters: dict[str, MarketAdapter],
                 session_factory: sessionmaker[Session], notifier: Notifier):
        self.app = app
        self.adapters = adapters
        self.session_factory = session_factory
        self.notifier = notifier
        self.sellable_venues = {
            name for name, a in adapters.items()
            if a.can_reference or getattr(a, "can_sell", False)
        }

    # ---------- reference maintenance ----------

    def _upsert_refs(self, refs: list[PriceReference]) -> None:
        if not refs:
            return
        now = utcnow()
        with self.session_factory() as session:
            rows = [dict(venue=r.venue, game=r.game, market_hash_name=r.market_hash_name,
                         price_cents=r.price_cents, quantity=r.quantity, updated_at=now)
                    for r in refs]
            dialect = session.get_bind().dialect.name
            insert = postgresql.insert if dialect == "postgresql" else sqlite.insert
            stmt = insert(PriceRef.__table__).values(rows)
            stmt = stmt.on_conflict_do_update(
                index_elements=["venue", "market_hash_name"],
                set_={"price_cents": stmt.excluded.price_cents,
                      "quantity": stmt.excluded.quantity,
                      "updated_at": stmt.excluded.updated_at},
            )
            session.execute(stmt)
            session.commit()

    async def reference_loop(self, venue: str) -> None:
        adapter = self.adapters[venue]
        while True:
            for game in self.app.games:
                try:
                    refs = await adapter.fetch_references(game)
                    self._upsert_refs(refs)
                except Exception:
                    log.exception("%s reference refresh failed for %s", venue, game)
            await asyncio.sleep(adapter.cfg.poll_seconds)

    # ---------- listing scanning + detection ----------

    def _load_refs(self, session: Session, name: str) -> dict[str, PriceReference]:
        cutoff = utcnow() - dt.timedelta(seconds=self.app.strategy.max_ref_age_seconds)
        rows = session.query(PriceRef).filter(
            PriceRef.market_hash_name == name, PriceRef.updated_at >= cutoff
        ).all()
        return {r.venue: PriceReference(venue=r.venue, game=r.game,
                                        market_hash_name=r.market_hash_name,
                                        price_cents=r.price_cents, quantity=r.quantity)
                for r in rows}

    def _record_deal(self, listing: MarketListing, candidate) -> bool:
        """Insert a Deal row; returns False if this listing was already seen."""
        buy_adapter = self.adapters.get(listing.venue)
        auto_buyable = bool(buy_adapter and buy_adapter.can_buy and buy_adapter.cfg.buy_enabled)
        with self.session_factory() as session:
            deal = Deal(
                buy_venue=listing.venue, listing_id=listing.listing_id, game=listing.game,
                market_hash_name=listing.market_hash_name,
                buy_price_cents=listing.price_cents, float_value=listing.float_value,
                ref_venue=candidate.ref_venue, ref_price_cents=candidate.ref_price_cents,
                est_net_proceeds_cents=candidate.est_net_proceeds_cents,
                est_profit_cents=candidate.est_profit_cents, margin_pct=candidate.margin_pct,
                status="pending" if auto_buyable else "alert_only",
            )
            session.add(deal)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                return False
        return True

    async def scan_loop(self, venue: str) -> None:
        adapter = self.adapters[venue]
        while True:
            for game in self.app.games:
                try:
                    listings = await adapter.scan_listings(game)
                except Exception:
                    log.exception("%s listing scan failed for %s", venue, game)
                    continue
                with self.session_factory() as session:
                    candidates = []
                    for listing in listings:
                        refs = self._load_refs(session, listing.market_hash_name)
                        cand = evaluate_listing(listing, refs, self.app, self.sellable_venues)
                        if cand:
                            candidates.append((listing, cand))
                for listing, cand in candidates:
                    if self._record_deal(listing, cand):
                        await self.notifier.send(
                            f"**{listing.market_hash_name}**",
                            kind="deal", title="💡 Deal found",
                            fields=[
                                ("Buy", f"{fmt_usd(listing.price_cents)} on {listing.venue}"),
                                ("Sells for", f"~{fmt_usd(cand.ref_price_cents)} on {cand.ref_venue}"),
                                ("Est. profit", f"{fmt_usd(cand.est_profit_cents)} "
                                                f"({cand.margin_pct:.1f}%)"),
                            ],
                        )
            await asyncio.sleep(adapter.cfg.poll_seconds)

    def tasks(self) -> list:
        coros = []
        for name, adapter in self.adapters.items():
            if not adapter.cfg.enabled:
                continue
            if adapter.can_reference and adapter.fetch_references.__qualname__ != \
                    "MarketAdapter.fetch_references":
                coros.append(self.reference_loop(name))
            if adapter.can_scan_listings:
                coros.append(self.scan_loop(name))
        return coros
