# Skin Arbitrage Bot (CS2 + Rust)

Scans skin marketplaces via their **official APIs**, detects cross-market price
gaps, auto-buys underpriced listings when the post-fee margin clears your
thresholds, and relists them for profit. Designed to run split across two
servers (scanner + trader) sharing one Postgres database.

> ⚠️ **Read before going live**
> - Ships with `dry_run: true`. Run it in dry-run for at least a few days and
>   review the simulated deals before flipping to live.
> - Prices move fast; a "deal" can be a scam pattern (weird stickers, fake
>   wear) — the bot only sees name + price + float. Start with a small daily
>   budget.
> - Fee percentages in `config.yaml` are **your** responsibility to keep
>   accurate; every venue changes them.
> - Use official APIs and respect each site's terms of service and rate
>   limits. Trading bots that hammer endpoints get banned.
> - Skin prices can drop; profits are not guaranteed. Treat the budget as
>   money you can afford to lose.

## Supported venues

| Venue | Games | Scan deals | Price reference | Auto-buy | Auto-list |
|---|---|---|---|---|---|
| CSFloat | CS2 | ✅ | ✅ (on demand) | ✅ (API key) | ✅ (API key) |
| DMarket | CS2 + Rust | ✅ | ✅ | ✅ (API keys) | 🚧 (needs deposit flow) |
| Skinport | CS2 + Rust | — | ✅ (bulk) | ❌ no public buy API — alerts only | ❌ |
| Steam | CS2 + Rust | — | ✅ (sanity only) | ❌ | ❌ (wallet-locked funds) |

Rust skins have no CSFloat equivalent, so Rust flow is: scan DMarket listings
against Skinport/DMarket references; auto-buy on DMarket once your keys are in.

## How it works

```
┌────────────── Server 1 (scanner) ──────────────┐   ┌───────── Server 2 (trader) ─────────┐
│ reference loops: skinport/dmarket bulk prices  │   │ executor: claims pending deals,     │
│ scan loops: csfloat/dmarket fresh listings     │   │   re-checks budget/positions, buys  │
│ detector: fees + safety haircut + liquidity    │──▶│ relister: lists held inventory,     │
│   → writes deals (pending / alert_only)        │ DB│   undercuts, repricing floor        │
└────────────────────────────────────────────────┘   └─────────────────────────────────────┘
                              shared Postgres (runs on server 1)
```

A deal is created when, for some sell venue:
`ref_price × (1 − safety%) × (1 − fee%) − buy_price ≥ min_profit` **and** the
margin ≥ `min_margin_pct` **and** the sell venue has ≥ `min_reference_quantity`
listings (liquidity), with fresh reference data. The executor re-checks the
daily budget and open-position cap immediately before every buy, and buy
API calls are **never retried** (no double-purchase risk).

## Setup

### 1. Get API keys
- **CSFloat**: profile → developer tab → create API key.
- **DMarket**: account settings → trading API → create ed25519 key pair.
- Optional: a Discord webhook URL and/or Telegram bot for deal alerts.

### Discord notifications
Create a webhook in your Discord server (channel → Settings → Integrations →
Webhooks → New Webhook), copy the URL into `DISCORD_WEBHOOK_URL` in `.env`,
and you'll get color-coded embeds for everything the bot does:

- 💡 **Deal found** (blue) — item, buy price/venue, sell reference, est. profit
- ✅ **Bought** / 🧪 **Dry-run buy** (green) — what was (or would be) purchased
- 📤 **Listed** (purple) — item listed for sale, price vs cost
- ❌ **Buy failed** (red) — venue error details
- 📊 **Status summary** (teal) — posted every `summary_interval_minutes`:
  deals found today, buys and spend vs budget, open positions, items awaiting
  delivery, listed count, and sales/P&L for the day
- 🟢 **Bot online** — on startup, with role and DRY RUN/LIVE mode

The summary is posted by the **trader** role, so in the two-server setup you
get exactly one status stream. Telegram gets the same events as plain text if
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are set.

### 2. Configure
```bash
cd skin-arbitrage
cp config.example.yaml config.yaml   # strategy, fees, markets
cp .env.example .env                 # secrets, DATABASE_URL, ROLE
```

### 3a. Two-server deployment (docker)
Server 1 (scanner + database):
```bash
cd deploy
cp ../config.example.yaml config.yaml && cp ../.env.example .env   # edit both
docker compose -f docker-compose.scanner.yml up -d --build
```
Server 2 (trader) — set `DATABASE_URL` in its `.env` to
`postgresql+psycopg2://arb:<password>@<SERVER1_IP>:5432/arbitrage`:
```bash
cd deploy
docker compose -f docker-compose.trader.yml up -d --build
```
Firewall port 5432 on server 1 so only server 2 can reach it.

### 3b. Single server / local dev
```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python -m arbitrage.main --config config.yaml        # dry run, SQLite, ROLE=all
```

### 4. Going live
1. Watch dry-run deals for a few days (`deals` table + Discord/Telegram alerts).
2. Tighten `min_margin_pct` / budgets to taste.
3. Set `DRY_RUN=false` (or run with `--live`) **on the trader only**.

## Selling / relisting flow

Bought items usually land with a trade hold or need to be moved into the sell
venue's inventory before they can be listed:

1. Purchase recorded → inventory row `status=pending_delivery`.
2. When the item is deliverable/in your sell-venue inventory, set
   `status='held'` and fill `sell_asset_id` (the venue's asset id) on the row.
   (CSFloat sales of items bought on CSFloat can skip the transfer.)
3. The relister lists it at `lowest_ask − undercut`, never below
   `cost × (1 + min_markup_over_cost_pct)`, and keeps repricing every
   `reprice_interval_seconds`.

## Tests
```bash
pip install pytest && python -m pytest tests/ -q
```

## Tuning notes
- `reference_safety_pct` is your main protection against buying into a falling
  price — raise it if you see items that won't sell at the estimated price.
- `min_reference_quantity` filters illiquid items whose "reference price" is
  one wishful listing.
- Skinport reference data is cached 5 minutes server-side; don't lower its
  `poll_seconds` below 300 or you'll burn the rate limit for nothing.
- Verify DMarket's Rust `game_id` (`markets.dmarket.game_ids`) before enabling
  Rust auto-buys; they have changed historically.
