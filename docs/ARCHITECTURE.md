# Architecture Overview

## High-level shape

```
                              ┌─────────────────────┐
                              │   MongoDB Atlas      │
                              │   (users, emails,    │
                              │   threads, ai logs)  │
                              └──────────▲───────────┘
                                         │
┌────────────┐   REST /api/v1   ┌───────┴────────┐   BullMQ jobs   ┌──────────────┐
│  React SPA │ ───────────────▶ │  Express API   │ ──────────────▶ │ Redis (queue) │
│ (client)   │ ◀─────────────── │  (server)      │ ◀────────────── │              │
└────────────┘   JSON + JWT     └───────┬────────┘   job results   └──────┬───────┘
                                         │                                 │
                                 Google OAuth2 / Gmail API         ┌───────┴────────┐
                                         │                         │  BullMQ Worker │
                                         ▼                         │  (same image,  │
                                 ┌───────────────┐                 │  WORKER=true)  │
                                 │   OpenAI API   │ ◀───────────────┤  calls OpenAI  │
                                 └───────────────┘                 └────────────────┘
```

- The **API process** and the **worker process** are the same Docker image, started with a different entrypoint (`node dist/server.js` vs `node dist/modules/queue/worker.js`). This keeps the codebase single-sourced while allowing independent horizontal scaling in production (e.g. scale workers up during a bulk re-sync without touching API capacity).
- The API never calls OpenAI synchronously inside a request handler for anything non-trivial (summarize thread, draft reply, classify). Those are enqueued as BullMQ jobs and the client polls / subscribes to job status. This keeps request latency low and protects against OpenAI rate limits cascading into HTTP timeouts.
- Redis is used for both BullMQ (durable job queue) and, optionally, rate-limiting / session blacklisting (`rate-limiter-flexible` can share the same Redis connection).

## Why feature-based (not layer-based) folders

The backend is organized as `modules/<feature>/{routes,controller,service,validation}.ts` rather than `controllers/`, `services/`, `routes/` top-level folders. Rationale:

- Cognitive locality: everything about "email" lives in one directory. A new engineer can delete a feature by deleting a folder.
- Prevents the classic layer-based sprawl where a single change (e.g. add a field to AI draft generation) touches 4 unrelated top-level folders.
- Each module exports a single `Router` that `routes/index.ts` mounts — enforces a consistent boundary and makes it trivial to version the API (`/api/v1`, `/api/v2`) by mounting a whole module tree under a prefix.

## Request lifecycle (server)

1. `express.json()` + `helmet()` + `cors()` + `compression()` — global middleware in `app.ts`.
2. Route-level `validate(schema)` middleware (Zod) — rejects malformed input before it reaches a controller.
3. `authenticate` middleware — verifies JWT, attaches `req.user`.
4. Controller — thin, only translates HTTP ⇄ service call, wraps in `asyncHandler` so thrown errors reach the error middleware instead of crashing the process.
5. Service — business logic, the only layer allowed to touch Mongoose models directly.
6. Response — always shaped via `ApiResponse` (see `docs/API.md`).
7. Errors — thrown as `ApiError` anywhere in the chain, caught centrally by `error.middleware.ts`, logged via Winston, shaped into a consistent JSON error body, and never leak stack traces in production.

## AI job lifecycle

1. Client calls `POST /api/v1/ai/summarize` with a `threadId`.
2. Controller validates ownership, enqueues a job on the `ai-processing` BullMQ queue, returns `202 Accepted` with a `jobId`.
3. Worker process picks up the job, calls OpenAI, writes the result to `ai_interactions` collection, updates job progress.
4. Client polls `GET /api/v1/ai/jobs/:jobId` (or a future WebSocket/SSE channel) for status.

This pattern is identical for `draft-reply`, `classify`, and `bulk-summarize` — see `server/src/modules/ai`.

## Scaling notes

- Stateless API containers behind an ALB — horizontal scale by container count.
- Workers scale independently via `docker compose up --scale worker=N` or separate ECS/EC2 ASG.
- MongoDB Atlas handles replication/sharding; the app never assumes a specific topology beyond a valid connection string.
- Redis (ElastiCache in production) is the single shared state for queue coordination — do not add in-memory state to API containers (breaks horizontal scaling).
