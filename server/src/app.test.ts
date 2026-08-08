import mongoose from 'mongoose';
import request from 'supertest';

import { createApp } from './app';
import { redis } from './config/redis';
import { aiQueue } from './modules/queue/queues/ai.queue';
import { emailSyncQueue } from './modules/queue/queues/emailSync.queue';
import { connectTestDB, disconnectTestDB } from './test/dbTestHelper';

// Importing the app wires up routes that hold real Redis/BullMQ connections
// (rate limiter, queues) as module-level singletons, same as production.
// Close them here so Jest can exit cleanly instead of hanging on open handles.
afterAll(async () => {
  await Promise.all([aiQueue.close(), emailSyncQueue.close()]);
  redis.disconnect();
});

describe('GET /health', () => {
  it('returns 200 with no dependency checks (liveness)', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'ok' });
  });
});

describe('GET /health/ready', () => {
  // Explicit connect/disconnect in each test (rather than relying on "no
  // other test file has touched mongoose yet") — the default mongoose
  // connection is a shared singleton, so this suite's result must not
  // depend on what ran before it in the same Jest process.
  it('returns 503 with mongo:false when there is no database connection', async () => {
    await mongoose.disconnect();

    const app = createApp();
    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.data).toEqual({ mongo: false, redis: true });
  });

  it('returns 200 with mongo:true once connected', async () => {
    await connectTestDB();
    try {
      const app = createApp();
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ mongo: true, redis: true });
    } finally {
      await disconnectTestDB();
    }
  });
});

describe('GET /metrics', () => {
  it('exposes Prometheus-format metrics with no auth required', async () => {
    const app = createApp();
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.text).toContain('http_request_duration_seconds');
  });
});

describe('unknown route', () => {
  it('returns the standard 404 error envelope', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/does-not-exist');

    expect(res.status).toBe(404);
    expect((res.body as { success: boolean }).success).toBe(false);
  });
});
