# RAG (Semantic Search / Chat) & Dashboards — Design Decisions

This document covers two related features: retrieval-augmented generation
over the user's synced emails (embeddings, vector search, `POST /chat`),
and the analytics dashboards built on top of the same data. For the
per-email AI pipeline these both build on, see
[`docs/AI_PIPELINE.md`](AI_PIPELINE.md).

## Where the code lives

```
modules/ai/embedding.service.ts     → wraps Gemini's embeddings API
modules/ai/vectorSearch.service.ts  → Atlas $vectorSearch + local brute-force fallback
modules/ai/chat.service.ts          → RAG orchestration for POST /chat
modules/ai/aiUsage.service.ts       → shared plan-quota logic (manual AI actions + chat)
modules/dashboard/                  → aggregate stats (category/timeseries/top-senders)
scripts/create-vector-index.ts      → one-time Atlas Search index setup
```

## 1. MongoDB Atlas Vector Search is Atlas-only — and this project runs local MongoDB in dev

This is the single most important thing to understand about this feature:
**`$vectorSearch` does not exist on local or self-hosted community MongoDB.**
It's an Atlas Search capability backed by Atlas's Lucene-based search
infrastructure, only available on Atlas M10+ clusters or Search-enabled
Flex/Serverless instances. The `mongo:7` image this project's
`docker-compose.yml` uses for local dev cannot run it at all — the
aggregation stage simply doesn't exist there.

Rather than make the whole RAG feature undemoable without a paid Atlas
cluster, `vectorSearch.service.ts` has two implementations behind one
function (`searchSimilarEmails`):

- **`searchWithAtlasVectorSearch`** — the real `$vectorSearch` aggregation
  stage, with an indexed `filter` on `emailAccount` so results never cross
  between users' mailboxes. This is what runs in production against Atlas.
- **`searchWithBruteForce`** — pulls a bounded, recency-ordered pool of the
  user's embedded emails (capped at 1000) and scores them with plain cosine
  similarity in Node. This is O(candidates), not the O(log n) Atlas gives
  you, and is **not** a production substitute — it exists purely so the
  feature is testable end-to-end against the local Docker MongoDB this
  project's whole dev workflow already runs on.

Which one runs is controlled by `MONGO_ATLAS_VECTOR_SEARCH_ENABLED`
(`server/.env`) — **explicit config, not auto-detection**. That was a
deliberate choice over silently probing for `$vectorSearch` and falling
back on failure: a misconfigured or not-yet-built index on a *production*
Atlas cluster should be loud (the flag is on, the call fails, you find out),
not silently degrade search quality to brute-force scoring without anyone
noticing. The one place a runtime fallback *does* happen is if the flag is
on and Atlas's `$vectorSearch` call itself throws (e.g. the index hasn't
finished building yet) — that's caught and degrades to brute-force so one
request doesn't hard-fail, logged as an error so it's visible in monitoring.

### Setting it up for real

1. Have an Atlas cluster (M10+, or Search-enabled Flex/Serverless) and point
   `MONGO_URI` at it.
2. Run `npx tsx scripts/create-vector-index.ts` once — creates a
   `vectorSearch`-type Atlas Search index named `email_vector_index` on
   `emails.embedding` (1536 dimensions, cosine similarity), with
   `emailAccount` as a filterable field.
3. Wait for the index to show "Active" in the Atlas UI's Search tab (index
   builds are asynchronous).
4. Set `MONGO_ATLAS_VECTOR_SEARCH_ENABLED=true`.

This can't be done via a normal Mongoose `.index()` call — regular MongoDB
indexes (B-tree) don't support approximate-nearest-neighbor vector search at
all; it's a fundamentally different index type that only Atlas Search
provides.

## 2. Every email gets an embedding automatically, as part of the existing AI pipeline

`emailProcessing.service.ts` (built for the automatic per-email pipeline —
see AI_PIPELINE.md) now also generates an embedding for every new email,
**in parallel** with the summary/category/priority/action analysis call:

```ts
const [analysisResult, embeddingResult] = await Promise.all([
  completeJson(prompt.system, prompt.user),
  generateEmbedding(embeddingInput),
]);
```

These are two independent Gemini calls (chat completion vs. embeddings —
different endpoints entirely) that both only depend on the same already-
extracted `cleanText`, so running them concurrently instead of sequentially
roughly halves the wall-clock latency per email with no added cost. No new
queue was introduced for embeddings — reusing the pipeline that already
runs on every new email avoided a redundant text-extraction step and a
third BullMQ queue for something that's triggered by the exact same event.

The embedding is generated from **subject + body**, not body alone — a
question like "show Amazon invoices" needs to match on sender/subject
signal even for emails whose body text never literally says "invoice".

## 3. `POST /chat` reuses `aiSummary`, not full email bodies, as retrieval context

