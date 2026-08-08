import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

/**
 * Real API/integration tests need a real MongoDB to exercise actual
 * queries, indexes (including unique-index dedupe behavior), and
 * aggregation pipelines — mocking Mongoose would test our mocks, not our
 * code. `mongodb-memory-server` downloads and runs a real `mongod` binary
 * in-process, so this needs no external service (unlike Redis, which the
 * app's rate limiters and BullMQ queues connect to eagerly at import time —
 * see docs/DEPLOYMENT.md's CI section for why a Redis service container is
 * still required).
 *
 * One in-memory server per test *file* (not one for the whole run) is a
 * deliberate simplicity/isolation tradeoff: each file pays ~1-2s startup
 * cost, but in exchange gets a guaranteed-clean database with no risk of
 * state leaking between files, and no cross-process env-propagation
 * subtleties to reason about (the alternative, Jest's `globalSetup`, runs
 * in a separate process and requires care to hand the connection string to
 * test workers). With a test suite this size, the startup cost is
 * negligible.
 */
let mongoServer: MongoMemoryServer | undefined;

export async function connectTestDB(): Promise<void> {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

export async function disconnectTestDB(): Promise<void> {
  await mongoose.disconnect();
  await mongoServer?.stop();
  mongoServer = undefined;
}

export async function clearTestDB(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
