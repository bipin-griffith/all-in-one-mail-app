# Production Readiness Review

An honest checklist: what's actually done and verified, and what's still a
real gap. If you're deciding whether this is safe to point real users at,
read the "Before you launch for real" section at the bottom first.

## What's done

| Area | Status | Notes |
|---|---|---|
| Dockerized frontend/backend/Redis | ✅ | `docker-compose.yml` (dev), `docker-compose.prod.yml` (prod, no frontend container — see below) |
| CI (lint, typecheck, test, build) | ✅ | `.github/workflows/ci.yml`, both workspaces |
| CD (auto-deploy on merge to main) | ✅ | `.github/workflows/cd.yml` |
| Jest unit tests | ✅ | 20 tests across pure-logic modules (mapper, prompts, schema, text extraction, crypto) |
| API integration tests | ✅ | 29 tests against a real in-memory MongoDB (`mongodb-memory-server`) — auth flow, session management, email filtering, dashboard aggregates + cache isolation |
| Health checks | ✅ | `/health` (liveness) + `/health/ready` (Mongo+Redis connectivity) |
| Structured logging | ✅ | Winston JSON to stdout, shipped via Docker's `awslogs` driver — see `docs/OPERATIONS.md` |
| Monitoring | ✅ (basic) | Prometheus `/metrics` + CloudWatch log-based alarms (`scripts/setup-cloudwatch-alarms.sh`) — see "Gaps" below for what this doesn't cover |
| Rate limiting | ✅ | Per-route Redis-backed limits (auth/AI/chat), correctly scoped after a real bug fix — see `docs/OPERATIONS.md` |
| Helmet / CORS / Compression | ✅ | Already present from initial scaffold, unchanged |
| Caching | ✅ | Redis-backed, per-user-scoped, applied to the three dashboard endpoints |
| S3 + CloudFront frontend deploy | ✅ (scripted, unverified against real AWS) | `scripts/deploy-frontend.sh` + `cd.yml` job |
| EC2 + Docker backend deploy | ✅ (scripted, unverified against real AWS) | `scripts/deploy-backend.sh`, `scripts/setup-ec2.sh` |
| Nginx reverse proxy | ✅ (unverified against real AWS) | `nginx/app.conf` + `nginx/proxy-headers.conf` |
| PM2 | ✅ (built and runtime-verified in a local container) | `server/ecosystem.config.js` — cluster mode for API, fork mode for worker |
| Let's Encrypt SSL | ✅ (scripted, unverified against real AWS) | `scripts/setup-ssl.sh` (Certbot + Nginx plugin) |
| AWS Secrets Manager | ✅ (scripted, unverified against real AWS) | `scripts/fetch-secrets.sh`, IAM-instance-profile based (no static keys) |
| CloudWatch logging | ✅ (unverified against real AWS) | `docker-compose.prod.yml`'s `awslogs` log driver |
| Production env vars | ✅ | `server/.env.example`, documented per-var in `docs/DEPLOYMENT.md` §2 |
| Deployment scripts | ✅ | `scripts/*.sh` — all pass `bash -n` syntax check; `fetch-secrets.sh`/`deploy-backend.sh`/`setup-cloudwatch-alarms.sh` haven't run against a real AWS account |
| Infrastructure diagrams | ✅ | `docs/INFRASTRUCTURE.md` (Mermaid, renders natively on GitHub) |

**"Unverified against real AWS" means exactly that** — this session has no
AWS account to deploy into, so anything requiring a real EC2 instance, S3
bucket, CloudFront distribution, or Secrets Manager secret was written
carefully and reviewed, but not exercised end-to-end. Everything that
*could* be verified locally (Docker builds, PM2 process behavior, the full
test suite, the readiness check's actual failure/success branches) was
verified by actually running it, not just reading the code — see "Bugs
found by actually testing" below.

## Bugs found by actually testing this session (not just written, but caught)

Worth listing explicitly, because they're the reason "looks correct" and
"is correct" aren't the same thing:

1. **Both Dockerfiles never actually built.** This is an npm-workspaces
   monorepo with one shared lockfile at the repo root; both Dockerfiles set
   their build context to their own subdirectory, which can never see it.
   `docker build` failed immediately on `npm ci`. Fixed by moving the build
   context to the repo root (`server/Dockerfile`, `client/Dockerfile`,
   `docker-compose.yml`) — and now enforced going forward by a CI job that
   builds both images on every PR.
2. **The readiness check could report "ready" with no database
   connection.** `mongoose.connection.db?.admin().ping()` silently
   short-circuits to `undefined` instead of throwing when never connected.
   Fixed to check `readyState` explicitly first. Caught by a test that
   asserts *both* the healthy and unhealthy branches, not just the
   happy path.
3. **The production logger crashed the app.** File-based Winston
   transports tried to `mkdir` a `logs/` directory the non-root container
   user can't create. Fixed by dropping file transports entirely in favor
   of stdout + Docker's log driver (which is also the architecturally
   correct choice for a container whose filesystem is ephemeral anyway).
4. **CI's own `cache-dependency-path` and per-workspace `npm ci` had the
   same lockfile-location bug as #1.** Fixed alongside it.
5. A test-data bug (a 1-character test user name failing real Zod
   validation) and a rate-limiter/test-isolation issue (integration tests
   across files shared one Redis rate-limit bucket) were also found and
   fixed while getting the test suite green — see `rateLimiter.middleware.ts`'s
   `skip: () => isTest`.