This is the biggest token saving in the whole RAG pipeline, and it's a
direct payoff of building the automatic AI pipeline first: when
`chat.service.ts` builds context for the LLM from the retrieved emails, it
uses each email's already-computed `aiSummary` (falling back to Gmail's
`snippet` for anything not yet processed) — never the raw `bodyText`/
`bodyHtml`. Retrieving 8 emails' full bodies could easily be 10-20x more
tokens than 8 one-to-two-sentence summaries, for context that answers the
same set of questions just as well.

## 4. Grounding: the model is told what it can and can't say

The system prompt for `POST /chat` explicitly instructs the model to:
- answer only from the numbered email excerpts provided,
- cite which numbered email(s) it drew from,
- say plainly when the context doesn't contain the answer, rather than
  guessing.

This is standard RAG grounding practice and the main defense against
hallucination — without it, a model will confidently answer from its own
training-data priors about "what a rejection email typically says" instead
of admitting it found nothing relevant in the user's actual inbox.

## 5. Known limitation: aggregate/counting questions

Pure semantic retrieval (`top-K` similarity search, K=8 by default) is a
good fit for "find X" and "show me Y" questions — but a question like
**"how many companies replied this month?"** needs to enumerate *every*
matching email, not just the 8 most similar ones. If more than 8 companies
replied, the model will only see (and therefore only be able to count) the
top 8 by embedding similarity to the question text — which isn't even
guaranteed to be a good proxy for "is a reply." This is a known, accepted
limitation of pure-embedding RAG rather than something this implementation
hides: a proper fix would involve query classification (detect "aggregate"
questions and route them to a structured MongoDB aggregation instead of
vector search) or a much larger K for such questions, both left as future
work rather than built speculatively here.

## 6. `POST /chat` is synchronous, unlike every other AI operation

Every other AI action in this codebase (`summarize`, `draft-reply`,
`classify`, and the automatic per-email pipeline) is enqueued as a BullMQ
job and polled — see docs/ARCHITECTURE.md. `POST /chat` is the one
deliberate exception: it makes its two Gemini calls (embed the question,
then one chat completion) and returns the answer directly in the HTTP
response. The reasoning: a chat reply is an interactive, "the user is
actively waiting right now" interaction with a small, bounded amount of
work (not a batch of dozens of emails like a mailbox sync), so the
async-job/poll machinery would add latency and complexity without solving
a real problem here.

## 7. `POST /chat` shares the manual-action AI usage quota, not the automatic pipeline's

`chat.service.ts` calls the same `assertQuotaAndIncrement` (now extracted
into `aiUsage.service.ts`, shared with `ai.service.ts`'s manual
summarize/draft/classify) — because asking the assistant a question is a
user-initiated action, exactly like those, not automatic background
processing. This is the reason `aiUsage.service.ts` exists as its own file
now: the quota logic needed a second, independent call site.

## 8. No multi-turn conversation memory (yet)

`POST /chat` is stateless per request — each call is an independent
question in, answer + sources out; there's no `Conversation`/`Message`
persistence layer, and the frontend chat page only keeps message history in
local component state, not synced from the server. This was a deliberate
scope boundary: the explicit ask was "retrieve relevant emails, send
context to Gemini, return accurate responses," which a stateless endpoint
satisfies fully. True multi-turn memory (referencing "that second one" from
a prior answer) is a natural follow-up, not built speculatively here.

## 9. Dashboards: three reusable endpoints, not eight

Backend dashboards mirror the "reusable, not duplicated" instruction on
both sides of the stack:

- **Jobs / Shopping / Finance dashboards** → one endpoint,
  `GET /dashboard/category/:aiCategory`, parameterized by category. Three
  near-identical routes would have meant three copies of the same
  aggregation logic to keep in sync.
- **Daily / Monthly Statistics** → one endpoint, `GET /dashboard/stats?
  granularity=day|month&range=N`, parameterized by granularity.
- **Top Senders** → `GET /dashboard/top-senders?limit=N`.
- **Unread Emails / Priority Emails** → **no new endpoints at all.** These
  are just `GET /emails?isRead=false` and `GET /emails?aiPriority=high` —
  filters the list endpoint already supported (isRead is a new addition;
  aiPriority already existed). Building dedicated dashboard routes for
  "a filtered list" would have duplicated `email.service.ts#listEmails`
  for no benefit.

The same principle carries to the frontend: `CategoryDashboardCard` is one
component instantiated three times (Jobs/Shopping/Finance) with a different
`aiCategory` prop, not three separate components.

## 10. Frontend charting: no charting library

`TimeseriesChart` (daily/monthly stats) is a small, dependency-free inline
SVG bar chart, not a library like Recharts or Chart.js. For eight small
dashboard widgets rendering simple bar/count data, a charting library's
bundle weight (often 50-100KB+) isn't justified — a ~60-line SVG component
covers the actual requirement and ships zero additional bytes to the
client. If the product later needs richer interactive charts (zoom, tooltips
across series, etc.), that's the point to reconsider — not before.
