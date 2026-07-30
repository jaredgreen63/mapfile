"""Entry point. Roles:

  scanner — refresh price references + scan listings + detect deals
  trader  — execute buys (executor) + list/reprice inventory (relister)
  all     — everything in one process (single-server / dev mode)

Two-server layout: server A runs `ROLE=scanner`, server B runs `ROLE=trader`,
both pointed at the same DATABASE_URL (Postgres).
"""
from __future__ import annotations

import argparse
import asyncio
import logging

import aiohttp

from .config import AppConfig, load_config
from .db import make_session_factory
from .engine.executor import Executor
from .engine.relister import Relister
from .engine.reporter import Reporter
from .engine.scanner import Scanner
from .markets.base import MarketAdapter
from .markets.csfloat import CSFloatAdapter
from .markets.dmarket import DMarketAdapter
from .markets.skinport import SkinportAdapter
from .markets.steam import SteamAdapter
from .notify import Notifier

log = logging.getLogger("main")

ADAPTER_CLASSES = {
    "csfloat": CSFloatAdapter,
    "skinport": SkinportAdapter,
    "dmarket": DMarketAdapter,
    "steam": SteamAdapter,
}


def build_adapters(app: AppConfig, http: aiohttp.ClientSession) -> dict[str, MarketAdapter]:
    adapters: dict[str, MarketAdapter] = {}
    for name, cls in ADAPTER_CLASSES.items():
        mcfg = app.markets.get(name)
        if mcfg is None or not mcfg.enabled:
            continue
        adapters[name] = cls(app, mcfg, http)
    return adapters


async def test_notify(app: AppConfig) -> bool:
    """Send a test message to every configured channel and report the result."""
    notifier = Notifier(app.discord_webhook_url, app.telegram_bot_token, app.telegram_chat_id)
    if not notifier.configured:
        print("NOT CONFIGURED: neither DISCORD_WEBHOOK_URL nor "
              "TELEGRAM_BOT_TOKEN+TELEGRAM_CHAT_ID is set in the environment.\n"
              "The bot reads these from .env — after editing it, containers must "
              "be recreated (docker compose up -d), not just restarted.")
        return False
    ok = await notifier.send(
        "If you can read this, notifications are working. 🎉",
        kind="summary", title="🔔 Test notification",
        fields=[("Discord", "configured" if notifier.discord_webhook_url else "—"),
                ("Telegram", "configured" if notifier.telegram_bot_token else "—")],
    )
    print("OK — check your channel" if ok
          else "FAILED — a channel rejected the message; see the log line above "
               "(bad webhook URL, deleted webhook, or wrong chat id).")
    return ok


async def run(app: AppConfig) -> None:
    session_factory = make_session_factory(app.database_url)
    notifier = Notifier(app.discord_webhook_url, app.telegram_bot_token, app.telegram_chat_id)
    if not notifier.configured:
        log.warning("no notification channels configured — deals will only appear "
                    "in these logs (set DISCORD_WEBHOOK_URL in .env)")

    async with aiohttp.ClientSession() as http:
        adapters = build_adapters(app, http)
        if not adapters:
            raise SystemExit("No markets enabled — check config.yaml")
        log.info("role=%s dry_run=%s markets=%s games=%s",
                 app.role, app.dry_run, sorted(adapters), app.games)
        if not app.dry_run:
            log.warning("*** LIVE MODE — real money will be spent ***")

        tasks = []
        if app.role in ("scanner", "all"):
            tasks += Scanner(app, adapters, session_factory, notifier).tasks()
        if app.role in ("trader", "all"):
            tasks.append(Executor(app, adapters, session_factory, notifier).run())
            tasks.append(Relister(app, adapters, session_factory, notifier).run())
            tasks.append(Reporter(app, session_factory, notifier).run())
        if not tasks:
            raise SystemExit(f"Role {app.role} produced no tasks")
        await asyncio.gather(*tasks)


def main() -> None:
    parser = argparse.ArgumentParser(description="CS2/Rust skin arbitrage bot")
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--role", choices=["scanner", "trader", "all"])
    parser.add_argument("--live", action="store_true",
                        help="disable dry-run (spends real money)")
    parser.add_argument("--test-notify", action="store_true",
                        help="send a test notification to Discord/Telegram and exit")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )
    app = load_config(args.config)
    if args.role:
        app.role = args.role
    if args.live:
        app.dry_run = False

    if args.test_notify:
        raise SystemExit(0 if asyncio.run(test_notify(app)) else 1)

    try:
        asyncio.run(run(app))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
