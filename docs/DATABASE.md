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
| `refreshTokenHash` | string \| null | hashed, rotated on every refresh |
| `isEmailVerified` | boolean | |
| `plan` | `'free' \| 'pro'` | SaaS tier, gates AI usage quotas |
| `aiUsage` | `{ count: number, resetAt: Date }` | rolling quota window |
| `createdAt` / `updatedAt` | Date | timestamps |

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
| `from` / `to` / `cc` | string[] | |
| `subject` | string | |
| `snippet` | string | short preview |
| `bodyText` | string | plain text, sanitized |
| `bodyHtml` | string | sanitized (DOMPurify server-side) before storage |
| `receivedAt` | Date | indexed |
| `isRead` | boolean | |

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
- `emailaccounts.{user, emailAddress}` — compound unique (prevent duplicate connections).
- `threads.{emailAccount, providerThreadId}` — compound unique (idempotent sync).
- `threads.{emailAccount, lastMessageAt}` — compound index, powers inbox pagination sorted by recency.
- `emails.{emailAccount, providerMessageId}` — compound unique (idempotent sync).
- `aiinteractions.{user, createdAt}` — compound index, powers usage-quota queries and history views.

## Design decisions

- **Tokens are encrypted at rest** (`accessTokenEncrypted`/`refreshTokenEncrypted`), not just excluded from `toJSON` — a DB dump/leak must not directly hand over live Gmail access. See `server/src/utils/crypto.ts`.
- **Emails are cached, not the source of truth.** Gmail remains authoritative; our copy exists for fast search/AI without hammering the Gmail API on every page load. Incremental sync uses Gmail's `historyId` cursor rather than re-fetching everything.
- **AI results are persisted**, not just returned once — enables a "history" UI, re-use without re-billing OpenAI for the same summary, and usage analytics per user/plan.
