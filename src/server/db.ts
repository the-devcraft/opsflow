import { MongoClient, ObjectId, type Db, type ClientSession } from 'mongodb';
import type { CreateRequestInput, Role, RequestState } from '../shared/contracts.js';
export interface User {
  _id: ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}
export interface Workspace {
  _id: ObjectId;
  name: string;
  ownerId: ObjectId;
  sequence: number;
  createdAt: Date;
}
export interface Membership {
  _id: ObjectId;
  workspaceId: ObjectId;
  userId: ObjectId;
  role: Role;
}
export interface Session {
  _id: ObjectId;
  tokenHash: string;
  userId: ObjectId;
  expiresAt: Date;
}
export interface OperationRequest extends CreateRequestInput {
  _id: ObjectId;
  workspaceId: ObjectId;
  number: number;
  state: RequestState;
  version: number;
  authorId: ObjectId;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
  decisionNote?: string;
  requestKey: string;
  payloadHash: string;
}
export interface Audit {
  _id: ObjectId;
  workspaceId: ObjectId;
  actorId: ObjectId;
  actorName: string;
  action: string;
  entityId: ObjectId;
  detail: string;
  createdAt: Date;
}
export interface Job {
  _id: ObjectId;
  workspaceId: ObjectId;
  requestId: ObjectId;
  message: string;
  recipients: ObjectId[];
  state: 'ready' | 'leased' | 'done' | 'dead';
  attempts: number;
  availableAt: Date;
  leaseToken?: string;
  leaseUntil?: Date;
  lastError?: string;
  createdAt: Date;
}
export interface Notification {
  _id: ObjectId;
  workspaceId: ObjectId;
  userId: ObjectId;
  jobId: ObjectId;
  requestId: ObjectId;
  message: string;
  read: boolean;
  createdAt: Date;
}
export function collections(db: Db) {
  return {
    users: db.collection<User>('users'),
    workspaces: db.collection<Workspace>('workspaces'),
    members: db.collection<Membership>('memberships'),
    sessions: db.collection<Session>('sessions'),
    requests: db.collection<OperationRequest>('requests'),
    audit: db.collection<Audit>('audit'),
    jobs: db.collection<Job>('jobs'),
    notifications: db.collection<Notification>('notifications'),
  };
}
export async function initializeDb(db: Db) {
  const c = collections(db);
  await Promise.all([
    c.users.createIndex({ email: 1 }, { unique: true }),
    c.sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.members.createIndex({ workspaceId: 1, userId: 1 }, { unique: true }),
    c.members.createIndex({ userId: 1 }),
    c.requests.createIndex({ workspaceId: 1, authorId: 1, requestKey: 1 }, { unique: true }),
    c.requests.createIndex({ workspaceId: 1, number: 1 }, { unique: true }),
    c.requests.createIndex({ workspaceId: 1, state: 1, _id: -1 }),
    c.audit.createIndex({ workspaceId: 1, _id: -1 }),
    c.jobs.createIndex({ state: 1, availableAt: 1, leaseUntil: 1 }),
    c.notifications.createIndex({ jobId: 1, userId: 1 }, { unique: true }),
    c.notifications.createIndex({ workspaceId: 1, userId: 1, _id: -1 }),
  ]);
}
export interface Store {
  client: MongoClient;
  db: Db;
}
export async function connect(uri: string): Promise<Store> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db();
  await initializeDb(db);
  return { client, db };
}
export async function transaction<T>(
  store: Store,
  fn: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = store.client.startSession();
  try {
    const result = await session.withTransaction(() => fn(session));
    return result as T;
  } finally {
    await session.endSession();
  }
}
