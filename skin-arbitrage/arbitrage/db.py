"""Persistence layer. Shared Postgres in two-server mode, SQLite for dev."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Integer,
    String,
    UniqueConstraint,
    create_engine,
    func,
    select,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Base(DeclarativeBase):
    pass


class PriceRef(Base):
    """Lowest ask per (venue, item), refreshed by the scanner role."""

    __tablename__ = "price_refs"
    __table_args__ = (UniqueConstraint("venue", "market_hash_name", name="uq_ref_venue_name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    venue: Mapped[str] = mapped_column(String(32), index=True)
    game: Mapped[str] = mapped_column(String(8), index=True)
    market_hash_name: Mapped[str] = mapped_column(String(256), index=True)
    price_cents: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Deal(Base):
    __tablename__ = "deals"
    __table_args__ = (UniqueConstraint("buy_venue", "listing_id", name="uq_deal_listing"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    buy_venue: Mapped[str] = mapped_column(String(32))
    listing_id: Mapped[str] = mapped_column(String(128))
    game: Mapped[str] = mapped_column(String(8))
    market_hash_name: Mapped[str] = mapped_column(String(256))
    buy_price_cents: Mapped[int] = mapped_column(Integer)
    float_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    ref_venue: Mapped[str] = mapped_column(String(32))
    ref_price_cents: Mapped[int] = mapped_column(Integer)
    est_net_proceeds_cents: Mapped[int] = mapped_column(Integer)
    est_profit_cents: Mapped[int] = mapped_column(Integer)
    margin_pct: Mapped[float] = mapped_column(Float)
    # pending -> bought | simulated | failed | expired | alert_only
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    note: Mapped[str] = mapped_column(String(512), default="")


class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deal_id: Mapped[int] = mapped_column(Integer, index=True)
    venue: Mapped[str] = mapped_column(String(32))
    listing_id: Mapped[str] = mapped_column(String(128))
    game: Mapped[str] = mapped_column(String(8))
    market_hash_name: Mapped[str] = mapped_column(String(256))
    price_cents: Mapped[int] = mapped_column(Integer)
    dry_run: Mapped[bool] = mapped_column(Boolean, default=True)
    purchased_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class InventoryItem(Base):
    __tablename__ = "inventory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    purchase_id: Mapped[int] = mapped_column(Integer, index=True)
    game: Mapped[str] = mapped_column(String(8))
    market_hash_name: Mapped[str] = mapped_column(String(256))
    cost_cents: Mapped[int] = mapped_column(Integer)
    dry_run: Mapped[bool] = mapped_column(Boolean, default=True)
    # pending_delivery -> held -> listed -> sold
    status: Mapped[str] = mapped_column(String(24), default="pending_delivery", index=True)
    sell_venue: Mapped[str] = mapped_column(String(32), default="")
    sell_asset_id: Mapped[str] = mapped_column(String(128), default="")
    sell_listing_id: Mapped[str] = mapped_column(String(128), default="")
    list_price_cents: Mapped[int] = mapped_column(Integer, default=0)
    listed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sold_price_cents: Mapped[int] = mapped_column(Integer, default=0)
    sold_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


def make_session_factory(database_url: str) -> sessionmaker[Session]:
    engine = create_engine(database_url, pool_pre_ping=True, future=True)
    Base.metadata.create_all(engine)
    return sessionmaker(engine, expire_on_commit=False)


def spent_today_cents(session: Session, dry_run: bool) -> int:
    day_start = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    total = session.execute(
        select(func.coalesce(func.sum(Purchase.price_cents), 0)).where(
            Purchase.purchased_at >= day_start, Purchase.dry_run == dry_run
        )
    ).scalar_one()
    return int(total)


def open_position_count(session: Session, dry_run: bool) -> int:
    total = session.execute(
        select(func.count(InventoryItem.id)).where(
            InventoryItem.status.in_(("pending_delivery", "held", "listed")),
            InventoryItem.dry_run == dry_run,
        )
    ).scalar_one()
    return int(total)
