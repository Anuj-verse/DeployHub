#!/usr/bin/env bash
# Runs preflight, then starts (or restarts) DeployHub under pm2 and enables start-on-boot.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run -s preflight
if pm2 describe deployhub >/dev/null 2>&1; then pm2 restart deployhub --update-env; else pm2 start server.js --name deployhub; fi
pm2 save
sudo env PATH="$PATH" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null || true
echo; pm2 status deployhub
echo "Open: $(grep '^BASE_URL=' .env | cut -d= -f2-)   (health: /healthz)"
