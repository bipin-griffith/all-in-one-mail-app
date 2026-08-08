#!/usr/bin/env bash
# Deploys the backend (server + worker + redis) on THIS host — run on the
# EC2 instance itself, either by cd.yml over SSH or manually for an
# emergency/rollback deploy. Not something you run from your laptop against
# a remote host (it assumes it's already sitting in ~/ai-mail-assistant with
# docker-compose.prod.yml present and Docker already logged into the registry).
#
# Usage: ./scripts/deploy-backend.sh <image-tag>
# e.g.:  ./scripts/deploy-backend.sh a1b2c3d      (a specific commit)
#        ./scripts/deploy-backend.sh latest       (most recent main build)
#
# To roll back, just re-run with a previous commit's short SHA — every
# image is tagged with one, not just `latest` (see cd.yml).
set -euo pipefail

TAG="${1:?Usage: deploy-backend.sh <image-tag>}"
IMAGE_REPO="${SERVER_IMAGE_REPO:?Set SERVER_IMAGE_REPO, e.g. ghcr.io/you/ai-mail-assistant/server}"

cd ~/ai-mail-assistant

echo "==> Refreshing secrets from AWS Secrets Manager"
./scripts/fetch-secrets.sh

echo "==> Pulling ${IMAGE_REPO}:${TAG}"
export SERVER_IMAGE="${IMAGE_REPO}:${TAG}"
docker compose -f docker-compose.prod.yml pull

echo "==> Restarting services"
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "==> Waiting for the API to report healthy"
for _ in $(seq 1 20); do
  if curl -sf http://127.0.0.1:5000/health/ready >/dev/null; then
    echo "    Ready."
    break
  fi
  sleep 3
done

echo "==> Pruning old images"
docker image prune -f

echo "==> Done — deployed ${SERVER_IMAGE}"