None of these were hypothetical "linter" issues — every one was caught by
actually running `docker build`, actually running the container, or
actually running the test suite, and would have surfaced as a broken
deploy or a silently-wrong health check in production otherwise.

## Gaps and recommended improvements

Ordered roughly by how much it matters before real users depend on this.

### Should fix before a real launch

- **Redis has no HA/persistence in production.** `docker-compose.prod.yml`
  self-hosts Redis in a single container with a Docker volume. If that
  container dies, in-flight BullMQ jobs, rate-limit counters, and the
  dashboard cache all reset — sync/AI jobs are re-driven from source data
  (Gmail, mostly idempotent) so this is recoverable, but it's still a
  single point of failure with no replication. **Recommendation:** move to
  Amazon ElastiCache (Redis) for production — replication, automatic
  failover, and backups, at the cost of one more AWS resource to provision.
- **No cost cap on the automatic AI pipeline.** Already flagged in
  `docs/AI_PIPELINE.md` §5 and `docs/RAG_AND_DASHBOARDS.md` §7 — every
  synced email triggers a Gemini call, uncapped by any quota. Fine for a
  personal/demo deployment; before real signups, either add a
  auto-processing-specific quota or set a Gemini account-level hard spend
  limit as a backstop.
- **Single EC2 instance = no HA for the API.** One instance behind Nginx
  means a deploy briefly interrupts service (PM2 cluster mode covers
  multi-core use, not multi-instance failover), and an instance failure is
  full downtime until it's manually replaced. **Recommendation:** an ALB in
  front of an Auto Scaling Group of ≥2 instances (or migrate to ECS/Fargate)
  once uptime actually matters — the Dockerized app doesn't need to change
  for this, only the infrastructure around it.
- **No infrastructure-as-code.** `scripts/setup-ec2.sh` configures an
  instance imperatively; there's no Terraform/CDK definition of the VPC,
  security groups, IAM roles, S3 bucket, or CloudFront distribution. This
  means the "one-time AWS setup" steps in `docs/DEPLOYMENT.md` are manual
  and undocumented-in-code — fine for a single environment stood up once,
  a real liability if you ever need a second (staging) environment or the
  original operator leaves.

### Worth doing soon after launch

- **No image/dependency vulnerability scanning beyond `npm audit` in CI.**
  No Trivy/Grype container scan, no Dependabot security-update automation
  configured. `npm audit --audit-level=high` catches known-bad npm
  packages but not vulnerabilities baked into the base `node:20-alpine` /
  `nginx:1.27-alpine` images.
- **No E2E browser tests.** Backend has real API integration tests now;
  the frontend has exactly one component test. There's no Playwright/
  Cypress suite exercising the actual login → sync → view-inbox → chat
  flow through a real browser.
- **No load testing.** The rate limits, cache TTLs, and PM2 cluster sizing
  are reasoned about, not measured under real traffic. Before meaningful
  usage, a basic load test (k6/Artillery) against a staging deploy would
  validate those numbers instead of assuming them.
- **SSH-based backend deploy, not SSM.** `deploy-backend` opens port 22
  (restricted to a single IP, but still open) and uses a long-lived SSH
  key stored as a GitHub secret. AWS Systems Manager Session Manager /
  Run Command would let you close port 22 entirely and deploy via IAM
  permissions instead of a key — more consistent with the OIDC approach
  already used for the frontend deploy.
- **No automated rollback on failed deploy.** `deploy-backend.sh` waits for
  `/health/ready` and reports whether it succeeded, but doesn't
  automatically revert to the previous image if it didn't — a failed
  deploy needs a human to notice and run the rollback command in
  `docs/DEPLOYMENT.md` §6.

### Nice to have, not urgent

- MongoDB Atlas continuous backup/PITR isn't explicitly configured
  (Atlas's dashboard, outside this repo's scope) — worth confirming it's
  turned on before relying on it.
- No AWS WAF in front of CloudFront — basic bot/exploit filtering at the
  edge, cheap to add once there's a CloudFront distribution to attach it to.
- No CloudWatch dashboard, only alarms — the alarms tell you *that*
  something's wrong; a dashboard (request rate, error rate, latency
  percentiles, queue depth) helps you see *what* and *how bad* faster.
  `GET /metrics` already has the data; this is a visualization gap, not a
  data-collection one.
- Vector search's local brute-force fallback (`vectorSearch.service.ts`)
  is intentionally not production-grade — see `docs/RAG_AND_DASHBOARDS.md`
  §1. Make sure `MONGO_ATLAS_VECTOR_SEARCH_ENABLED=true` is actually set
  in the production secret, with the Atlas Search index actually built,
  before assuming semantic search performs well at any real data volume.

## Before you launch for real

If someone asked "is this ready for real users right now," the honest
answer: **the application code and CI/CD pipeline are solid and tested;
the AWS infrastructure around it has been carefully designed and scripted
but never actually stood up.** Concretely, before pointing real user
traffic at this:

1. Actually run through `docs/DEPLOYMENT.md` end-to-end once, on a real
   AWS account, and fix whatever the scripts get wrong when they meet
   reality (they will — infrastructure scripts always do, the first time).
2. Set the Gemini account's hard spend limit before enabling the automatic
   AI pipeline for anyone but yourself.
3. Move Redis to ElastiCache, or explicitly accept the single-container
   risk with eyes open.
4. Decide on an HA story for the API (even "one more EC2 instance behind
   an ALB" is a big step up from one) before promising any uptime SLA.
