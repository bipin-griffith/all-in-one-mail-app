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

### `aiinteractions`
Audit log + cache of every AI operation — doubles as usage metering.

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
- `aiinteractions.{user, createdAt}` — compound index, powers usage-quota queries and history views.

## Design decisions

- **Tokens are encrypted at rest** (`accessTokenEncrypted`/`refreshTokenEncrypted`), not just excluded from `toJSON` — a DB dump/leak must not directly hand over live Gmail access. See `server/src/utils/crypto.ts`.
- **Sessions, not a token field, back refresh tokens** — enables multi-device login, per-device revocation, and refresh-token-reuse detection. See AUTH_AND_GMAIL.md §1.
- **Emails are cached, not the source of truth.** Gmail remains authoritative; our copy exists for fast search/AI without hammering the Gmail API on every page load. Incremental sync uses Gmail's `historyId` cursor rather than re-fetching everything.
- **AI results are persisted**, not just returned once — enables a "history" UI, re-use without re-billing OpenAI for the same summary, and usage analytics per user/plan.
