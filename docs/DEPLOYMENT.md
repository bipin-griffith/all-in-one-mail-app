# Deployment (AWS EC2 + MongoDB Atlas)

## One-time EC2 setup

1. Launch an EC2 instance (Ubuntu 22.04 LTS, t3.small or larger), open inbound ports 80/443 (and 22 restricted to your IP).
2. Install Docker + the Compose plugin:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   sudo apt install -y docker-compose-plugin
   ```
3. `mkdir ~/ai-mail-assistant`
4. Create `~/ai-mail-assistant/server/.env` on the host (copy from `server/.env.example`, fill real secrets: `MONGO_URI` pointing at your Atlas cluster, `JWT_*`, `ENCRYPTION_KEY`, Google OAuth creds, `OPENAI_API_KEY`). This file is **never** committed — CD only ships `docker-compose.prod.yml`, not secrets.
5. Put a reverse proxy (Nginx or an ALB) in front of the host for TLS termination if not already using an ALB — the containers themselves speak plain HTTP.

## MongoDB Atlas

- Create a free/shared or dedicated cluster, add the EC2 instance's IP (or the whole VPC) to the Atlas IP access list.
- Create a database user scoped to the app's database only (not the Atlas org admin).
- Copy the SRV connection string into `MONGO_URI` in `server/.env`.

## CI/CD flow (`.github/workflows/ci.yml` + `cd.yml`)

1. Push to `main` → `ci.yml` runs lint/typecheck/test/build/audit for both `server` and `client`.
2. On CI success, `cd.yml` builds and pushes Docker images to GHCR (`ghcr.io/<repo>/server`, `ghcr.io/<repo>/client`), tagged with the short commit SHA and `latest`.
3. `cd.yml` copies `docker-compose.prod.yml` to the EC2 host and runs `docker compose pull && up -d` over SSH, pointing at the freshly built image tags.

## Required GitHub secrets

| Secret | Purpose |
|---|---|
| `EC2_HOST` | Public IP/DNS of the EC2 instance |
| `EC2_USER` | SSH user (e.g. `ubuntu`) |
| `EC2_SSH_KEY` | Private key for SSH access |
| `VITE_API_BASE_URL` | Public API URL baked into the client build |

`GITHUB_TOKEN` (built-in) authenticates pushes to GHCR — no extra secret needed.

## Rollback

Every image is tagged with its commit SHA, not just `latest`. To roll back:
```bash
ssh <ec2-host>
cd ~/ai-mail-assistant
export SERVER_IMAGE=ghcr.io/<repo>/server:<previous-sha>
export CLIENT_IMAGE=ghcr.io/<repo>/client:<previous-sha>
docker compose -f docker-compose.prod.yml up -d
```
