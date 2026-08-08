# Database Structure (MongoDB / Mongoose)

## Collections

### `users`
The account holder in our system (not a raw mailbox).

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name` | string | |
| `email` | string | unique, indexed |
| `passwordHash` | string \| null | null for OAuth-only users |
| `avatarUrl` | string | |
| `authProvider` | `'local' \| 'google'` | |
| `role` | `'user' \| 'admin'` | default `'user'` |
| `isEmailVerified` | boolean | |
| `plan` | `'free' \| 'pro'` | SaaS tier, gates AI usage quotas |
| `aiUsage` | `{ count: number, resetAt: Date }` | rolling quota window |
| `createdAt` / `updatedAt` | Date | timestamps |

Refresh tokens are **not** stored on `User` — see `sessions` below.

### `sessions`
One document per logged-in device/browser. Replaces an earlier single-field
design; see [`docs/AUTH_AND_GMAIL.md`](AUTH_AND_GMAIL.md) §1.1–1.4 for why.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | this is the `sid` embedded in both JWTs |
| `user` | ObjectId ref `User` | indexed |
| `refreshTokenHash` | string | sha256, rotated in place on every refresh |
| `userAgent` | string | shown in "active sessions" UI |
| `ip` | string | |
| `createdAt` | Date | |
| `lastUsedAt` | Date | updated on every successful refresh |
| `expiresAt` | Date | TTL-indexed — MongoDB deletes the document automatically past this point |

No `revokedAt` field: revocation is deletion. A refresh token whose hash
doesn't match the session's *current* hash is treated as reuse of a stolen,
already-rotated token, and the session is deleted on the spot.

### `emailaccounts`
A connected mailbox (Gmail via OAuth). A `user` can have multiple.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `user` | ObjectId ref `User` | indexed |
| `provider` | `'google'` | extensible to `'outlook'` later |
| `emailAddress` | string | |
| `accessTokenEncrypted` | string | AES-256-GCM encrypted at rest, never returned by API |
| `refreshTokenEncrypted` | string | same |
| `tokenExpiresAt` | Date | |
| `historyId` | string | Gmail sync cursor (incremental sync) |
| `syncStatus` | `'idle' \| 'syncing' \| 'error'` | |
| `lastSyncedAt` | Date | |
| `labels` | `{ id, name, type: 'system'\|'user' }[]` | the mailbox's Gmail label list, refreshed every sync — embedded rather than a separate collection (small, 1:1-scoped, read far more than it changes) |

### `threads`
Conversation grouping (mirrors Gmail thread concept).

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `emailAccount` | ObjectId ref `EmailAccount` | indexed |
| `providerThreadId` | string | Gmail's thread id, unique per account |
| `subject` | string | |
| `participants` | string[] | |
| `lastMessageAt` | Date | indexed for inbox sort |
| `labels` | string[] | Gmail labels / our own AI-assigned categories |
| `aiCategory` | string \| null | e.g. `'urgent' \| 'newsletter' \| 'receipt'` |

### `emails`
Individual messages within a thread.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `thread` | ObjectId ref `Thread` | indexed |
| `emailAccount` | ObjectId ref `EmailAccount` | indexed |
| `providerMessageId` | string | unique per account |
| `providerDraftId` | string \| null | set only when `isDraft` is true |
| `from` / `to` / `cc` | string[] | |
| `subject` | string | |
| `snippet` | string | short preview |
| `bodyText` | string | plain text, sanitized |
| `bodyHtml` | string | sanitized (`sanitize-html`, server-side) before storage |
| `receivedAt` | Date | indexed |
| `isRead` | boolean | |
| `isDraft` | boolean | true for messages synced from Gmail's Drafts resource |
| `category` | `'inbox'\|'sent'\|'drafts'\|'promotions'\|'social'\|'other'` | single primary category, derived from `labelIds` — see AUTH_AND_GMAIL.md §2.5 |
| `labelIds` | string[] | raw Gmail label ids, uncollapsed (a message can have several) |
| `attachments` | `{ filename, mimeType, size, attachmentId }[]` | metadata only — bytes are never stored, fetched from Gmail on demand (see AUTH_AND_GMAIL.md §2.6) |
| `cleanText` | string | plain, tag-free readable text extracted from the body — see `docs/AI_PIPELINE.md` §6 |
| `aiSummary` | string \| null | 1-2 sentence AI-generated summary |
| `aiCategory` | `'jobs'\|'shopping'\|'finance'\|'bills'\|'marketing'\|'personal'\|'government'\|'travel'\|'university'\|'spam'` \| null | content-based AI classification — distinct from `category` above, see AI_PIPELINE.md |
| `aiPriority` | `'high'\|'medium'\|'low'` \| null | AI-detected priority |
| `aiAction` | `'reply'\|'ignore'\|'archive'\|'reminder'\|'follow_up'` \| null | AI-detected required action |
| `aiStatus` | `'pending'\|'processing'\|'completed'\|'failed'` | pipeline status for this email |
| `aiError` | string \| null | populated when `aiStatus` is `'failed'` |
| `aiProcessedAt` | Date \| null | |
| `aiTokens` | `{ prompt: number, completion: number }` | Gemini token usage for this email's analysis call |
| `embedding` | number[] | `select: false` — vector embedding for semantic search/RAG, see `docs/RAG_AND_DASHBOARDS.md`. Never serialized in API responses. |
| `embeddingModel` | string \| null | which Gemini embedding model produced `embedding` |
| `embeddingGeneratedAt` | Date \| null | |

### `aiinteractions`
Audit log + cache of **user-initiated** AI operations (`POST /ai/summarize`
etc.) — doubles as usage metering against the per-plan quota. This is
distinct from the automatic per-email pipeline (`docs/AI_PIPELINE.md`),
whose results live directly on the `emails` collection above: that pipeline
runs on every new email regardless of plan quota, so mixing its (potentially
high-volume) results into this audit trail would conflate two different
concepts — see AI_PIPELINE.md §5 for the quota reasoning.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `user` | ObjectId ref `User` | indexed |
| `thread` | ObjectId ref `Thread` \| null | |
| `type` | `'summarize' \| 'draft_reply' \| 'classify'` | |
| `status` | `'queued' \| 'processing' \| 'completed' \| 'failed'` | |
| `jobId` | string | BullMQ job id |
| `promptTokens` / `completionTokens` | number | for cost tracking |
| `result` | Mixed | shape depends on `type` |
| `error` | string \| null | |
| `createdAt` | Date | |

## Indexing strategy

- `users.email` — unique index (auth lookups).
- `sessions.user` — indexed (list/revoke a user's sessions).
- `sessions.expiresAt` — TTL index, `expireAfterSeconds: 0` (automatic cleanup, see AUTH_AND_GMAIL.md §1.4).
- `emailaccounts.{user, emailAddress}` — compound unique (prevent duplicate connections).
- `threads.{emailAccount, providerThreadId}` — compound unique (idempotent sync).
- `threads.{emailAccount, lastMessageAt}` — compound index, powers inbox pagination sorted by recency.
- `emails.{emailAccount, providerMessageId}` — compound unique (idempotent sync — this is what actually prevents duplicate emails, see AUTH_AND_GMAIL.md §2.4).
- `emails.{emailAccount, category, receivedAt}` — compound index, powers `GET /emails?category=...` pagination sorted by recency.
- `emails.{emailAccount, aiCategory, aiPriority, receivedAt}` — compound index, powers `GET /emails?aiCategory=...&aiPriority=...` pagination.
- `emails.{emailAccount, embeddingGeneratedAt}` — supports the local brute-force vector search fallback's candidate query.
- `aiinteractions.{user, createdAt}` — compound index, powers usage-quota queries and history views.

**Not a regular index:** `emails.embedding` is searched via a separate
**Atlas Search vector index** (`email_vector_index`, type `vectorSearch`),
created by `scripts/create-vector-index.ts` — this is a fundamentally
different index type (approximate-nearest-neighbor over a vector field)
that a normal `schema.index()`/`createIndex()` call cannot create, and that
only exists on MongoDB Atlas. See `docs/RAG_AND_DASHBOARDS.md` §1.

## Design decisions

- **Tokens are encrypted at rest** (`accessTokenEncrypted`/`refreshTokenEncrypted`), not just excluded from `toJSON` — a DB dump/leak must not directly hand over live Gmail access. See `server/src/utils/crypto.ts`.
- **Sessions, not a token field, back refresh tokens** — enables multi-device login, per-device revocation, and refresh-token-reuse detection. See AUTH_AND_GMAIL.md §1.
- **Emails are cached, not the source of truth.** Gmail remains authoritative; our copy exists for fast search/AI without hammering the Gmail API on every page load. Incremental sync uses Gmail's `historyId` cursor rather than re-fetching everything.
- **AI results are persisted**, not just returned once — enables a "history" UI, re-use without re-billing Gemini for the same summary, and usage analytics per user/plan.
