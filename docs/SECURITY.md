# Security Best Practices

## AuthN / AuthZ

- Passwords hashed with `bcrypt` (cost factor 12), never stored or logged in plaintext.
- Access tokens: short-lived JWT (15m), signed with `JWT_ACCESS_SECRET`, sent in `Authorization: Bearer`.
- Refresh tokens: long-lived (7d), one per device via the `sessions` collection (not a single field on `User`), stored **hashed** (`sha256`), transported only via `httpOnly` + `secure` + `sameSite=strict` cookie — rotated in place on every use. A refresh token whose hash doesn't match its session's *current* hash is reuse of an already-rotated token; the session is deleted immediately, forcing re-login on that device. Users can audit and revoke sessions individually via `GET/DELETE /auth/sessions`. Full rationale: `docs/AUTH_AND_GMAIL.md`.
- Google OAuth tokens (access + refresh) are encrypted at rest with AES-256-GCM (`server/src/utils/crypto.ts`) using a key from `ENCRYPTION_KEY`, never exposed via any API response (`select: false` + explicit omission in `toJSON`). These are entirely separate from our own JWTs — see AUTH_AND_GMAIL.md §2.1.
- Route-level authorization via `authenticate` middleware; resource-level ownership checks happen in the service layer (`if (thread.emailAccount.user !== req.user.id) throw new ApiError(403, ...)`) — never trust an ID in the URL alone. The same pattern gates attachment downloads (`GET /emails/:id/attachments/:attachmentId`): ownership of the parent email is verified before any Gmail call is made.

## Transport / headers

- `helmet()` sets secure headers (CSP, `X-Content-Type-Options`, HSTS in production, etc.) — see `server/src/app.ts`.
- CORS is an explicit allowlist read from `CLIENT_URL` env var, `credentials: true` only for that origin — never `origin: '*'` with credentials.
- All production traffic terminates TLS at the load balancer / Nginx reverse proxy in front of the EC2 instance; the Node process itself speaks plain HTTP inside the private network.

## Input handling

- Every mutating endpoint validates `req.body`/`req.params`/`req.query` with a Zod schema before the controller runs — rejects unknown fields (`.strict()`), coerces types explicitly, never trusts client-supplied types.
- `bodyHtml` from synced emails is sanitized server-side with `sanitize-html` before storage — the client renders it, so stored HTML must already be safe (defense against stored XSS from a malicious sender).
- Mongoose schemas are the second line of defense (type coercion, `maxlength`, `enum`) — validation is not solely the API boundary's job.

## Rate limiting & abuse

- `express-rate-limit` (backed by the shared Redis via `rate-limit-redis`) on `/auth/*` (prevent credential stuffing) and `/ai/*` (prevent Gemini cost abuse), tuned per route, not a single global limiter.
- Per-user AI usage quota enforced in `ai.service.ts` before enqueueing a job (`users.aiUsage`), independent of rate limiting — rate limiting stops bursts, quota stops sustained abuse within plan limits.

## Secrets & config

- No secret ever committed — `.env` is gitignored, `.env.example` documents required keys with placeholder values only.
- Production secrets (`JWT_ACCESS_SECRET`, `ENCRYPTION_KEY`, `GEMINI_API_KEY`, Mongo/Redis URIs, Google OAuth client secret) are injected via environment at deploy time (GitHub Actions secrets → EC2 via SSH deploy step, or an `.env` file with `600` permissions outside the repo on the host) — never baked into the Docker image.
- `ENCRYPTION_KEY` and JWT secrets are generated with `openssl rand -base64 32`, rotated on suspected compromise; rotating `JWT_ACCESS_SECRET` invalidates all sessions (acceptable/expected), rotating `ENCRYPTION_KEY` requires a re-encryption migration (documented, not automatic).

## Dependency & supply chain

- `npm audit` runs in CI (`.github/workflows/ci.yml`); high/critical findings fail the build.
- Dependabot (or equivalent) enabled at the repo level for automated dependency PRs — configured in repo settings, `docs/SECURITY.md` is the reference for why this matters, not the mechanism itself.

## Logging

- Winston logs structured JSON in production (ingestible by CloudWatch/ELK), never logs full request bodies, tokens, or PII beyond user id/email — see `server/src/config/logger.ts`.
- Error responses in production omit stack traces (`NODE_ENV=production` gate in `error.middleware.ts`); full stack is logged server-side only.

## Docker / infra

- Containers run as a non-root user (`USER node` in `Dockerfile`).
- `.dockerignore` excludes `.env`, `node_modules`, `.git` from build context.
- Multi-stage builds — the final image contains only `dist/` + production `node_modules`, no source, no dev dependencies, no build tooling.
