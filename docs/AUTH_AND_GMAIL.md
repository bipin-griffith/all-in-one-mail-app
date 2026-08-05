# Authentication & Gmail Integration — Design Decisions

This document explains the *why* behind the auth and Gmail-sync implementation.
For *what* the endpoints are, see [`docs/API.md`](API.md); for collection
shapes, see [`docs/DATABASE.md`](DATABASE.md).

---

## Part 1 — Authentication

### 1.1 Why a `Session` collection instead of a token field on `User`

The original scaffold stored one `refreshTokenHash` field directly on `User`.
That has three real problems in production:

1. **Second device silently logs out the first.** Logging in on your phone
   overwrites the one refresh-token field, invalidating the browser session
   you still had open — with no error, no warning, it just stops refreshing.
2. **No visibility.** A user (or support engineer investigating a compromise)
   has no way to answer "what devices am I logged into right now?"
3. **No selective revocation.** You can only invalidate *everything* (delete
   the one field) — there's no way to say "log out just my old laptop."

The fix is a `Session` collection: one document per login, each with its own
`refreshTokenHash`, `userAgent`, `ip`, `createdAt`, and `lastUsedAt`. A user
can log into five devices and each gets its own row. This is what powers:

- `GET /auth/sessions` — list every active session, flagging which one is "this device"
- `DELETE /auth/sessions/:id` — revoke one specific session (log out that device)
- `DELETE /auth/sessions` — revoke every session *except* the current one ("log out everywhere else")

See `server/src/models/session.model.ts` and `server/src/modules/auth/auth.service.ts`.

### 1.2 Why there's no `revokedAt` / soft-delete flag

A session is either a document in the collection, or it isn't. There's no
`revoked: true` flag sitting next to still-live documents. This is a
deliberate simplification: "revoked" and "does not exist" are the same state
from every caller's perspective, so modeling them as two different states
would just be more code with no behavioral benefit. Revoking a session is
`Session.deleteOne(...)`, full stop.

This also gives refresh-token **reuse detection** for free. Rotation works
like this:

- Every session document holds the hash of its *current* refresh token.
- `POST /auth/refresh` verifies the JWT, looks up the session by the `sid`
  embedded in it, and checks the presented token's hash against what's
  stored **right now**.
- If they match: rotate — generate a new refresh token, overwrite the hash on
  the *same* session document, extend `expiresAt`.
- If they don't match: the token being presented is an old one that was
  already rotated away — a strong signal that a refresh token was stolen and
  is being replayed by an attacker after the legitimate client already moved
  on. The session is deleted immediately, forcing that device to log in again.

No separate "used tokens" table is needed to catch this — the single
current-hash-per-session model does it structurally.

### 1.3 Why the session id (`sid`) is embedded in *both* tokens

The access token payload is `{ sub, email, role, sid }`, not just
`{ sub, email, role }`. Embedding `sid` in the access token (not only the
refresh token) means any authenticated request — not just refresh calls —
can answer "which session is this?" without an extra database round-trip.
That's what lets `GET /auth/sessions` mark `isCurrent: true` on the right row,
and lets `POST /auth/logout` know exactly which session to delete (this
device only) without needing the refresh cookie at all.

### 1.4 Why TTL-index cleanup instead of a cron job

`session.model.ts` sets `expireAfterSeconds: 0` on `expiresAt`. MongoDB's TTL
monitor deletes the document itself once that time passes — no scheduled job,
no worker task, no risk of the cleanup silently falling behind. The tradeoff
is TTL sweeps run roughly once a minute internally (not exactly on the
second), which is irrelevant here since `rotateSession`/`authenticate` already
reject an expired JWT at the token-verification step before the DB is ever
consulted; the TTL delete is just housekeeping, not a security boundary.

### 1.5 Why the refresh token never appears in a JSON response

`POST /auth/login`, `/register`, and the Google callback all return the
**access token** in the JSON body / URL fragment, but the refresh token only
ever goes into an `httpOnly`, `secure` (in prod), `sameSite=strict` cookie
scoped to `/api/v1/auth`. Client-side JavaScript cannot read it. This means:
even if the SPA had an XSS bug and an attacker could run arbitrary JS in the
page, they could steal the short-lived (15 min) access token from memory but
**not** the refresh token — so they can't establish a persistent, silent
session. This is why the access token is deliberately kept in a Zustand
in-memory store on the client and never written to `localStorage`.

