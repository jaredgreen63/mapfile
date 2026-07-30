"""Deal / trade notifications via Discord webhook and/or Telegram."""
from __future__ import annotations

import logging

import aiohttp

log = logging.getLogger("notify")


class Notifier:
    def __init__(self, discord_webhook_url: str = "", telegram_bot_token: str = "",
                 telegram_chat_id: str = ""):
        self.discord_webhook_url = discord_webhook_url
        self.telegram_bot_token = telegram_bot_token
        self.telegram_chat_id = telegram_chat_id

    async def send(self, message: str) -> None:
        log.info("NOTIFY: %s", message)
        try:
            async with aiohttp.ClientSession() as http:
                if self.discord_webhook_url:
                    await http.post(self.discord_webhook_url, json={"content": message[:1900]})
                if self.telegram_bot_token and self.telegram_chat_id:
                    await http.post(
                        f"https://api.telegram.org/bot{self.telegram_bot_token}/sendMessage",
                        json={"chat_id": self.telegram_chat_id, "text": message[:4000]},
                    )
        except Exception:
            log.exception("notification delivery failed")


def fmt_usd(cents: int) -> str:
    return f"${cents / 100:,.2f}"
