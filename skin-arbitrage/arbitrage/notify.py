"""Notifications: rich Discord embeds (webhook) + plain-text Telegram.

Discord setup: server -> channel -> Settings -> Integrations -> Webhooks ->
New Webhook -> copy URL into DISCORD_WEBHOOK_URL in .env.
"""
from __future__ import annotations

import datetime as dt
import logging

import aiohttp

log = logging.getLogger("notify")

# Embed colors per event kind
COLORS = {
    "deal": 0x3498DB,      # blue   — opportunity detected
    "buy": 0x2ECC71,       # green  — purchase (real or simulated)
    "sell": 0x9B59B6,      # purple — listed / repriced / sold
    "error": 0xE74C3C,     # red    — failed buy/listing
    "warn": 0xE67E22,      # orange
    "summary": 0x1ABC9C,   # teal   — periodic status report
    "info": 0x95A5A6,      # grey
}


def fmt_usd(cents: int) -> str:
    return f"${cents / 100:,.2f}"


class Notifier:
    def __init__(self, discord_webhook_url: str = "", telegram_bot_token: str = "",
                 telegram_chat_id: str = ""):
        self.discord_webhook_url = discord_webhook_url.strip()
        self.telegram_bot_token = telegram_bot_token.strip()
        self.telegram_chat_id = telegram_chat_id.strip()

    @property
    def configured(self) -> bool:
        return bool(self.discord_webhook_url
                    or (self.telegram_bot_token and self.telegram_chat_id))

    async def send(self, message: str, *, kind: str = "info", title: str | None = None,
                   fields: list[tuple[str, str]] | None = None) -> bool:
        """message: plain-text body (used verbatim for Telegram/logs).
        title/fields: extra structure for the Discord embed.
        Returns True if every configured channel accepted the message."""
        log.info("NOTIFY[%s]: %s", kind, message)
        ok = True
        try:
            async with aiohttp.ClientSession() as http:
                if self.discord_webhook_url:
                    async with http.post(
                        self.discord_webhook_url,
                        json=self._discord_payload(message, kind, title, fields),
                    ) as resp:
                        if resp.status >= 300:
                            ok = False
                            log.warning("discord webhook rejected message: HTTP %s %s",
                                        resp.status, (await resp.text())[:300])
                if self.telegram_bot_token and self.telegram_chat_id:
                    text = message
                    if fields:
                        text += "\n" + "\n".join(f"{k}: {v}" for k, v in fields)
                    async with http.post(
                        f"https://api.telegram.org/bot{self.telegram_bot_token}/sendMessage",
                        json={"chat_id": self.telegram_chat_id, "text": text[:4000]},
                    ) as resp:
                        if resp.status >= 300:
                            ok = False
                            log.warning("telegram rejected message: HTTP %s %s",
                                        resp.status, (await resp.text())[:300])
        except Exception:
            log.exception("notification delivery failed")
            return False
        return ok

    def _discord_payload(self, message: str, kind: str, title: str | None,
                         fields: list[tuple[str, str]] | None) -> dict:
        embed = {
            "description": message[:4000],
            "color": COLORS.get(kind, COLORS["info"]),
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        if title:
            embed["title"] = title[:250]
        if fields:
            embed["fields"] = [
                {"name": str(name)[:250], "value": str(value)[:1000], "inline": True}
                for name, value in fields[:25]
            ]
        return {"username": "Skin Arbitrage Bot", "embeds": [embed]}
