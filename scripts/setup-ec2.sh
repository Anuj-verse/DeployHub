#!/usr/bin/env bash
# One-time setup on a fresh Ubuntu 22.04 VM (EC2): Docker, Node 20, k3s (Kubernetes), pm2, project deps, .env.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Installing packages"
sudo apt-get update -y
sudo apt-get install -y docker.io git curl ca-certificates openssl
sudo usermod -aG docker "$USER"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2

echo "==> Installing k3s (lightweight Kubernetes)"
if ! command -v k3s >/dev/null; then curl -sfL https://get.k3s.io | sh -; fi
mkdir -p "$HOME/.kube"
sudo cp /etc/rancher/k3s/k3s.yaml "$HOME/.kube/config"
sudo chown "$USER" "$HOME/.kube/config"
chmod 600 "$HOME/.kube/config"

echo "==> Installing project dependencies"
npm install --omit=dev --no-audit --no-fund

echo "==> Preparing .env"
[ -f .env ] || cp .env.example .env
setkv() { # setkv KEY VALUE  (replace the line, or append it)
  if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi
}
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" || true)
IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || true)
[ -n "$IP" ] || IP=$(curl -s https://checkip.amazonaws.com | tr -d '[:space:]')
grep -qE '^SESSION_SECRET=(change-me.*|)$' .env && setkv SESSION_SECRET "$(openssl rand -hex 32)"
grep -qE '^WEBHOOK_SECRET=(change-me.*|)$' .env && setkv WEBHOOK_SECRET "$(openssl rand -hex 20)"
setkv BASE_URL "http://$IP:3000"
setkv LOCAL_HOST "$IP"
setkv CLUSTER_MODE "local"

cat <<MSG

Setup done. Public IP detected: $IP
Next:
  1. Edit .env and fill GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, DOCKER_USER, DOCKER_PASS (and ALLOWED_GITHUB_USERS if you want)
  2. In your GitHub OAuth App set the callback URL to: http://$IP:3000/auth/callback
  3. Log out and back in (docker group), then run:  bash scripts/start.sh
MSG
