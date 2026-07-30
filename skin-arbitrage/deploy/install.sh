#!/usr/bin/env bash
# One-shot installer for the skin arbitrage bot on Ubuntu 22.04.
# Run from the repo after cloning:  bash skin-arbitrage/deploy/install.sh
#
# Installs Docker (official repo), generates .env with a random Postgres
# password, copies the default config, and starts the single-server stack
# (ROLE=all) in DRY RUN mode. Add API keys to deploy/.env afterwards.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR"

echo "==> Installing Docker (if missing)..."
if ! command -v docker >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
fi
docker --version && docker compose version

echo "==> Writing config (only if not already present)..."
if [ ! -f config.yaml ]; then
    cp ../config.example.yaml config.yaml
    echo "    created deploy/config.yaml (edit to tune strategy/fees)"
fi
if [ ! -f .env ]; then
    PG_PASS="$(head -c 32 /dev/urandom | sha256sum | cut -c1-32)"
    cat > .env <<ENV
DATABASE_URL=postgresql+psycopg2://arb:${PG_PASS}@db:5432/arbitrage
POSTGRES_PASSWORD=${PG_PASS}
ROLE=all
DRY_RUN=true
CSFLOAT_API_KEY=
DMARKET_PUBLIC_KEY=
DMARKET_SECRET_KEY=
DISCORD_WEBHOOK_URL=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ENV
    chmod 600 .env
    echo "    created deploy/.env with a generated Postgres password"
fi

echo "==> Building and starting (single-server stack, DRY RUN)..."
docker compose -f docker-compose.single.yml up -d --build

echo
echo "==> Done. Useful commands (run from $(pwd)):"
echo "    docker compose -f docker-compose.single.yml logs -f bot     # watch it work"
echo "    docker compose -f docker-compose.single.yml restart bot     # after editing .env/config"
echo "    docker compose -f docker-compose.single.yml down            # stop everything"
echo
echo "Next steps:"
echo "  1. Add CSFLOAT_API_KEY (and optionally DMARKET_*) to deploy/.env"
echo "  2. Add DISCORD_WEBHOOK_URL to deploy/.env for notifications"
echo "  3. Restart the bot, watch dry-run deals for a few days"
echo "  4. Only then set DRY_RUN=false to go live"
