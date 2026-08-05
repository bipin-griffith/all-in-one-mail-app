import { redis } from '../../../config/redis';

import { emailSyncQueue, enqueueEmailSync } from './emailSync.queue';

/**
 * Regression test for a real bug: BullMQ rejects custom job ids containing
 * ':' (it uses that as an internal Redis key delimiter), but nothing short
 * of actually calling `.add()` against a real Redis catches that — it's not
 * a type error, and unit tests that mock BullMQ would miss it too. This is
 * exactly the class of bug that broke Gmail sync silently in practice: the
 * job never actually got created, so it also never completed or failed —
 * the account just sat on `syncStatus: 'syncing'` forever.
 *
 * This deliberately doesn't fetch/remove the job afterwards: a worker
 * process consuming the real queue concurrently (as happens in local dev)
 * can lock the job between enqueue and cleanup, making that assertion
 * flaky for reasons unrelated to what this test actually checks.
 */
describe('enqueueEmailSync', () => {
  afterAll(async () => {
    await emailSyncQueue.close();
    redis.disconnect();
  });

  it('successfully enqueues a job with a valid BullMQ job id', async () => {
    const accountId = '507f1f77bcf86cd799439099';
    const jobId = await enqueueEmailSync(accountId);
    expect(jobId).toBe(`sync-${accountId}`);
  });
});
