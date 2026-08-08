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
});

afterAll(async () => {
  await disconnectTestDB();
  await Promise.all([aiQueue.close(), emailSyncQueue.close(), emailProcessingQueue.close()]);
  redis.disconnect();
});

/** Registers a user and seeds one connected mailbox with the given emails. Returns the access token. */
async function seedUserWithEmails(
  email: string,
  emails: Array<{ subject: string; isRead: boolean; aiCategory?: string; aiPriority?: string }>,
): Promise<string> {
  const register = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Test User', email, password: 'correct-horse' });
  const token = register.body.data.accessToken as string;
  const userId = register.body.data.user._id as string;

  const account = await EmailAccount.create({
    user: userId,
    provider: 'google',
    emailAddress: email,
    accessTokenEncrypted: 'irrelevant-for-this-test',
    refreshTokenEncrypted: 'irrelevant-for-this-test',
    tokenExpiresAt: new Date(Date.now() + 3600_000),
  });

  for (const [i, e] of emails.entries()) {
    const thread = await Thread.create({
      emailAccount: account._id,
      providerThreadId: `thread-${i}`,
      subject: e.subject,
      lastMessageAt: new Date(),
    });

    await Email.create({
      thread: thread._id,
      emailAccount: account._id,
      providerMessageId: `msg-${i}`,
      from: 'sender@example.com',
      subject: e.subject,
      receivedAt: new Date(),
      isRead: e.isRead,
      aiCategory: e.aiCategory ?? null,
      aiPriority: e.aiPriority ?? null,
    });
  }

  return token;
}

describe('GET /api/v1/emails', () => {
  it('returns an empty list for a user with no synced emails', async () => {
    const register = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Empty User', email: 'empty@example.com', password: 'correct-horse' });

    const res = await request(app)
      .get('/api/v1/emails')
      .set('Authorization', `Bearer ${register.body.data.accessToken as string}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('filters by isRead=false without matching read emails (regression: string coercion bug)', async () => {
    const token = await seedUserWithEmails('reader@example.com', [
      { subject: 'Unread one', isRead: false },
      { subject: 'Already read', isRead: true },
    ]);

    const res = await request(app)
      .get('/api/v1/emails?isRead=false')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].subject).toBe('Unread one');
  });

  it('filters by aiPriority', async () => {
    const token = await seedUserWithEmails('priority@example.com', [
      { subject: 'Urgent thing', isRead: false, aiPriority: 'high' },
      { subject: 'Whenever', isRead: false, aiPriority: 'low' },
    ]);

    const res = await request(app)
      .get('/api/v1/emails?aiPriority=high')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].subject).toBe('Urgent thing');
  });

  it('never returns another user\'s emails', async () => {
    await seedUserWithEmails('victim@example.com', [{ subject: 'Private', isRead: false }]);
    const attackerRegister = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Attacker', email: 'attacker@example.com', password: 'correct-horse' });

    const res = await request(app)
      .get('/api/v1/emails')
      .set('Authorization', `Bearer ${attackerRegister.body.data.accessToken as string}`);

    expect(res.body.data).toEqual([]);
  });
});
