#!/usr/bin/env bash
# One-shot deploy for Handshake on a Linux host.
# Idempotent: safe to re-run to pull updates and restart.
#
# Run it on the server (via SSH, or in a terminal opened over RDP):
#   curl -fsSL https://raw.githubusercontent.com/tang-vu/handshake/main/scripts/deploy.sh | bash
# or, from a checkout:
#   bash scripts/deploy.sh
#
# Secrets are NEVER baked into this script. The ed25519 signing key is
# generated on the server; CROO credentials are read from an existing .env
# or left as placeholders for you to fill in before switching MODE=real.
set -euo pipefail

REPO_URL="https://github.com/tang-vu/handshake.git"
APP_DIR="${HANDSHAKE_DIR:-$HOME/handshake}"
PORT="${HANDSHAKE_PORT:-8787}"

echo "==> Handshake deploy → $APP_DIR (port $PORT)"

# 1. Fetch or update the source
if [ -d "$APP_DIR/.git" ]; then
  echo "==> Updating existing checkout"
  git -C "$APP_DIR" pull --ff-only
else
  echo "==> Cloning $REPO_URL"
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# 2. Ensure a .env exists (created once, never overwritten)
if [ ! -f .env ]; then
  echo "==> Creating .env from template"
  cp .env.example .env
  # Local dry-run defaults so the service boots immediately; edit for real mode.
  sed -i "s#^PORT=.*#PORT=$PORT#" .env
  sed -i "s#^PUBLIC_BASE_URL=.*#PUBLIC_BASE_URL=http://$(hostname -I | awk '{print $1}'):$PORT#" .env
fi

# 3. Generate the attestation key on first run if still a placeholder
if grep -q '^ED25519_PRIVATE_KEY_HEX=replace_me' .env; then
  echo "==> Generating ed25519 attestation key"
  KEY="$(openssl rand -hex 32)"
  sed -i "s#^ED25519_PRIVATE_KEY_HEX=.*#ED25519_PRIVATE_KEY_HEX=$KEY#" .env
fi

# 4. Run — prefer Docker, fall back to Node
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "==> Deploying with Docker Compose"
  docker compose up -d --build
elif command -v node >/dev/null 2>&1; then
  echo "==> Docker not found; running with Node + pm2/nohup"
  npm ci
  npm run build
  if command -v pm2 >/dev/null 2>&1; then
    pm2 delete handshake 2>/dev/null || true
    pm2 start dist/server.js --name handshake
    pm2 save
  else
    pkill -f 'dist/server.js' 2>/dev/null || true
    mkdir -p data
    nohup node dist/server.js > handshake.log 2>&1 &
    echo "   (started with nohup; logs → $APP_DIR/handshake.log)"
  fi
else
  echo "!! Neither Docker nor Node found. Install one:" >&2
  echo "   Docker: curl -fsSL https://get.docker.com | sh" >&2
  echo "   Node:   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs" >&2
  exit 1
fi

sleep 3
echo "==> Health check"
curl -fsS "http://localhost:$PORT/healthz" && echo
echo "==> Done. Edit $APP_DIR/.env with your CROO credentials, set MODE=real, then re-run this script."
