#!/usr/bin/env bash
# Obtains (and sets up auto-renewal for) a Let's Encrypt certificate for the
# Nginx site installed by setup-ec2.sh. Run AFTER DNS for your domain
# already points at this instance — Certbot's HTTP-01 challenge needs to
# reach it over the internet by that domain name.
#
# Usage: ./scripts/setup-ssl.sh api.yourdomain.com you@yourdomain.com
set -euo pipefail

DOMAIN="${1:?Usage: setup-ssl.sh <domain> <email>}"
EMAIL="${2:?Usage: setup-ssl.sh <domain> <email>}"

echo "==> Requesting certificate for $DOMAIN"
# --nginx: Certbot detects the server_name _ block in /etc/nginx/sites-available/app.conf,
# rewrites it to listen on 443 with the new cert, sets server_name to $DOMAIN,
# and adds an HTTP->HTTPS redirect — see nginx/app.conf's comment for why we
# don't hand-write the SSL block ourselves.
sudo certbot --nginx \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  -m "$EMAIL" \
  --redirect

echo "==> Verifying auto-renewal is registered"
sudo certbot renew --dry-run

cat <<EOF

==> Done. $DOMAIN is now served over HTTPS.

One manual step Certbot doesn't do for you — add HSTS to the new 443
server block (/etc/nginx/sites-available/app.conf), inside the
"listen 443 ssl" server block:

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

Then: sudo nginx -t && sudo systemctl reload nginx

Renewal runs automatically via a systemd timer Certbot installs
(check: systemctl list-timers | grep certbot) — no cron setup needed.
EOF
