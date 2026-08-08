#!/usr/bin/env bash
# One-time provisioning for a fresh EC2 instance (Ubuntu 22.04 LTS assumed).
# Run this ONCE per instance, as the ubuntu user with sudo, before the first
# deploy. Idempotent-ish: safe to re-run, but not designed to "converge" a
# drifted instance the way a real config-management tool (Ansible, etc.)
# would — see docs/PRODUCTION_READINESS.md for that tradeoff.
#
# Usage: ./scripts/setup-ec2.sh
set -euo pipefail

echo "==> Updating packages"
sudo apt-get update -y
sudo apt-get upgrade -y

echo "==> Installing Docker + Compose plugin"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "    Docker installed. Log out and back in for group membership to take effect."
fi
sudo apt-get install -y docker-compose-plugin

echo "==> Installing Nginx + Certbot"
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Installing AWS CLI (needed by fetch-secrets.sh and deploy-frontend.sh)"
if ! command -v aws &>/dev/null; then
  curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  (cd /tmp && unzip -q awscliv2.zip && sudo ./aws/install)
  rm -rf /tmp/awscliv2.zip /tmp/aws
fi

echo "==> Creating app directory"
mkdir -p ~/ai-mail-assistant/server

echo "==> Installing Nginx site config (HTTP only — run setup-ssl.sh next)"
sudo mkdir -p /etc/nginx/snippets
sudo cp "$(dirname "$0")/../nginx/proxy-headers.conf" /etc/nginx/snippets/proxy-headers.conf
sudo cp "$(dirname "$0")/../nginx/app.conf" /etc/nginx/sites-available/app.conf
sudo ln -sf /etc/nginx/sites-available/app.conf /etc/nginx/sites-enabled/app.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "==> Configuring firewall (ufw)"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full' # 80 + 443
sudo ufw --force enable

cat <<'EOF'

==> Done. Next steps:
  1. Point your domain's DNS A record at this instance's public IP.
  2. Run ./scripts/setup-ssl.sh <your-domain> <your-email> to obtain a
     Let's Encrypt certificate (must happen AFTER DNS is pointing here —
     Certbot's HTTP-01 challenge needs to reach this instance by domain name).
  3. Configure server/.env — either manually, or via ./scripts/fetch-secrets.sh
     if you're using AWS Secrets Manager (recommended — see docs/DEPLOYMENT.md).
  4. Deploy: docker compose -f docker-compose.prod.yml up -d
EOF