### 1.6 Google OAuth reuses the same session machinery

`loginWithGoogle` does the OAuth code exchange, upserts the `User` +
`EmailAccount`, and then calls the exact same `issueNewSession` helper that
local login/register use. There's no parallel "Google session" concept —
once a user is authenticated, our own JWT/session system is the only thing
that matters for authorization; the Google tokens are a separate concern
(see 2.1) used only for talking to Gmail, never for authenticating requests
to our own API.

---

## Part 2 — Gmail Integration

### 2.1 Two separate token systems, on purpose

There are two completely different credentials in play, and they're kept
structurally separate:

| | Purpose | Where it lives | Who verifies it |
|---|---|---|---|
| Our JWT access/refresh tokens | Authenticate requests to *our* API | `Session` collection + `Authorization` header | Our `authenticate` middleware |
| Google OAuth access/refresh tokens | Let our *server* call the Gmail API on the user's behalf | `EmailAccount.accessTokenEncrypted` / `refreshTokenEncrypted` (AES-256-GCM, at rest) | Google |

The client never sees or touches the Google tokens — they never leave the
server. This is also why `EmailAccount` documents strip those fields out of
`toJSON()` (see `emailAccount.model.ts`): even our own API responses to the
frontend never expose them.

### 2.2 Service layering: adapter vs. orchestration vs. persistence

Gmail integration is split into three layers with one job each, under
`server/src/modules/email/`:

```
gmail/gmail.client.ts    → builds an authenticated Gmail client, handles token refresh
gmail/gmail.service.ts   → one function per Gmail API capability (inbox/sent/drafts/
                            promotions/social/labels/attachments/threads/history).
                            Pure adapter: no Mongo, no business rules.
gmail/gmail.mapper.ts    → pure functions: raw Gmail message → our normalized shape
                            (header parsing, body extraction, category derivation,
                            attachment extraction, HTML sanitization)
emailSync.service.ts     → orchestration + persistence: decides bootstrap vs.
                            incremental sync, calls gmail.service, calls gmail.mapper,
                            upserts Thread/Email documents
email.service.ts         → the read side consumed by the API (GET /emails,
                            GET /threads, account management) — reads our own
                            MongoDB, never calls Gmail directly except for the
                            on-demand attachment download
```

Why split this far rather than one `gmail.service.ts` with everything in it:

- `gmail.service.ts` and `gmail.mapper.ts` have **zero MongoDB dependency**,
  so they can be tested (and were — see `gmail.mapper.test.ts`) without a
  database at all.
- If Outlook/Microsoft Graph support is ever added, it becomes a second
  adapter (`outlook/outlook.service.ts` + `outlook.mapper.ts`) implementing
  the same shape, without touching `emailSync.service.ts`'s orchestration
  logic or any of the persistence/dedupe rules.
