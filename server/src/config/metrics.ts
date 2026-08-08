import client from 'prom-client';

/**
 * Prometheus-format metrics — scraped by CloudWatch Container Insights /
 * a Prometheus server, whichever the deployment target uses. Deliberately
 * NOT protected by application-level auth (no token, no login check): the
 * standard way to secure a `/metrics` endpoint is network isolation, not
 * app-layer auth — see docs/OPERATIONS.md for why (Nginx never proxies this
 * path externally, and the API only binds to localhost in production).
 */
export const metricsRegistry = new client.Registry();
client.collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry],
});

export const cacheHitsTotal = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total number of Redis response-cache hits',
  labelNames: ['route'],
  registers: [metricsRegistry],
});

export const cacheMissesTotal = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total number of Redis response-cache misses',
  labelNames: ['route'],
  registers: [metricsRegistry],
});
