# Build context is the MONOREPO ROOT, not this directory — see
# docker-compose.yml (`build.context: .`). Same reasoning as server/Dockerfile:
# one shared npm-workspaces lockfile lives at the repo root; `npm ci` needs it.
#
# Note: this image is used for the *local, fully-Dockerized dev* path
# (docker-compose.yml). Production deploys the frontend to S3 + CloudFront
# instead (see scripts/deploy-frontend.sh, docs/DEPLOYMENT.md) — a static
# SPA doesn't need its own server/container in production, and this image
# is not part of docker-compose.prod.yml.

# --- deps ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/package.json
# --ignore-scripts: the root package.json's `prepare` script sets up husky
# git hooks, which requires a .git directory (never present in a Docker
# build context) and only matters for local development anyway.
# The `mkdir -p` guards against npm workspaces sometimes hoisting *every*
# client dependency to the root node_modules with no workspace-local
# overrides at all (unlike server/, which does need some — see
# server/Dockerfile) — the later COPY --from=deps of this directory must
# have something to copy either way.
RUN npm ci --workspace=client --ignore-scripts && mkdir -p client/node_modules

# --- build: Vite bakes VITE_* env vars in at build time, not runtime ---
FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/client/node_modules ./client/node_modules
COPY client ./client
RUN npm run build --workspace=client

# --- runtime: static files served by nginx ---
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