- Each Gmail capability requested (Read Inbox, Read Sent, Read Drafts, Read
  Promotions, Read Social, Read Labels, Read Attachments, Read Threads) maps
  to exactly one named, independently callable function in
  `gmail.service.ts` — not a single monolithic "fetch everything" call. That
  makes each capability individually testable and reusable outside the sync
  flow (e.g. `getThread`/`getAttachment` are also used directly by
  `email.service.ts` for on-demand reads that don't require a full sync).

### 2.3 Bootstrap sync vs. incremental sync

Gmail's `history.list` API answers "what changed since historyId X" in one
cheap call — but only once you *have* a starting historyId. A brand-new
`EmailAccount` doesn't have one yet, so the first sync ("bootstrap") has to
explicitly ask for each category the product needs:

- `bootstrapSync` (no `historyId` yet): pulls a bounded page (50) from each
  of inbox / sent / promotions / social, and separately lists drafts (a
  distinct Gmail resource, not just a label), then fetches and persists each
  *unique* message once.
- `incrementalSync` (has `historyId`): one `history.list` call covering every
  label at once, then persists whatever came back.

Every sync — bootstrap or incremental — ends by refreshing the account's
`labels` array (`gmailApi.listLabels`), so "Read Labels" stays current even
for accounts that never bootstrap again.

### 2.4 How duplicate emails are actually prevented

There are two layers, and they solve two different problems:

1. **Correctness (DB level):** `Email` has a unique compound index on
   `{ emailAccount, providerMessageId }`, and every persist goes through
   `findOneAndUpdate(..., { upsert: true })` keyed on that same pair. This is
   what actually guarantees "no duplicate email documents" — it's true no
   matter how many times, or from how many different code paths, the same
   Gmail message id gets synced.
2. **Efficiency (pre-fetch level):** during bootstrap sync, the same message
   commonly shows up in more than one category list (a promotional email is
   in both `INBOX` and `CATEGORY_PROMOTIONS`). Before fetching full message
   bodies, the message ids from all four category lists are merged into a
   `Set`, so Gmail's `messages.get` is called once per unique message, not
   once per (message, category) pair. This is purely a performance/API-quota
   optimization layered *on top of* the DB-level guarantee — even if this
   dedup step were removed, no duplicate documents could result, because the
   upsert in step 1 would just overwrite the same document twice.

### 2.5 Deriving a single `category` from Gmail's multiple label ids

A message can carry several label ids simultaneously. For simple filtering
(`GET /emails?category=promotions`), each email is still tagged with one
primary `category`, chosen by priority in `gmail.mapper.ts#deriveCategory`:
`drafts > sent > promotions > social > inbox > other`. Drafts and sent mail
take priority over the semantic Gmail categories because they describe
*what the message is* (something you wrote), whereas
promotions/social/inbox describe *where it landed* — a sent message that
Gmail also stuck in a category label should still read as "sent," not
"promotions." The full, un-collapsed label list is preserved separately in
`labelIds` for anything that needs more than the single bucket.

### 2.6 Why attachment bytes are never stored in MongoDB

`Email.attachments` stores only metadata (`filename`, `mimeType`, `size`,
`attachmentId`) captured during sync — never the binary content. Attachment
bytes can be large and numerous; storing them in MongoDB would bloat the
database with data that Gmail already stores durably and that most synced
emails' attachments are never actually opened. Instead,
`GET /emails/:id/attachments/:attachmentId` fetches the bytes from Gmail
*on demand*, after re-verifying the requesting user actually owns the parent
email/mailbox — the same ownership check every other read endpoint uses. The
tradeoff: downloading an attachment costs one extra Gmail API round-trip per
request, which is the right tradeoff for something requested far less often
than the email list itself.

### 2.7 Why Gmail labels are embedded on `EmailAccount`, not a separate collection

`EmailAccount.labels` is an embedded array (`{ id, name, type }[]`), not a
`Label` collection with a foreign key. A mailbox's label set is small (Gmail
ships ~13 system labels; even heavy users rarely have more than a few dozen
custom ones), scoped 1:1 to the account, and read far more often than it
changes (refreshed once per sync). A join/reference here would add a query
for no real benefit — embedding is the simpler, equally-correct choice for
data with this shape.

### 2.8 Why `GET /emails` reads MongoDB, never Gmail, live

Every list/search/pagination request goes through our own indexed `Email`
collection, never a live Gmail API call. Two reasons: (1) it's dramatically
faster — Mongo with a compound index beats a network round-trip to Gmail on
every page load — and (2) Gmail enforces per-user API quotas that a chatty
UI (re-fetching the inbox on every navigation, tab focus, etc.) would burn
through quickly. Gmail is the source of truth (see docs/DATABASE.md), our
database is a synced, queryable cache of it — the same pattern already used
for threads.

### 2.9 Why sync runs in the background worker, never inline in a request

`POST /sync` and `POST /email-accounts/:id/sync` both just flip
`syncStatus` to `"syncing"` and enqueue a BullMQ job, returning `202
Accepted` immediately. The actual Gmail calls happen in the separate worker
process (`modules/queue/workers/emailSync.worker.ts`). A full mailbox sync
can mean dozens of sequential Gmail API calls — doing that inside an HTTP
request handler would tie up a request thread for the duration and risk
hitting Express/proxy timeouts. This mirrors the exact same pattern already
used for AI jobs — see `docs/ARCHITECTURE.md`.
