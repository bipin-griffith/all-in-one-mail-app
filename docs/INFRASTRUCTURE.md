# Infrastructure Diagrams

Rendered as Mermaid — GitHub renders these natively in this file, no image
export needed (and they won't go stale the way a hand-drawn PNG would).

## AWS production architecture

```mermaid
flowchart TB
    subgraph Users["Users"]
        Browser["Browser"]
    end

    subgraph AWS["AWS"]
        subgraph Edge["Edge / CDN"]
            R53["Route 53 DNS"]
            CF["CloudFront\n(ACM cert, SPA fallback\n403/404 -> index.html)"]
            S3["S3 bucket\n(private, OAC only)\nclient/dist static build"]
            CF --> S3
        end

        subgraph EC2Box["EC2 instance"]
            Nginx["Nginx (host-level)\nTLS via Let's Encrypt\nreverse proxy"]
            subgraph Docker["Docker (docker-compose.prod.yml)"]
                API["server container\nPM2 cluster mode\nExpress API :5000\n(127.0.0.1 only)"]
                Worker["worker container x2\nPM2 fork mode\nBullMQ consumer"]
                Redis["redis container\nBullMQ + rate limits\n+ dashboard cache"]
            end
            Nginx -->|"proxy_pass\n127.0.0.1:5000"| API
        end

        SM["Secrets Manager\nai-mail-assistant/production"]
        CW["CloudWatch Logs\n(awslogs driver)\n+ alarms"]
        IAM["EC2 instance profile\n(no static AWS keys)"]

        IAM -. grants .-> API
        IAM -. grants .-> Worker
        API -.->|fetch-secrets.sh\nat deploy time| SM
        Worker -.->|fetch-secrets.sh\nat deploy time| SM
        API -->|stdout/stderr| CW
        Worker -->|stdout/stderr| CW
        CW --> Alarms["Alarms\n(status check, CPU,\nerror log rate)"]
    end

    subgraph External["External services (not AWS)"]
        Atlas[("MongoDB Atlas\nusers, emails, threads,\nsessions, ai logs\n+ Atlas Vector Search index")]
        Gmail["Gmail API"]
        Gemini["Gemini API\n(chat + embeddings)"]
    end

    Browser -->|"HTTPS\napp.yourdomain.com"| R53
    R53 --> CF
    Browser -->|"HTTPS API calls\napi.yourdomain.com"| Nginx

    API --> Atlas
    Worker --> Atlas
    API --> Redis
    Worker --> Redis
    Worker --> Gmail
    Worker --> Gemini
    API --> Gemini
```

Notes on choices this diagram makes visible:
- The API container binds to `127.0.0.1:5000` — reachable only through
  Nginx, never directly, even if a security group were misconfigured.
- `/metrics` is deliberately absent from any arrow reaching Nginx or the
  internet — see `docs/OPERATIONS.md`.
- MongoDB Atlas, Gmail, and Gemini are all external to AWS — nothing about
  this architecture requires them to be in AWS, and the app never assumes
  a specific Atlas network topology beyond a valid connection string.

## CI/CD pipeline

```mermaid
flowchart LR
    Push["git push to main"] --> CI

    subgraph CI["ci.yml"]
        direction TB
        L1["server job:\nlint, typecheck,\nintegration tests\n(mongodb-memory-server),\nbuild"]
        L2["client job:\nlint, typecheck,\ntests, build"]
        L3["docker job:\nbuild server + client\nimages (no push)"]
    end

    CI -->|all pass| CD

    subgraph CD["cd.yml (workflow_run, on CI success)"]
        direction TB
        B1["build-and-push-server:\nbuild server image,\npush to GHCR\n(tag: sha + latest)"]
        B2["deploy-backend:\nscp compose file + scripts,\nssh: fetch-secrets.sh,\ndocker compose pull && up,\nwait for /health/ready"]
        B3["deploy-frontend:\nnpm run build (client),\naws s3 sync,\ncloudfront invalidate"]
        B1 --> B2
    end

    CD --> Prod["Production\n(EC2 + S3/CloudFront)"]
```

Notes:
- `deploy-frontend` does not depend on `build-and-push-server` — a
  frontend-only change deploys without waiting on an EC2 SSH round-trip.
- The `docker` job in CI exists because both Dockerfiles silently failed to
  build for a period (npm-workspaces lockfile scoping bug — see
  `server/Dockerfile`'s comment); a broken Docker build is now a required
  check on every PR, not something only discovered during an actual deploy.
