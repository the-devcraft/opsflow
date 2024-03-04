import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { collections, type Store, type Job } from './db.js';
export async function claimJob(store: Store, now = new Date()): Promise<Job | null> {
  return collections(store.db).jobs.findOneAndUpdate(
    {
      attempts: { $lt: 5 },
      $or: [
        { state: 'ready', availableAt: { $lte: now } },
        { state: 'leased', leaseUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        state: 'leased',
        leaseToken: randomUUID(),
        leaseUntil: new Date(now.getTime() + 30000),
      },
      $inc: { attempts: 1 },
    },
    { returnDocument: 'after', sort: { availableAt: 1 } },
  );
}
export async function deliverJob(store: Store, job: Job) {
  const c = collections(store.db);
  for (const userId of job.recipients) {
    if (!(await c.members.findOne({ workspaceId: job.workspaceId, userId }))) continue;
    await c.notifications.updateOne(
      { jobId: job._id, userId },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          workspaceId: job.workspaceId,
          userId,
          jobId: job._id,
          requestId: job.requestId,
          message: job.message,
          read: false,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  }
  await c.jobs.updateOne(
    { _id: job._id, state: 'leased', leaseToken: job.leaseToken },
    { $set: { state: 'done' }, $unset: { leaseUntil: '', leaseToken: '' } },
  );
}
export async function processNextJob(
  store: Store,
  now = new Date(),
  deliver: typeof deliverJob = deliverJob,
) {
  const c = collections(store.db);
  await c.jobs.updateMany(
    { state: 'leased', attempts: { $gte: 5 }, leaseUntil: { $lte: now } },
    {
      $set: { state: 'dead', lastError: 'Lease expired after retry limit.' },
      $unset: { leaseToken: '', leaseUntil: '' },
    },
  );
  const job = await claimJob(store, now);
  if (!job) return false;
  try {
    await deliver(store, job);
  } catch {
    await c.jobs.updateOne(
      { _id: job._id, leaseToken: job.leaseToken },
      {
        $set: {
          state: job.attempts >= 5 ? 'dead' : 'ready',
          lastError: 'Notification delivery failed.',
          availableAt: new Date(now.getTime() + Math.min(60000, 1000 * 2 ** job.attempts)),
        },
        $unset: { leaseToken: '', leaseUntil: '' },
      },
    );
  }
  return true;
}
export function startWorker(store: Store, onError: (error: unknown) => void = console.error) {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void>;
  const tick = async () => {
    try {
      await processNextJob(store);
    } catch (error) {
      onError(error);
    } finally {
      if (!stopped)
        timer = setTimeout(() => {
          running = tick();
        }, 750);
    }
  };
  running = tick();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    await running;
  };
}
