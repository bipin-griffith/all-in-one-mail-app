# API Structure

Base URL: `/api/v1`

All responses share one envelope shape (see `server/src/utils/ApiResponse.ts`):

```jsonc
// success
{
  "success": true,
  "message": "Thread fetched",
  "data": { "...": "..." },
  "meta": { "page": 1, "limit": 20, "total": 134 } // optional, list endpoints only
}

// error
{
  "success": false,
  "message": "Thread not found",
  "errors": [ { "field": "threadId", "message": "..." } ], // optional, validation errors
  "stack": "..." // only in development
}
```

HTTP status codes are meaningful and consistent (`server/src/constants/httpStatus.ts`): `200` read, `201` create, `202` accepted-async (AI jobs), `204` delete, `400` validation, `401` unauthenticated, `403` unauthorized, `404` not found, `409` conflict, `422` semantic validation, `429` rate limited, `500` unhandled.

## Endpoints

### Auth — `/api/v1/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | public | Email + password signup |
| POST | `/login` | public | Email + password login → access + refresh token |
| GET | `/google` | public | Redirect to Google OAuth consent |
| GET | `/google/callback` | public | OAuth callback, creates/links user, redirects to client with tokens |
| POST | `/refresh` | public (refresh cookie) | Rotate the refresh token in place on the current session, issue a new access token |
| POST | `/logout` | private | Revoke the **current** session only (see Session Management) |
| GET | `/me` | private | Current user profile |
| GET | `/sessions` | private | List this user's active sessions (device/IP/last used), current one flagged |
| DELETE | `/sessions/:id` | private | Revoke one specific session ("log out this device") |
| DELETE | `/sessions` | private | Revoke every session except the current one ("log out everywhere else") |

Session management design (why a `Session` collection instead of a single
token field, why there's no `revokedAt` flag, how refresh-token reuse is
detected) is explained in [`docs/AUTH_AND_GMAIL.md`](AUTH_AND_GMAIL.md).

### Email Accounts — `/api/v1/email-accounts`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | private | List connected mailboxes (includes each mailbox's Gmail label list) |
| POST | `/:id/sync` | private | Trigger a sync for one mailbox (enqueues job) → `202 { jobId }` |
| DELETE | `/:id` | private | Disconnect a mailbox, delete its synced threads/emails |

### Sync — `/api/v1/sync`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | private | Trigger a sync for **every** mailbox the user has connected → `202 { jobIds }` |

### Threads — `/api/v1/threads`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | private | Paginated inbox grouped by thread (`?page=&limit=&category=&q=`) |
| GET | `/:id` | private | Thread detail with its messages |
| PATCH | `/:id` | private | Update labels / read state |

### Emails — `/api/v1/emails`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | private | Paginated, individual-message list (`?page=&limit=&category=&aiCategory=&aiPriority=&aiAction=&isRead=&threadId=&q=`) |
| GET | `/:id` | private | Single email, including attachment metadata and AI analysis fields |
| GET | `/:id/attachments/:attachmentId` | private | Downloads attachment bytes, fetched from Gmail on demand (never stored in MongoDB — see AUTH_AND_GMAIL.md §2.6) |

`GET /emails` and `GET /threads` overlap in purpose but not in shape: threads
group messages into conversations (what the inbox UI renders), `GET /emails`
is the flat, per-message view — useful for category-filtered views like
"show me every promotional email" without the thread grouping.

`category` is Gmail-label-derived (`inbox|sent|drafts|promotions|social|other`).
`aiCategory` (`jobs|shopping|finance|bills|marketing|personal|government|travel|university|spam`),
`aiPriority` (`high|medium|low`), and `aiAction`
(`reply|ignore|archive|reminder|follow_up`) are produced automatically by the
AI processing pipeline for every new email — see
[`docs/AI_PIPELINE.md`](AI_PIPELINE.md). There's no endpoint to trigger this
pipeline manually; it always runs as a side effect of sync.

### AI — `/api/v1/ai`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/summarize` | private | Enqueue thread summarization → `202 { jobId }` |
| POST | `/draft-reply` | private | Enqueue reply draft generation → `202 { jobId }` |
| POST | `/classify` | private | Enqueue thread categorization → `202 { jobId }` |
| GET | `/jobs/:jobId` | private | Poll job status/result |

### Chat (RAG) — `/api/v1/chat`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/` | private | `{ message: string }` → `200 { answer, sources, tokensUsed }`. Synchronous (not queued) — see `docs/RAG_AND_DASHBOARDS.md` §6. Embeds the question, vector-searches the user's own emails for context, sends that context + question to OpenAI. `sources` lists the emails the answer drew from (id, subject, from, receivedAt, similarity score). |

Counts against the same per-plan AI usage quota as `POST /ai/summarize`
etc. (`docs/RAG_AND_DASHBOARDS.md` §7) and its own rate limit
(`chatRateLimiter`, 10/min).

### Dashboards — `/api/v1/dashboard`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/category/:aiCategory` | private | Powers Jobs/Shopping/Finance dashboards. `{ category, total, byPriority, byAction, recent }` |
| GET | `/stats` | private | `?granularity=day\|month&range=N` — powers Daily/Monthly Statistics. Array of `{ date, total, unread }` |
| GET | `/top-senders` | private | `?limit=N` — array of `{ from, count, lastReceivedAt }` |

Unread Emails and Priority Emails dashboards have no dedicated endpoints —
they're `GET /emails?isRead=false` and `GET /emails?aiPriority=high`,
reusing the existing list endpoint. See `docs/RAG_AND_DASHBOARDS.md` §9.

## Conventions

- Every mutating route is protected by the `validate(schema)` middleware using a Zod schema colocated in the module (`*.validation.ts`) — no controller trusts `req.body` directly.
- Pagination is cursor-agnostic offset pagination (`page`/`limit`) for v1 simplicity; documented as a candidate to move to cursor-based pagination if thread volume grows large per account.
- All private routes require `Authorization: Bearer <accessToken>`; refresh tokens travel only in an `httpOnly`, `secure`, `sameSite=strict` cookie — never in JSON responses or `localStorage`.
