# What to actually do now — step by step

Two totally separate paths here. Pick based on what you actually want right now:

- **Path A — just keep developing locally.** Nothing changes. Skip to the bottom.
- **Path B — actually put this live on the internet for real users.** This is
  a real project (a few hours, spread over a few days realistically), needs
  an AWS account with a credit card on it, and needs you to own a domain
  name. Read the whole thing before starting so you know what you're
  signing up for.

---

## Path A: Local dev — nothing has changed

Everything from `working-for-bipin.md` still works exactly the same way.
The production stuff (Docker, Nginx, AWS scripts) only matters once you
deploy — it doesn't affect `npm run dev`. If you just want to keep testing
features locally, you're already done, no action needed.

---

## Path B: Deploying to AWS for real

### Step 0 — Decide if you're ready for this

You will need:
- An **AWS account** with a payment method on file (EC2 + S3 + CloudFront +
  Secrets Manager cost real money — a small instance is maybe $10-15/month,
  the rest is pennies at low traffic).
- A **domain name** you own (e.g. from Namecheap, Google Domains, Route 53
  itself) — you need two subdomains, like `app.yourdomain.com` (frontend)
  and `api.yourdomain.com` (backend).
- Comfort typing commands into a terminal connected to a remote server (SSH).
- About 1-2 hours of focused time to do this the first time.

If any of that sounds like too much right now, stop here — Path A is
perfectly fine to keep working in.

### Step 1 — MongoDB Atlas (you may already have this from earlier)

1. If you don't already have an Atlas cluster: go to
   [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas), create a
   free account, create a cluster.
2. **Network access**: Atlas → Network Access → allow access from anywhere
   (`0.0.0.0/0`) for now — you can restrict this to your EC2 instance's IP
   later once you know it.
3. **Database user**: create one scoped to just this app's database.
4. Copy the connection string (looks like `mongodb+srv://user:pass@...`) —
   you'll need it in Step 5.
5. **(Optional, for the AI search feature to actually work well)**: once
   you have real data, run the vector search index setup:
   ```bash
   cd server
   npx tsx scripts/create-vector-index.ts
   ```
   This needs `MONGO_URI` in `server/.env` pointing at your **Atlas**
   cluster (not local Docker Mongo) when you run it.

### Step 2 — S3 + CloudFront (the frontend's home)

In the AWS Console:
1. **S3** → Create bucket. Name it something like `ai-mail-assistant-frontend`.
   Keep "Block all public access" **ON** — the bucket stays private.
2. **CloudFront** → Create distribution → origin = the S3 bucket you just
   made → CloudFront will offer to set up an "Origin Access Control" for
   you, accept it (this is what lets CloudFront read the private bucket).
3. On the distribution: **Default root object** = `index.html`.
4. **Error pages** tab: add a custom error response — HTTP error code
   `403`, response page `/index.html`, response code `200`. Do it again for
   `404`. (Without this, refreshing the page on any URL other than the
   homepage shows a broken CloudFront error instead of your app — this is
   just how single-page apps work with a CDN.)
5. **Custom domain + HTTPS**: in AWS Certificate Manager (**must be in the
   `us-east-1` region**, regardless of where anything else is), request a
   certificate for `app.yourdomain.com`, validate it (usually a DNS record
   you add), then attach it to the CloudFront distribution and set the
   Alternate Domain Name to `app.yourdomain.com`.
