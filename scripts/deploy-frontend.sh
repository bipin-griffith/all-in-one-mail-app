#!/usr/bin/env bash
# Builds the React app and deploys it to S3 + CloudFront. Runs in CI
# (.github/workflows/cd.yml) but is also safe to run from a laptop with the
# right AWS credentials/profile for a manual/emergency deploy.
#
# Usage: S3_BUCKET=my-bucket CLOUDFRONT_DISTRIBUTION_ID=E123 \
#        VITE_API_BASE_URL=https://api.yourdomain.com/api/v1 \
#        ./scripts/deploy-frontend.sh
set -euo pipefail

: "${S3_BUCKET:?Set S3_BUCKET}"
: "${CLOUDFRONT_DISTRIBUTION_ID:?Set CLOUDFRONT_DISTRIBUTION_ID}"
: "${VITE_API_BASE_URL:?Set VITE_API_BASE_URL}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Building client (VITE_API_BASE_URL=$VITE_API_BASE_URL)"
(cd "$ROOT_DIR" && npm ci && VITE_API_BASE_URL="$VITE_API_BASE_URL" npm run build --workspace=client)

echo "==> Syncing to s3://$S3_BUCKET"
# --delete removes files in the bucket that no longer exist in the new
# build (stale hashed JS/CSS chunks from old builds) — safe because this
# bucket should only ever hold this one SPA's build output, nothing else.
#
# Two-pass upload with different cache policies:
#   1. Hashed, content-addressed assets (JS/CSS/images under /assets) are
#      immutable — once built, that exact filename's content never changes
#      (Vite hashes the filename itself), so they're safe to cache for a year.
#   2. index.html is NOT hashed and MUST be revalidated on every request —
#      it's what references the current build's hashed asset filenames, so
#      caching it would pin users to an old build indefinitely.
aws s3 sync "$ROOT_DIR/client/dist" "s3://$S3_BUCKET" \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"

aws s3 cp "$ROOT_DIR/client/dist/index.html" "s3://$S3_BUCKET/index.html" \
  --cache-control "no-cache, must-revalidate"

echo "==> Invalidating CloudFront cache"
aws cloudfront create-invalidation \
  --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
  --paths "/index.html" "/"

echo "==> Done"
