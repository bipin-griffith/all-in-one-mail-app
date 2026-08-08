#!/usr/bin/env bash
# Pulls production secrets from AWS Secrets Manager and writes server/.env.
# Run this on the EC2 host itself (as part of every deploy — see cd.yml),
# not on your laptop or in GitHub Actions: it relies on the EC2 instance's
# IAM instance profile for AWS credentials (no access keys stored anywhere),
# which only works when actually running on that instance.
#
# Expects a single secret containing a flat JSON object of env var name ->
# value, e.g.:
#   {
#     "MONGO_URI": "mongodb+srv://...",
#     "JWT_ACCESS_SECRET": "...",
#     "OPENAI_API_KEY": "...",
#     ...
#   }
# Create it once with:
#   aws secretsmanager create-secret --name ai-mail-assistant/production \
#     --secret-string file://server/.env.example  # then edit values for real
#
# Usage: ./scripts/fetch-secrets.sh [secret-name] [aws-region]
set -euo pipefail

SECRET_NAME="${1:-${SECRETS_MANAGER_SECRET_NAME:-ai-mail-assistant/production}}"
AWS_REGION="${2:-${AWS_REGION:-us-east-1}}"
OUTPUT_PATH="$(dirname "$0")/../server/.env"

command -v jq >/dev/null || { echo "jq is required (sudo apt-get install -y jq)"; exit 1; }

echo "==> Fetching secret '$SECRET_NAME' from Secrets Manager ($AWS_REGION)"
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_NAME" \
  --region "$AWS_REGION" \
  --query SecretString \
  --output text)

echo "==> Writing $OUTPUT_PATH"
# Overwrites entirely on every deploy — server/.env is generated, not
# hand-edited on the host. If you need a value that isn't in Secrets
# Manager yet, add it there, not directly on the box (it'll be wiped on the
# next deploy).
umask 077 # server/.env must not be world/group-readable — it holds live secrets
echo "$SECRET_JSON" | jq -r 'to_entries[] | "\(.key)=\(.value)"' > "$OUTPUT_PATH"

echo "==> Done ($(wc -l < "$OUTPUT_PATH" | tr -d ' ') vars written)"
