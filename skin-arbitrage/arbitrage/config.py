"""Configuration loading: YAML file + environment variable overrides."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

import yaml
from dotenv import load_dotenv

GAMES = ("cs2", "rust")
STEAM_APP_IDS = {"cs2": 730, "rust": 252490}


@dataclass
class StrategyConfig:
    min_margin_pct: float = 8.0
    min_profit_cents: int = 50
    min_item_price_cents: int = 100
    max_item_price_cents: int = 15000
    daily_budget_cents: int = 20000
    max_open_positions: int = 25
    reference_safety_pct: float = 3.0
    min_reference_quantity: int = 3
    max_ref_age_seconds: int = 900
    relist_undercut_cents: int = 1
    min_markup_over_cost_pct: float = 4.0
    reprice_interval_seconds: int = 300


@dataclass
class MarketConfig:
    enabled: bool = False
    buy_enabled: bool = False
    sell_enabled: bool = False
    fee_pct: float = 10.0
    poll_seconds: int = 60
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class AppConfig:
    dry_run: bool = True
    role: str = "all"  # scanner | trader | all
    games: list[str] = field(default_factory=lambda: ["cs2", "rust"])
    currency: str = "USD"
    database_url: str = "sqlite:///arbitrage.db"
    watchlist: list[str] = field(default_factory=list)
    blacklist_substrings: list[str] = field(default_factory=lambda: ["Souvenir"])
    summary_interval_minutes: int = 60
    strategy: StrategyConfig = field(default_factory=StrategyConfig)
    markets: dict[str, MarketConfig] = field(default_factory=dict)
    # secrets (env only)
    csfloat_api_key: str = ""
    dmarket_public_key: str = ""
    dmarket_secret_key: str = ""
    discord_webhook_url: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""


def load_config(path: str = "config.yaml") -> AppConfig:
    load_dotenv()
    raw: dict[str, Any] = {}
    if os.path.exists(path):
        with open(path) as f:
            raw = yaml.safe_load(f) or {}

    cfg = AppConfig()
    for key in ("dry_run", "role", "games", "currency", "watchlist", "blacklist_substrings"):
        if key in raw:
            setattr(cfg, key, raw[key])

    notif = raw.get("notifications", {})
    if "summary_interval_minutes" in notif:
        cfg.summary_interval_minutes = int(notif["summary_interval_minutes"])

    strat = raw.get("strategy", {})
    for key, value in strat.items():
        if hasattr(cfg.strategy, key):
            setattr(cfg.strategy, key, value)

    for name, mraw in (raw.get("markets") or {}).items():
        mc = MarketConfig()
        for key in ("enabled", "buy_enabled", "sell_enabled", "fee_pct", "poll_seconds"):
            if key in mraw:
                setattr(mc, key, mraw[key])
        mc.extra = {k: v for k, v in mraw.items() if not hasattr(mc, k)}
        cfg.markets[name] = mc

    # Environment overrides / secrets
    cfg.database_url = os.getenv("DATABASE_URL", raw.get("database_url", cfg.database_url))
    if os.getenv("DRY_RUN") is not None:
        cfg.dry_run = os.getenv("DRY_RUN", "true").lower() not in ("0", "false", "no")
    cfg.role = os.getenv("ROLE", cfg.role)
    cfg.csfloat_api_key = os.getenv("CSFLOAT_API_KEY", "")
    cfg.dmarket_public_key = os.getenv("DMARKET_PUBLIC_KEY", "")
    cfg.dmarket_secret_key = os.getenv("DMARKET_SECRET_KEY", "")
    cfg.discord_webhook_url = os.getenv("DISCORD_WEBHOOK_URL", "")
    cfg.telegram_bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    cfg.telegram_chat_id = os.getenv("TELEGRAM_CHAT_ID", "")

    if cfg.role not in ("scanner", "trader", "all"):
        raise ValueError(f"Invalid role: {cfg.role}")
    cfg.games = [g for g in cfg.games if g in GAMES]
    return cfg
