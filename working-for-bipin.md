# Working notes for Bipin — AI Email Assistant

This is your personal cheat sheet: how the app works, how to run it, and exactly what
you need to fill in before Google login and AI features work. Everything else
(register/login, inbox UI, protected routes) already works with zero setup.

---

## 1. How the app works (big picture)

```
React SPA (client, :5173)
        │  REST calls, JWT in Authorization header
        ▼
Express API (server, :5001)  ──uses──▶  MongoDB (your data: users, emails, threads)
        │  enqueues jobs
        ▼
Redis (BullMQ queue)
        │  picked up by
        ▼
Worker process (separate Node process, same codebase)
        │  calls
        ▼
Google Gmail API (sync your inbox)  +  OpenAI API (summarize/draft/classify)
```

- **The API never calls Gmail or OpenAI directly inside a request.** When you click
  "Sync" or "Summarize", the API just queues a job and immediately responds. The
  **worker** (a separate process) picks the job off the Redis queue, does the slow
  work (talking to Google/OpenAI), and writes the result to MongoDB. The frontend
  polls for the result. This is why you need **4 things running at once** (API,
  worker, MongoDB, Redis) — see the run steps below.
- Auth uses short-lived JWT access tokens (kept in memory in the browser tab) plus a
  long-lived refresh token stored in an `httpOnly` cookie — so a page refresh
  silently re-authenticates you without exposing the token to JS/XSS.
- Full architecture write-up: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
  Database shape: [`docs/DATABASE.md`](docs/DATABASE.md). API reference:
  [`docs/API.md`](docs/API.md).

### What works right now, with no setup
- Register / log in / log out (email + password)
- Protected pages, session refresh
- Inbox page (empty until a mailbox is connected)

### What needs API keys before it does anything (see §3)
- "Continue with Google" button + Gmail inbox sync → needs **Google OAuth** keys
- Summarize / Draft reply / Classify buttons → needs an **OpenAI** key

---

## 2. How to run it

You need 5 terminal tabs (or run the first two once, then leave the last three
running). All commands assume you're in the repo root:
`/Users/bipingupta/Documents/all-in-one-mail-app`

### One-time setup (already done, listed for reference)
```bash
npm install                          # installs both workspaces
cp server/.env.example server/.env   # then fill in real values, see §3
cp client/.env.example client/.env
```
Your `server/.env` and `client/.env` already exist with working defaults —
you only need to edit the Google/OpenAI lines in `server/.env` (§3).

### Every time you want to run the app

**Terminal 1 — infrastructure (MongoDB + Redis via Docker)**
```bash
docker compose up -d mongo redis
```
Check they're up: `docker ps` should show `ai-mail-assistant-mongo-1` and
`ai-mail-assistant-redis-1`.

**Terminal 2 — API server**
```bash
cd server
npm run dev
```
Wait for: `API listening on port 5001 [development]`

**Terminal 3 — background worker** (handles Gmail sync + AI jobs)
```bash
cd server
npm run dev:worker
```
Wait for: `Worker process started (email-sync, ai-processing)`

**Terminal 4 — frontend**
```bash
cd client
npm run dev
```
Wait for: `Local: http://localhost:5173/`

**Open the app:** http://localhost:5173

### Shutting everything down
- Stop each `npm run dev*` process with `Ctrl+C` in its terminal.
- Stop infra: `docker compose stop mongo redis` (keeps your data) or
  `docker compose down` (also removes the containers; add `-v` to wipe the data
  volumes too — don't do that unless you want a clean slate).

### Note about port 5000
The API defaults to port `5000` in the example files, but on your Mac that port is
occupied by **macOS AirPlay Receiver** (Control Center). Your `server/.env` and
`client/.env` are already set to use **`5001`** instead — this is a one-line change,
nothing else in the app cares which port it runs on. If you ever want port 5000
back, disable AirPlay Receiver in System Settings → General → AirDrop & Handoff, then
edit `PORT`, `API_BASE_URL`, and `GOOGLE_REDIRECT_URI` in `server/.env` and
`VITE_API_BASE_URL` in `client/.env` back to `5000`.

---

## 3. What you need to put in `server/.env`

Open `server/.env` (already created, gitignored — never commit it). Everything is
filled in except these, which currently have **placeholder values**:

### Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
Needed for: "Continue with Google" button, Gmail inbox sync.

1. Go to https://console.cloud.google.com/ → create a project (or pick one).
2. **APIs & Services → Library** → enable **Gmail API**.
3. **APIs & Services → OAuth consent screen** → set it up (External, add your own
   email as a test user — you don't need Google's approval to test with your own
   account).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:5001/api/v1/auth/google/callback`
5. Copy the generated **Client ID** and **Client secret** into `server/.env`:
   ```
   GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxxxxxxx
   ```
   (`GOOGLE_REDIRECT_URI` is already correct — leave it as-is.)

### OpenAI (`OPENAI_API_KEY`)
Needed for: Summarize / Draft reply / Classify AI actions on a thread.

1. Go to https://platform.openai.com/api-keys → create a new secret key.
2. You'll need billing enabled on the OpenAI account (even a few dollars of credit
   is enough for testing).
3. Paste it into `server/.env`:
   ```
   OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
   ```
   `OPENAI_MODEL=gpt-4o-mini` is already set as a cheap, fast default — change it if
   you want a different model.

### Everything else in `server/.env`
Already generated/filled for local dev — you don't need to touch these:

| Variable | What it's for |
|---|---|
| `MONGO_URI` | points at the local Docker MongoDB |
| `REDIS_URL` | points at the local Docker Redis |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | random secrets, already generated with `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | encrypts your Gmail tokens at rest in MongoDB, already generated |
| `CLIENT_URL` / `API_BASE_URL` | already pointed at localhost ports |

After editing `server/.env`, **restart** Terminal 2 (API) and Terminal 3 (worker) —
`tsx watch` will pick up code changes automatically but not `.env` changes, so a
restart (`Ctrl+C` then `npm run dev` again) is needed.

---

## 4. Quick end-to-end test once keys are in

1. Restart API + worker after editing `.env`.
2. Go to http://localhost:5173/register, create an account (or use Google login).
3. If you used Google login: the sidebar should show your connected Gmail address.
   Click the sync icon next to it — this queues a job the worker will pick up.
4. Open a thread once emails have synced, click **Summarize** — this queues an AI
   job; the panel polls automatically until the result appears.
5. If something fails, check the worker terminal (Terminal 3) — that's where
   Gmail/OpenAI errors show up, since that's the process actually talking to those
   APIs.
