import request from 'supertest';

import { createApp } from './app';
import { redis } from './config/redis';
import { aiQueue } from './modules/queue/queues/ai.queue';
import { emailSyncQueue } from './modules/queue/queues/emailSync.queue';

// Importing the app wires up routes that hold real Redis/BullMQ connections
// (rate limiter, queues) as module-level singletons, same as production.
// Close them here so Jest can exit cleanly instead of hanging on open handles.
afterAll(async () => {
  await Promise.all([aiQueue.close(), emailSyncQueue.close()]);
  redis.disconnect();
});

describe('GET /api/v1/health', () => {
  it('returns 200 and the standard success envelope', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'ok' });
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
