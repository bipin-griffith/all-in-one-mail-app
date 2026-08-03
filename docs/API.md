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
| POST | `/refresh` | public (refresh cookie) | Rotate access token |
| POST | `/logout` | private | Revoke refresh token |
| GET | `/me` | private | Current user profile |

### Email Accounts — `/api/v1/email-accounts`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | private | List connected mailboxes |
| POST | `/:id/sync` | private | Trigger an incremental sync (enqueues job) |
| DELETE | `/:id` | private | Disconnect a mailbox, revoke tokens |

### Threads / Emails — `/api/v1/threads`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | private | Paginated inbox (`?page=&limit=&category=&q=`) |
| GET | `/:id` | private | Thread detail with messages |
| PATCH | `/:id` | private | Update labels / read state |

### AI — `/api/v1/ai`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/summarize` | private | Enqueue thread summarization → `202 { jobId }` |
| POST | `/draft-reply` | private | Enqueue reply draft generation → `202 { jobId }` |
| POST | `/classify` | private | Enqueue thread categorization → `202 { jobId }` |
| GET | `/jobs/:jobId` | private | Poll job status/result |

## Conventions

- Every mutating route is protected by the `validate(schema)` middleware using a Zod schema colocated in the module (`*.validation.ts`) — no controller trusts `req.body` directly.
- Pagination is cursor-agnostic offset pagination (`page`/`limit`) for v1 simplicity; documented as a candidate to move to cursor-based pagination if thread volume grows large per account.
- All private routes require `Authorization: Bearer <accessToken>`; refresh tokens travel only in an `httpOnly`, `secure`, `sameSite=strict` cookie — never in JSON responses or `localStorage`.
