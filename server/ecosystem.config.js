/**
 * PM2 process definitions, run inside the production Docker image via
 * `pm2-runtime` (the Docker-friendly PM2 command — runs in the foreground
 * and forwards signals properly, unlike plain `pm2 start` which daemonizes).
 * See docs/DEPLOYMENT.md for why PM2 runs *inside* Docker rather than being
 * an alternative to it.
 *
 * Two apps, started independently (`--only api` / `--only worker`) by the
 * `server` and `worker` docker-compose services respectively — each
 * container still runs exactly one Node role, matching the rest of this
 * project's "server and worker scale independently" architecture
 * (docs/ARCHITECTURE.md). This file exists so both role definitions live in
 * one reviewable place instead of scattered across inline CLI flags in
 * multiple Dockerfiles/compose files.
 */
module.exports = {
  apps: [
    {
      name: 'api',
      script: 'dist/server.js',
      // Cluster mode: PM2 forks one process per CPU core and load-balances
      // across them — this is what actually makes multi-core EC2 instances
      // useful for a single Node app (Node itself is single-threaded).
      exec_mode: 'cluster',
      instances: 'max',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'worker',
      script: 'dist/modules/queue/worker.js',
      // Fork mode, single instance: BullMQ concurrency is already
      // controlled by WORKER_CONCURRENCY inside the process, and
      // horizontal scale-out is controlled by docker-compose's `replicas`
      // — clustering this with PM2 *too* would multiply concurrency in a
      // way neither of those settings accounts for.
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production' },
    },
  ],
};
