# AI Processing Pipeline — Design Decisions

Every new email synced from Gmail is automatically run through an AI
processing pipeline: clean HTML → extract readable text → summarize →
detect category → detect priority → detect required action. This document
explains the design decisions behind that pipeline. For what the fields are,
see [`docs/DATABASE.md`](DATABASE.md); for the sync flow that triggers it,
see [`docs/AUTH_AND_GMAIL.md`](AUTH_AND_GMAIL.md).

## Where the code lives

```
modules/email/textExtraction.service.ts   → step 1-2: clean HTML, extract readable text (pure, no OpenAI)
modules/ai/emailAnalysis.prompt.ts        → builds the single, token-minimized prompt
modules/ai/emailAnalysis.schema.ts        → validates/repairs OpenAI's JSON response
modules/ai/openai.client.ts               → completeJson() — OpenAI call in JSON mode
modules/ai/emailProcessing.service.ts     → orchestrates steps 1-6 for one email
modules/queue/queues/emailProcessing.queue.ts → BullMQ queue + enqueue helper
modules/queue/workers/emailProcessing.worker.ts → BullMQ worker (retries, logging)
```

Same layering philosophy as the Gmail integration (adapter / prompt-building
/ validation / orchestration each in their own file) — see
AUTH_AND_GMAIL.md §2.2 for why that split is worth the extra files.

## 1. Only genuinely new emails trigger processing

`emailSync.service.ts#persistMessage` checks `Email.exists(...)` **before**
upserting. If a message already exists, processing is never re-triggered —
re-syncing an email because its read state changed, or because it appeared
in two Gmail category lists in the same bootstrap run, must not re-run (and
re-bill) the AI pipeline for something already analyzed. Only a document
that didn't exist a moment ago gets `enqueueEmailProcessing()` called on it.

This does mean emails synced *before* this feature existed are never
automatically backfilled — a deliberate scope boundary ("every **new**
email," as specified), not an oversight. A batch reprocessing job for
historical emails would be a natural, separate follow-up.

## 2. One OpenAI call per email, not four

The most impactful token-usage decision: summary, category, priority, and
action are all requested in a **single** chat completion using
`response_format: { type: 'json_object' }`, not four separate calls. Four
calls would mean sending the same email content to OpenAI four times —
roughly 4x the input-token cost for no benefit, since none of the four
outputs depend on the others having already been computed. See
`openai.client.ts#completeJson` and `emailAnalysis.prompt.ts`.

Further token-reduction choices in `emailAnalysis.prompt.ts`:
- The body is capped at 3000 characters before being sent. A short summary
  and a category/priority/action classification don't need the full text of
  a long email — the opening portion carries almost all the useful signal,
  and truncating avoids paying for tokens that don't change the output.
- The system prompt is a short, fixed instruction list with no few-shot
  examples. Examples improve accuracy but their token cost is paid on
  *every single call* — for a high-volume, per-email pipeline (as opposed to
  an occasional user-triggered action), that fixed overhead dominates.
- `gpt-4o-mini` (the configured default `OPENAI_MODEL`) is one of the
  cheapest OpenAI models that reliably supports JSON mode — deliberately not
  a larger/pricier model, since this task (short summary + a 3-way
  classification) doesn't need frontier-model reasoning.

## 3. Defensive validation instead of a Mongoose enum

`aiCategory`, `aiPriority`, and `aiAction` are stored as plain strings, not
Mongoose `enum`-constrained fields (unlike the deterministic, always-derived
`category` field). Validation happens once, in
`emailAnalysis.schema.ts`, using Zod's `.catch(fallbackValue)` on each field
individually:

- If OpenAI returns a category/priority/action outside the allowed list
  (LLMs occasionally drift off-spec, e.g. returning `"urgent"` instead of
  `"high"`), that *one field* falls back to a safe default — the job still
  succeeds, and the (perfectly good) summary it also returned isn't thrown
  away over one bad field.
- Only a response that isn't valid JSON at all causes the job to fail and
  retry — that's the one case where retrying (asking OpenAI again) is
  actually likely to produce a usable result.

A second Mongoose-level enum on top of this would be redundant: the value
reaching Mongoose has already been validated and repaired at the
application boundary, which is the right place to enforce it since it's
where the actual decision logic (what to do with an invalid value) lives.

## 4. Retry mechanism

`emailProcessingQueue` uses the same retry policy as `emailSyncQueue`:
`attempts: 3` with exponential backoff (5s, 10s, 20s). Both queues call a
third-party API (OpenAI / Gmail) that can have transient failures — a brief
rate-limit or network blip self-heals on retry; a permanent failure (e.g.
invalid API key) exhausts its 3 attempts and the email is left with
`aiStatus: 'failed'` and a populated `aiError`, visible via `GET
/emails/:id` rather than silently disappearing.

## 5. Deliberately *not* gated by the AI usage quota

`modules/ai/ai.service.ts` enforces a per-plan monthly quota
(`PLAN_QUOTAS`) on *user-initiated* actions (`POST /ai/summarize`, etc.).
The automatic pipeline in this document does **not** check that quota. This
is a conscious decision, not an oversight: connecting a new Gmail account
can bootstrap-sync 100+ messages at once (see AUTH_AND_GMAIL.md §2.3),
and if that consumed the same "50 AI actions/month" free-plan allowance,
a user could exhaust their entire monthly quota from a single mailbox
connection before ever manually asking the assistant to do anything —
that's a product design conflict, not a rate-limiting success.

The practical cost/rate control here is `WORKER_CONCURRENCY` (bounds how
many emails are processed in parallel) plus the queue's `attempts` cap. The
real tradeoff being made explicit: **connecting a mailbox with a large
inbox will make a meaningful number of OpenAI calls automatically**, and
that cost is not currently capped by a quota. A natural following change
(not implemented here, to keep this feature's scope to what was asked)
would be a separate "auto-processing" quota, or restricting automatic
processing to the `inbox`/`sent` Gmail categories by default while leaving
promotions/social opt-in.

## 6. Why `cleanText` is stored on the Email document

Extracting readable text (`textExtraction.service.ts`) is deterministic and
cheap — there's no reason to redo it every time the pipeline runs, or to
require a re-fetch of `bodyHtml` to render clean text elsewhere later. It's
computed once, alongside the AI analysis, and persisted on the same
document (`Email.cleanText`) so any future feature that wants
plain-readable email text doesn't have to reimplement HTML stripping.
