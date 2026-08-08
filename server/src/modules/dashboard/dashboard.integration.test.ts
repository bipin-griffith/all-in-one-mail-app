import request from 'supertest';

import { createApp } from '../../app';
import { redis } from '../../config/redis';
import { Email } from '../../models/email.model';
import { EmailAccount } from '../../models/emailAccount.model';
import { Thread } from '../../models/thread.model';
import { clearTestDB, connectTestDB, disconnectTestDB } from '../../test/dbTestHelper';
import { aiQueue } from '../queue/queues/ai.queue';
import { emailProcessingQueue } from '../queue/queues/emailProcessing.queue';
import { emailSyncQueue } from '../queue/queues/emailSync.queue';

const app = createApp();

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
  // The dashboard cache middleware (cache.middleware.ts) is keyed per-user
  // in Redis, but tests reuse the same Redis instance across runs — flush
  // it so one test's cached response can't leak into the next.
  await redis.flushdb();
});

afterAll(async () => {
  await disconnectTestDB();
  await Promise.all([aiQueue.close(), emailSyncQueue.close(), emailProcessingQueue.close()]);
  redis.disconnect();
});

async function registerAndSeed(email: string): Promise<string> {
  const register = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Dash User', email, password: 'correct-horse' });
  const token = register.body.data.accessToken as string;
  const userId = register.body.data.user._id as string;

  const account = await EmailAccount.create({
    user: userId,
    provider: 'google',
    emailAddress: email,
    accessTokenEncrypted: 'x',
    refreshTokenEncrypted: 'x',
    tokenExpiresAt: new Date(Date.now() + 3600_000),
  });

  const senders = ['alice@corp.com', 'alice@corp.com', 'bob@shop.com'];
  for (const [i, from] of senders.entries()) {
    const thread = await Thread.create({
      emailAccount: account._id,
      providerThreadId: `t-${i}`,
      subject: `Subject ${i}`,
      lastMessageAt: new Date(),
    });
    await Email.create({
      thread: thread._id,
      emailAccount: account._id,
      providerMessageId: `m-${i}`,
      from,
      subject: `Subject ${i}`,
      receivedAt: new Date(),
      aiCategory: i === 0 ? 'jobs' : null,
      aiPriority: i === 0 ? 'high' : null,
    });
  }

  return token;
}

describe('GET /api/v1/dashboard/category/:aiCategory', () => {
  it('returns aggregate counts scoped to the caller only', async () => {
    const token = await registerAndSeed('dash1@example.com');

    const res = await request(app)
      .get('/api/v1/dashboard/category/jobs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.byPriority.high).toBe(1);
  });

  it('rejects a category outside the fixed taxonomy', async () => {
    const token = await registerAndSeed('dash2@example.com');
    const res = await request(app)
      .get('/api/v1/dashboard/category/not-a-real-category')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/dashboard/top-senders', () => {
  it('ranks senders by email count, scoped to the caller', async () => {
    const token = await registerAndSeed('dash3@example.com');

    const res = await request(app)
      .get('/api/v1/dashboard/top-senders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ from: 'alice@corp.com', count: 2 });
  });

  it('never mixes one user\'s aggregate results into another user\'s cached response', async () => {
    const tokenA = await registerAndSeed('dashA@example.com');
    const registerB = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'User B', email: 'dashB@example.com', password: 'correct-horse' });
    const tokenB = registerB.body.data.accessToken as string;

    const resA = await request(app)
      .get('/api/v1/dashboard/top-senders')
      .set('Authorization', `Bearer ${tokenA}`);
    const resB = await request(app)
      .get('/api/v1/dashboard/top-senders')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(resA.body.data.length).toBeGreaterThan(0);
    expect(resB.body.data).toEqual([]);
  });
});