6. Note down: the **S3 bucket name** and the **CloudFront distribution ID**
   (found on the distribution's overview page) — you need both later.

### Step 3 — EC2 (the backend's home)

1. **EC2** → Launch instance. Ubuntu 22.04, size `t3.small` is a reasonable
   starting point.
2. **Security group**: allow inbound port `22` (SSH, restrict to your own
   IP if you can), `80`, and `443`. **Do not open port 5000** — that's the
   API talking directly, and it's meant to only be reachable through Nginx.
3. Launch it, download the `.pem` key file, note the instance's public IP.
4. **IAM role** (do this so the server never needs AWS passwords stored on
   it):
   - IAM → Roles → Create role → trusted entity = EC2.
   - Attach a policy granting `secretsmanager:GetSecretValue` and basic
     CloudWatch Logs write permissions (`logs:CreateLogGroup`,
     `logs:CreateLogStream`, `logs:PutLogEvents`).
   - Attach that role to the EC2 instance (Instance Settings → Attach/Replace IAM Role).
5. SSH in: `ssh -i your-key.pem ubuntu@<instance-public-ip>`
6. Copy this project onto the instance (simplest: `git clone` it if it's on
   GitHub — push it there first if it isn't yet).
7. Run the setup script:
   ```bash
   cd ai-mail-assistant
   ./scripts/setup-ec2.sh
   ```
   This installs Docker, Nginx, Certbot, and the AWS CLI, and turns on the
   Nginx config for you.
8. Point your domain's DNS: add an A record for `api.yourdomain.com`
   pointing at the EC2 instance's public IP.
9. Once DNS has propagated (check with `dig api.yourdomain.com` — can take
   a few minutes to an hour), get your SSL certificate:
   ```bash
   ./scripts/setup-ssl.sh api.yourdomain.com you@youremail.com
   ```

### Step 4 — AWS Secrets Manager (your production `.env`, safely)

Instead of putting real secrets in a file on the server, they live in AWS
and get pulled down automatically on every deploy.

```bash
aws secretsmanager create-secret \
  --name ai-mail-assistant/production \
  --secret-string '{
    "NODE_ENV": "production",
    "PORT": "5000",
    "CLIENT_URL": "https://app.yourdomain.com",
    "API_BASE_URL": "https://api.yourdomain.com",
    "MONGO_URI": "your Atlas connection string from Step 1",
    "REDIS_URL": "redis://redis:6379",
    "JWT_ACCESS_SECRET": "run: openssl rand -base64 32",
    "JWT_REFRESH_SECRET": "run: openssl rand -base64 32 (a DIFFERENT one)",
    "ENCRYPTION_KEY": "run: openssl rand -base64 32 (a DIFFERENT one again)",
    "GOOGLE_CLIENT_ID": "your real Google OAuth client id",
    "GOOGLE_CLIENT_SECRET": "your real Google OAuth client secret",
    "GOOGLE_REDIRECT_URI": "https://api.yourdomain.com/api/v1/auth/google/callback",
    "GEMINI_API_KEY": "your real Gemini key",
    "GEMINI_MODEL": "gemini-3.5-flash-lite",
    "GEMINI_EMBEDDING_MODEL": "gemini-embedding-001",
    "MONGO_ATLAS_VECTOR_SEARCH_ENABLED": "true",
    "WORKER_CONCURRENCY": "5"
  }'
```

Two important things:
- **Update your Google OAuth app** (Google Cloud Console) with the new
  redirect URI (`https://api.yourdomain.com/api/v1/auth/google/callback`)
  — the old localhost one won't work in production.
- Run this from **your own laptop** with AWS CLI configured (`aws
  configure`), not from the EC2 instance — you're creating the secret, the
  instance only reads it later via its IAM role.

### Step 5 — Let GitHub deploy automatically for you

1. **Create an IAM role for GitHub Actions** (so it can deploy the frontend
   without you storing AWS passwords in GitHub):
   - Follow the "Why OIDC" section in `docs/DEPLOYMENT.md` §5 — it's a
     few clicks in IAM to trust GitHub, then a role with permission to
     write to your S3 bucket and invalidate CloudFront.
2. In your GitHub repo → **Settings → Environments** → create one called
   `production`.
3. **Settings → Secrets and variables → Actions** → add these:

   | Secret | Value |
   |---|---|
   | `EC2_HOST` | Your EC2 instance's public IP |
   | `EC2_USER` | `ubuntu` |
   | `EC2_SSH_KEY` | The contents of your `.pem` file |
   | `AWS_DEPLOY_ROLE_ARN` | The role ARN from step 1 above |
   | `AWS_REGION` | e.g. `us-east-1` |
   | `S3_BUCKET` | Your bucket name from Step 2 |
   | `CLOUDFRONT_DISTRIBUTION_ID` | From Step 2 |
   | `VITE_API_BASE_URL` | `https://api.yourdomain.com/api/v1` |

4. Push to `main` (or merge a PR into it). Watch the **Actions** tab —
   `CI` runs first, then `CD` deploys the backend to EC2 and the frontend
   to S3/CloudFront automatically.

### Step 6 — Check it actually worked

```bash
curl https://api.yourdomain.com/health/ready
```
Should return `{"success":true,"message":"ready",...}`. Then open
`https://app.yourdomain.com` in a browser and try logging in for real.

### If something breaks

Read `docs/PRODUCTION_READINESS.md` first — it lists exactly which parts of
this were tested for real versus carefully written but never run against
actual AWS. The EC2/Docker/Nginx pieces were tested locally in a simulated
setup and work correctly; the parts that can only be tested against a real
AWS account (Secrets Manager, S3, CloudFront, the actual SSH deploy) may
need small fixes the first time you run them for real — that's normal for
infrastructure scripts, not a sign something is broken.

---

## Honestly, my recommendation

Don't do Path B today unless you specifically want this live for other
people right now. It's a real commitment (money, a domain, AWS complexity)
and everything you've built so far works great locally for continued
development. If you tell me "let's do it," I'm glad to walk through Path B
with you interactively, one step at a time, rather than you doing all of it
solo from this file.
