# AI Email Assistant — Monorepo

Production-grade AI email assistant SaaS. MERN + TypeScript, Google OAuth Gmail integration, OpenAI-powered summarization/drafting/classification processed asynchronously via BullMQ + Redis.

## Structure

```
.
├── client/            # React + TS + Vite + Tailwind + shadcn/ui SPA
├── server/            # Express + TS API and BullMQ worker (same codebase, two entrypoints)
├── docs/              # Architecture, database, coding standards, security, API reference
├── .github/workflows/ # CI/CD
├── docker-compose.yml # Local dev: mongo, redis, server, worker, client
└── docker-compose.prod.yml
```

Read `docs/ARCHITECTURE.md` first — it explains why the code is shaped this way.

## Quick start (local dev)

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
# fill in Google OAuth + OpenAI keys in server/.env

docker compose up -d mongo redis   # infra only
npm install
npm run dev                        # runs server + client concurrently
```

Or fully containerized: `docker compose up --build`.

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design, request/job lifecycles
- [`docs/DATABASE.md`](docs/DATABASE.md) — collections, indexes, design decisions
- [`docs/API.md`](docs/API.md) — endpoint reference, response envelope
- [`docs/CODING_STANDARDS.md`](docs/CODING_STANDARDS.md) — layering, naming, testing
- [`docs/SECURITY.md`](docs/SECURITY.md) — authN/Z, secrets, transport, dependency hygiene
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — EC2 + Atlas setup, CI/CD flow, rollback
