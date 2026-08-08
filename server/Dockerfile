# Build context is the MONOREPO ROOT, not this directory — see
# docker-compose.yml / docker-compose.prod.yml (`build.context: .`) and
# .github/workflows/cd.yml. This is an npm-workspaces monorepo with one
# shared lockfile at the repo root; a build context scoped to ./server can
# never see it, and `npm ci` hard-fails without an exact lockfile match.
# (This bit the very first version of this Dockerfile — `docker build` from
# ./server alone fails immediately on `npm ci`. If you're wondering why
# every COPY below is rooted at the repo root, that's why.)

# --- deps: install once, reused by build and runtime stages ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
# --ignore-scripts: the root package.json's `prepare` script sets up husky
# git hooks, which requires a .git directory (never present in a Docker
# build context) and only matters for local development anyway.
# `mkdir -p` guards the later COPY --from=deps of this directory: it only
# exists at all because some server deps need a workspace-local override
# version (see docs/AI_PIPELINE.md's sanitize-html/html-to-text pinning) —
# if that ever stops being true, the COPY must still have something to copy.
RUN npm ci --workspace=server --ignore-scripts && mkdir -p server/node_modules

# --- build: compile TypeScript ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server ./server
RUN npm run build --workspace=server

# --- production dependencies only ---
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
# --ignore-scripts: the root package.json's `prepare` script sets up husky
# git hooks, which requires a .git directory (never present in a Docker
# build context) and only matters for local development anyway.
RUN npm ci --workspace=server --ignore-scripts --omit=dev && mkdir -p server/node_modules

# --- runtime: minimal final image, non-root, no source/dev deps ---
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/server

# PM2 runs the app *inside* the container (pm2-runtime — the Docker-aware
# variant that stays in the foreground and forwards signals, unlike `pm2
# start`) for cluster-mode multi-core use and PM2's own process-level
# monitoring — see ecosystem.config.js and docs/DEPLOYMENT.md. Installed
# globally rather than as a workspace dependency since it's purely an
# operational/production concern, not something dev or the npm workspace
# graph needs.
RUN npm install -g pm2@5

COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY server/package.json server/ecosystem.config.js ./

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 5000

# Which app (api/worker) actually starts is chosen by `--only`, overridden
# per docker-compose service — see docker-compose.yml / docker-compose.prod.yml.
CMD ["pm2-runtime", "start", "ecosystem.config.js", "--only", "api"]
