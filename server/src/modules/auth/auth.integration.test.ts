import request from 'supertest';

import { createApp } from '../../app';
import { redis } from '../../config/redis';
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

const credentials = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'correct-horse' };

describe('auth flow (register → login → me → refresh → logout)', () => {
  it('registers a new user and returns an access token + refresh cookie', async () => {
    const res = await request(app).post('/api/v1/auth/register').send(credentials);

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(credentials.email);
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(res.headers['set-cookie']?.[0]).toMatch(/refreshToken=/);
  });

  it('rejects registering the same email twice', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials);
    const res = await request(app).post('/api/v1/auth/register').send(credentials);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects login with the wrong password', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('logs in and can access a protected route with the access token', async () => {
    await request(app).post('/api/v1/auth/register').send(credentials);
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password });

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.data.accessToken as string}`);

    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(credentials.email);
  });

  it('rejects a protected route with no token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rotates the refresh token via the cookie and issues a new access token', async () => {
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/register').send(credentials);

    const refreshed = await agent.post('/api/v1/auth/refresh');

    expect(refreshed.status).toBe(200);
    expect(typeof refreshed.body.data.accessToken).toBe('string');
  });

  it('rejects refresh with no cookie at all', async () => {
    const res = await request(app).post('/api/v1/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('logs out and invalidates the session so refresh no longer works', async () => {
    const agent = request.agent(app);
    const register = await agent.post('/api/v1/auth/register').send(credentials);

    await agent
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${register.body.data.accessToken as string}`);

    const refreshed = await agent.post('/api/v1/auth/refresh');
    expect(refreshed.status).toBe(401);
  });
});

describe('session management', () => {
  it('lists the current session and flags it as current', async () => {
    const register = await request(app).post('/api/v1/auth/register').send(credentials);
    const token = register.body.data.accessToken as string;

    const res = await request(app).get('/api/v1/auth/sessions').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isCurrent).toBe(true);
  });

  it('lets a user revoke one of their own sessions by id', async () => {
    const register = await request(app).post('/api/v1/auth/register').send(credentials);
    const token = register.body.data.accessToken as string;

    const sessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${token}`);
    const sessionId = sessions.body.data[0].id as string;

    const revoke = await request(app)
      .delete(`/api/v1/auth/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(revoke.status).toBe(200);
  });

  it('404s revoking a session that does not belong to the caller', async () => {
    const userA = await request(app).post('/api/v1/auth/register').send(credentials);
    const userB = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Bob', email: 'bob@example.com', password: 'correct-horse' });

    const aSessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${userA.body.data.accessToken as string}`);
    const aSessionId = aSessions.body.data[0].id as string;

    const res = await request(app)
      .delete(`/api/v1/auth/sessions/${aSessionId}`)
      .set('Authorization', `Bearer ${userB.body.data.accessToken as string}`);

    expect(res.status).toBe(404);
  });
});
