# Deployment (AWS EC2 + S3/CloudFront + MongoDB Atlas)

Backend (API + worker + Redis) runs on a single EC2 instance via Docker,
behind host-level Nginx terminating TLS via Let's Encrypt. The frontend is a
static SPA served from S3 through CloudFront — it does not run on EC2 at
all. See [`docs/INFRASTRUCTURE.md`](INFRASTRUCTURE.md) for the full diagram.

## 1. One-time AWS setup

### MongoDB Atlas
- Create a cluster, add the EC2 instance's IP (or VPC) to the Atlas IP access list.
- Create a database user scoped to this app's database only.
- Keep the SRV connection string for `MONGO_URI` — it goes into Secrets Manager (§3), never committed.

### S3 + CloudFront (frontend)
1. Create an S3 bucket (block all public access — CloudFront reaches it via
   an Origin Access Control, not a public bucket policy).
2. Create a CloudFront distribution with that bucket as origin, default
   root object `index.html`.
3. Add a **custom error response**: 403 and 404 → `/index.html`, HTTP 200.
   This is required for a React Router SPA — without it, refreshing on any
   route other than `/` 404s at the CDN before React Router ever loads.
4. Request an ACM certificate (in `us-east-1`, regardless of your other
   resources' region — CloudFront only accepts ACM certs from there) for
   your frontend domain, attach it to the distribution.
5. Point your domain's DNS at the CloudFront distribution.

### EC2 (backend)
1. Launch an EC2 instance (Ubuntu 22.04 LTS, t3.small or larger).
2. Security group: inbound 80/443 open, 22 restricted to your IP (or a
   bastion). **Do not** open port 5000 — the API is only reachable through
   Nginx (see §4).
3. Attach an **IAM instance profile** with a policy granting
   `secretsmanager:GetSecretValue` on the one secret from §3, and
   `logs:CreateLogGroup`/`logs:CreateLogStream`/`logs:PutLogEvents` for the
   CloudWatch log group Docker's `awslogs` driver writes to. This is what
   lets `scripts/fetch-secrets.sh` and container logging work with **no AWS
   access keys stored on the instance at all**.
4. `git clone` this repo (or just copy `docker-compose.prod.yml` +
   `scripts/` + `nginx/`) to the instance, then run:
   ```bash
   ./scripts/setup-ec2.sh
   ```
   Installs Docker, Nginx, Certbot, AWS CLI; installs the Nginx site config.
5. Point your API domain's DNS A record at the instance's public IP.
6. `./scripts/setup-ssl.sh api.yourdomain.com you@yourdomain.com` — obtains
   a Let's Encrypt cert and reconfigures Nginx for HTTPS (see
   `nginx/app.conf`'s comment for exactly what this changes).

## 2. AWS Secrets Manager

All of `server/.env`'s real values live in **one** Secrets Manager secret,
not on disk permanently:

```bash
aws secretsmanager create-secret \
  --name ai-mail-assistant/production \
  --secret-string '{
    "NODE_ENV": "production",
    "PORT": "5000",
    "CLIENT_URL": "https://app.yourdomain.com",
    "API_BASE_URL": "https://api.yourdomain.com",
    "MONGO_URI": "mongodb+srv://...",
    "REDIS_URL": "redis://redis:6379",
    "JWT_ACCESS_SECRET": "...",
    "JWT_REFRESH_SECRET": "...",
    "ENCRYPTION_KEY": "...",
    "GOOGLE_CLIENT_ID": "...",
    "GOOGLE_CLIENT_SECRET": "...",
    "GOOGLE_REDIRECT_URI": "https://api.yourdomain.com/api/v1/auth/google/callback",
    "GEMINI_API_KEY": "...",
    "GEMINI_MODEL": "gemini-3.5-flash-lite",
    "GEMINI_EMBEDDING_MODEL": "gemini-embedding-001",
    "MONGO_ATLAS_VECTOR_SEARCH_ENABLED": "true",
    "WORKER_CONCURRENCY": "5"
  }'
```

`scripts/fetch-secrets.sh` pulls this and writes `server/.env` fresh on
**every** deploy (see `scripts/deploy-backend.sh`) — the file on disk is
generated, never hand-edited on the host. To rotate a secret: update it in
Secrets Manager, then redeploy (or just re-run `fetch-secrets.sh` +
`docker compose up -d` to pick it up without a full deploy).

## 3. Reverse proxy, PM2, process model

- **Nginx** (host-level, not containerized) terminates TLS and proxies
  `/api/v1/*` and `/health` to the API container on `127.0.0.1:5000`. See
  `nginx/app.conf`.
- **PM2** runs *inside* each container (`pm2-runtime`, not plain `node`) —
  the API container runs it in cluster mode (one process per CPU core), the
  worker container runs it in fork mode (single instance; BullMQ
  concurrency is controlled by `WORKER_CONCURRENCY`, not PM2 clustering).
  See `server/ecosystem.config.js`.
- **Docker** (`docker-compose.prod.yml`) is what actually runs the
  containers and restarts them on crash/reboot (`restart: always`) — PM2's
  own restart behavior and Docker's operate at different layers and don't
  conflict (PM2 restarts a crashed *process* inside a healthy container;
  Docker restarts a crashed *container*).

## 4. CI/CD flow

1. Push to `main` → `ci.yml` runs lint/typecheck/test/build for both
   workspaces, plus a job that verifies both Docker images actually build
   (this exists because they silently didn't for a while — see
   `server/Dockerfile`'s top comment).
2. On CI success, `cd.yml` runs three jobs:
   - **build-and-push-server**: builds the server image, pushes to GHCR
     tagged with the commit SHA and `latest`.
   - **deploy-backend**: copies `docker-compose.prod.yml` + `scripts/` to
     the EC2 host over SSH, then runs `scripts/deploy-backend.sh <sha>`
     there — which fetches fresh secrets, pulls the new image, restarts via
     Docker Compose, and waits for `/health/ready` before finishing.
   - **deploy-frontend**: builds the client (plain `npm run build`, no
     Docker), syncs `client/dist` to S3, invalidates the CloudFront cache.
     Runs independently of the backend deploy — a frontend-only change
     doesn't wait on an EC2 SSH round-trip.

## 5. Required GitHub configuration

Create a `production` **environment** in the repo's Settings → Environments
(both jobs below reference `environment: production` — this is also where
you'd add required reviewers/approval gates if you want them).

| Secret | Used by | Purpose |
|---|---|---|
| `EC2_HOST` | deploy-backend | Public IP/DNS of the EC2 instance |
| `EC2_USER` | deploy-backend | SSH user (e.g. `ubuntu`) |
| `EC2_SSH_KEY` | deploy-backend | Private key for SSH access |
| `AWS_DEPLOY_ROLE_ARN` | deploy-frontend | IAM role ARN for OIDC federation (see below) |
| `AWS_REGION` | deploy-frontend | e.g. `us-east-1` |
| `S3_BUCKET` | deploy-frontend | Frontend bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | deploy-frontend | For cache invalidation |
| `VITE_API_BASE_URL` | deploy-frontend | Public API URL baked into the client build, e.g. `https://api.yourdomain.com/api/v1` |

`GITHUB_TOKEN` (built-in) authenticates pushes to GHCR — no extra secret needed.

### Why OIDC instead of AWS access keys for the frontend deploy

`deploy-frontend` uses `aws-actions/configure-aws-credentials` with
`role-to-assume`, not static `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
secrets. This is a deliberate security choice: OIDC federation means
GitHub Actions gets short-lived, automatically-expiring credentials scoped
to exactly this repo, rather than a long-lived key pair sitting in GitHub
Secrets that has to be manually rotated and, if ever leaked, works
indefinitely. One-time setup:

1. In IAM, add GitHub as an OIDC identity provider
   (`token.actions.githubusercontent.com`) — see
   [AWS's guide](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html).
2. Create an IAM role with a trust policy scoped to
   `repo:<your-org>/<your-repo>:ref:refs/heads/main` (not `*` — restrict it
   to this repo and branch), and a permissions policy granting
   `s3:PutObject`/`s3:DeleteObject`/`s3:ListBucket` on the frontend bucket
   and `cloudfront:CreateInvalidation` on the distribution.
3. Put that role's ARN in `AWS_DEPLOY_ROLE_ARN`.

## 6. Rollback

Every server image is tagged with its commit SHA, not just `latest`:

```bash
ssh <ec2-host>
cd ~/ai-mail-assistant
export SERVER_IMAGE_REPO=ghcr.io/<repo>/server
./scripts/deploy-backend.sh <previous-sha>
```

For the frontend, redeploy the previous commit (`git checkout <sha> &&
./scripts/deploy-frontend.sh`) — there's no image tag to roll back to since
it isn't Docker-based, just a rebuild-and-resync of that commit's source.

## 7. Local development

None of the above applies to local dev — that's still
`docker compose up -d mongo redis` + `npm run dev` per `README.md`, or
`docker compose up --build` for a fully-Dockerized local stack (which does
still include a `client` service, unlike production — see
`docker-compose.yml`'s comments).
