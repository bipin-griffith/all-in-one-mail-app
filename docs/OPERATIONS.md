# Operations: Health Checks, Metrics, Caching, Logging

Cross-cutting production concerns that don't belong to any one feature.
For the AWS-specific side of these (CloudWatch log shipping, alarms), see
[`docs/DEPLOYMENT.md`](DEPLOYMENT.md).

## Health checks: liveness vs. readiness

Two separate endpoints, both outside `/api/v1` (they're infra surface, not
product API — see `app.ts`):

- **`GET /health`** (liveness) — "is the process itself up?" Always
  returns 200 with no dependency checks. An orchestrator uses this to
  decide whether to kill/restart the container; it must never fail just
  because Mongo or Redis is briefly unreachable, or a transient DB blip
  would cause a restart storm that makes the actual problem worse.
- **`GET /health/ready`** (readiness) — "can this instance serve real
  traffic right now?" Pings Mongo and Redis directly and returns 503 if
  either is down. A load balancer/orchestrator polls this before routing
  traffic to a new or recovering instance.

**A real bug caught during testing, worth knowing about:** the first
version of the readiness check used
`mongoose.connection.db?.admin().ping()`. Optional chaining there is wrong
— when `db` is `undefined` (never connected), the whole expression
short-circuits to `undefined` instead of throwing, so `await undefined`
resolves immediately and the check reported "ready" with **no database
connection at all**. Fixed by explicitly checking
`mongoose.connection.readyState` first and throwing if not connected. A
readiness check that can report healthy while genuinely down is worse than
no check — it actively tells the load balancer to send traffic somewhere
that can't serve it. (Caught by `app.test.ts`'s two readiness tests, one
for each state — this is why both are asserted explicitly rather than
trusting one happy-path check.)

Docker itself also health-checks the `server` container
(`docker-compose.prod.yml`'s `healthcheck:` block, hitting `/health`) —
independent of anything AWS-side, so `docker compose ps` shows accurate
status even before any load balancer is involved.

## Metrics (`GET /metrics`)

Prometheus-format metrics via `prom-client` — `config/metrics.ts` +
`middlewares/metrics.middleware.ts`. Tracks, per route pattern (not literal
URL, to avoid unbounded label cardinality from path params/query strings):

- `http_request_duration_seconds` — histogram, request latency
- `http_requests_total` — counter, by method/route/status code
- `cache_hits_total` / `cache_misses_total` — see caching below
- Node process defaults (`collectDefaultMetrics`): event loop lag, memory, GC

**No application-level authentication on `/metrics`.** This is deliberate,
not an oversight — the standard way to secure a metrics endpoint is network
isolation, not app-layer auth:
- In production, the API binds to `127.0.0.1` only (`docker-compose.prod.yml`).
- Nginx (`nginx/app.conf`) never proxies `/metrics` externally — only
  `/api/v1/*` and `/health` are reachable from the public internet.
- A CloudWatch agent or Prometheus scraper on the same EC2 host reaches it
  via `http://127.0.0.1:5000/metrics` directly, bypassing Nginx entirely.

If you ever need to scrape from off-host, put that scraper inside the same
VPC/security group rather than adding a token check here — the failure mode
of "forgot to rotate the metrics token" is worse than "metrics endpoint is
reachable only from inside the network."

## Caching

`middlewares/cache.middleware.ts` — a Redis-backed cache for GET JSON
responses, applied to the dashboard aggregation endpoints
(`dashboard.routes.ts`: category/stats/top-senders) specifically, with a
60-second TTL that matches the client's own `staleTime` on those same
queries (`client/src/features/dashboard/hooks`) — client and server agree
on how fresh this data needs to be, rather than one caching aggressively
while the other still refetches constantly.

Why these endpoints and not others: they run non-trivial MongoDB
aggregation pipelines over a user's *entire* email history on every
request, but the underlying data only changes at "new email synced"
cadence (minutes), not "every page view" cadence (seconds) — serving a
result that's up to 60 seconds stale is the right tradeoff for something
this expensive to compute.

**Why it's safe per-user:** the cache key is `cache:<userId>:<full URL
including query string>`. Different filters/pagination never collide with
each other, and — this is the important part — it is structurally
impossible for one user's cached aggregate to be served to another user,
since the key always includes their own id. This was verified with a
dedicated integration test
(`dashboard.integration.test.ts`: "never mixes one user's aggregate
results into another user's cached response").

A Redis failure degrades to "just run the query" rather than failing the
request — caching is a performance optimization here, not a correctness
dependency (see the try/catch around the Redis read in
`cache.middleware.ts`).

## Logging

Winston, structured JSON in production, **console-only — never written to
local files**, even in production. This wasn't always true: an earlier
version wrote to `logs/error.log` / `logs/combined.log`, which crashed the
app in the actual Docker container (`EACCES: permission denied, mkdir
'logs'` — the non-root user the container runs as has no write access to
create that directory, and wouldn't have anywhere durable to put it even if
it could, since the container filesystem is ephemeral). Fixed by dropping
the file transports entirely: Docker's `awslogs` logging driver
(`docker-compose.prod.yml`) captures whatever the process writes to
stdout/stderr and ships it to CloudWatch — that's the one source of truth
for production logs now, not a file inside a container that gets discarded
on every restart anyway. This is the standard "log to stdout, let the
container runtime handle shipping" pattern for containerized apps, not a
project-specific choice.

## Rate limiting (recap)

Already covered in [`docs/SECURITY.md`](SECURITY.md) and
[`docs/RAG_AND_DASHBOARDS.md`](RAG_AND_DASHBOARDS.md) — noted here only for
completeness: `authRateLimiter`, `aiRateLimiter`, `chatRateLimiter`, each
scoped to exactly the routes that need them (never to a polling endpoint —
see `ai.routes.ts`'s comment for a real bug that came from getting this
wrong once). All three are disabled outright when `NODE_ENV=test`
(`rateLimiter.middleware.ts`) — integration tests legitimately hit
auth/AI endpoints far more times, in far less wall-clock time, than any
real user would, and whether the limiter itself works is a different
concern from whether the endpoints it guards behave correctly.
