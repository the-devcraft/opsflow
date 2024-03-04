import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { ObjectId } from 'mongodb';
import { createApp } from '../src/server/app.js';
import { collections, connect, type Store, type User } from '../src/server/db.js';
import { hashPassword } from '../src/server/security.js';
import { createWorkspace, changeMember } from '../src/server/services.js';
import { claimJob, deliverJob, processNextJob } from '../src/server/worker.js';
const ORIGIN = 'http://127.0.0.1:4000';
const PASSWORD = 'A-good-test-password!';
const input = {
  title: 'New monitoring workspace',
  description: 'The platform team needs shared monitoring access for incident response.',
  category: 'access',
  priority: 'high',
  amountCents: 0,
};
let mongo: MongoMemoryReplSet;
let store: Store;
let app: ReturnType<typeof createApp>;
let owner: User;
let approver: User;
let member: User;
let outsider: User;
let workspaceId: string;
let otherWorkspaceId: string;
let passwordHash: string;
type Agent = ReturnType<typeof request.agent>;
async function signIn(user: User) {
  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .set('Origin', ORIGIN)
    .send({ email: user.email, password: PASSWORD })
    .expect(200);
  return agent;
}
async function create(agent: Agent, key = crypto.randomUUID(), payload = input) {
  const result = await agent
    .post(`/api/workspaces/${workspaceId}/requests`)
    .set('Origin', ORIGIN)
    .set('Idempotency-Key', key)
    .send(payload)
    .expect(201);
  return result.body;
}
async function transition(agent: Agent, id: string, action: string, version: number, note = '') {
  return agent
    .post(`/api/workspaces/${workspaceId}/requests/${id}/transitions`)
    .set('Origin', ORIGIN)
    .send({ action, version, note });
}
beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ binary: { version: '8.2.6' }, replSet: { count: 1 } });
  store = await connect(mongo.getUri('opsflow_test'));
  passwordHash = await hashPassword(PASSWORD);
}, 120000);
beforeEach(async () => {
  for (const collection of Object.values(collections(store.db))) await collection.deleteMany({});
  const users = [
    ['Alice Owner', 'alice@example.com'],
    ['Robin Reviewer', 'robin@example.com'],
    ['Taylor Member', 'taylor@example.com'],
    ['Morgan Outside', 'morgan@example.com'],
  ].map(([name, email]) => ({
    _id: new ObjectId(),
    name: name!,
    email: email!,
    passwordHash,
    createdAt: new Date(),
  }));
  [owner, approver, member, outsider] = users as [User, User, User, User];
  await collections(store.db).users.insertMany(users);
  workspaceId = (await createWorkspace(store, owner, 'Tenant A')).id;
  otherWorkspaceId = (await createWorkspace(store, outsider, 'Tenant B')).id;
  await changeMember(store, new ObjectId(workspaceId), owner, 'owner', approver.email, 'approver');
  await changeMember(store, new ObjectId(workspaceId), owner, 'owner', member.email, 'member');
  app = createApp(store, {
    origin: ORIGIN,
    secureCookies: false,
    serveWeb: false,
    demo: false,
    authLimit: 100,
  });
});
afterAll(async () => {
  await store?.client.close();
  await mongo?.stop();
});
describe('Authentication and request boundary', () => {
  it('registers with a private cookie and never exposes password material', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .send({ name: 'New Person', email: 'NEW@example.com', password: PASSWORD })
      .expect(201);
    expect(response.body.user.email).toBe('new@example.com');
    expect(JSON.stringify(response.body)).not.toMatch(/password|scrypt|tokenHash/);
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(
      (await collections(store.db).users.findOne({ email: 'new@example.com' }))?.passwordHash,
    ).toMatch(/^scrypt:/);
  });
  it('requires authentication and rejects incorrect passwords without account disclosure', async () => {
    await request(app).get('/api/me').expect(401);
    const a = await request(app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: owner.email, password: 'incorrect' })
      .expect(401);
    const b = await request(app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'missing@example.com', password: 'incorrect' })
      .expect(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });
  it('revokes a copied session token on logout', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: owner.email, password: PASSWORD });
    const cookie = String(response.headers['set-cookie']![0]).split(';')[0]!;
    await request(app)
      .post('/api/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(204);
    await request(app).get('/api/me').set('Cookie', cookie).expect(401);
  });
  it('does not accept expired sessions before the TTL cleanup runs', async () => {
    const agent = await signIn(owner);
    await collections(store.db).sessions.updateMany({}, { $set: { expiresAt: new Date(0) } });
    await agent.get('/api/me').expect(401);
  });
  it('blocks cross-origin and missing-origin writes', async () => {
    await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({ email: owner.email, password: PASSWORD })
      .expect(403);
    await request(app)
      .post('/api/auth/login')
      .send({ email: owner.email, password: PASSWORD })
      .expect(403);
  });
  it('rejects malformed JSON, unknown fields, invalid IDs, and oversized bodies', async () => {
    await request(app)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .send('{broken')
      .expect(400);
    const agent = await signIn(owner);
    await agent
      .post(`/api/workspaces/${workspaceId}/requests`)
      .set('Origin', ORIGIN)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ ...input, workspaceId: otherWorkspaceId })
      .expect(400);
    await agent.get('/api/workspaces/not-an-id/requests').expect(400);
    await agent
      .post(`/api/workspaces/${workspaceId}/requests`)
      .set('Origin', ORIGIN)
      .send({ ...input, description: 'x'.repeat(40000) })
      .expect(413);
  });
  it('rate-limits password attempts', async () => {
    const limited = createApp(store, {
      origin: ORIGIN,
      secureCookies: false,
      serveWeb: false,
      demo: false,
      authLimit: 2,
    });
    for (let n = 0; n < 2; n++)
      await request(limited)
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: owner.email, password: 'bad' })
        .expect(401);
    await request(limited)
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: owner.email, password: 'bad' })
      .expect(429);
  });
});
describe('Tenant isolation and membership', () => {
  it('does not list another tenant or expose its requests, people, audit, or notifications', async () => {
    const agent = await signIn(owner);
    const session = await agent.get('/api/me').expect(200);
    expect(session.body.workspaces.map((w: { id: string }) => w.id)).toEqual([workspaceId]);
    for (const route of ['requests', 'members', 'audit', 'summary', 'notifications'])
      await agent.get(`/api/workspaces/${otherWorkspaceId}/${route}`).expect(404);
    await agent
      .post(`/api/workspaces/${otherWorkspaceId}/requests`)
      .set('Origin', ORIGIN)
      .set('Idempotency-Key', crypto.randomUUID())
      .send(input)
      .expect(404);
  });
  it('scopes individual request IDs even when the user owns both workspaces', async () => {
    const agent = await signIn(owner);
    const r = await create(agent);
    const second = await agent
      .post('/api/workspaces')
      .set('Origin', ORIGIN)
      .send({ name: 'Second workspace' })
      .expect(201);
    await agent.get(`/api/workspaces/${second.body.id}/requests/${r.id}`).expect(404);
    await agent
      .post(`/api/workspaces/${second.body.id}/requests/${r.id}/transitions`)
      .set('Origin', ORIGIN)
      .send({ action: 'submit', version: 1 })
      .expect(404);
    const empty = await agent.get(`/api/workspaces/${second.body.id}/requests`).expect(200);
    expect(empty.body.items).toEqual([]);
  });
  it('limits role assignment and prevents owner removal', async () => {
    const ordinary = await signIn(member);
    await ordinary
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Origin', ORIGIN)
      .send({ email: outsider.email, role: 'approver' })
      .expect(403);
    const admin = await signIn(owner);
    await admin
      .delete(`/api/workspaces/${workspaceId}/members/${owner._id}`)
      .set('Origin', ORIGIN)
      .expect(403);
    await admin
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Origin', ORIGIN)
      .send({ email: outsider.email, role: 'admin' })
      .expect(204);
    const delegated = await signIn(outsider);
    await delegated
      .post(`/api/workspaces/${workspaceId}/members`)
      .set('Origin', ORIGIN)
      .send({ email: member.email, role: 'admin' })
      .expect(403);
  });
  it('revokes tenant access immediately without requiring logout', async () => {
    const ordinary = await signIn(member);
    const admin = await signIn(owner);
    await ordinary.get(`/api/workspaces/${workspaceId}/requests`).expect(200);
    await admin
      .delete(`/api/workspaces/${workspaceId}/members/${member._id}`)
      .set('Origin', ORIGIN)
      .expect(204);
    await ordinary.get(`/api/workspaces/${workspaceId}/requests`).expect(404);
  });
});
describe('Request state machine and transactions', () => {
  it('completes an independently reviewed request with audit and outbox records', async () => {
    const author = await signIn(member);
    const reviewer = await signIn(approver);
    const r = await create(author);
    const submitted = await transition(author, r.id, 'submit', 1);
    expect(submitted.status).toBe(200);
    expect(submitted.body.state).toBe('submitted');
    const approved = await transition(reviewer, r.id, 'approve', 2, 'Approved after review.');
    expect(approved.status).toBe(200);
    expect(approved.body.version).toBe(3);
    expect(await collections(store.db).audit.countDocuments({ entityId: new ObjectId(r.id) })).toBe(
      3,
    );
    expect(await collections(store.db).jobs.countDocuments({ requestId: new ObjectId(r.id) })).toBe(
      2,
    );
    const summary = await reviewer.get(`/api/workspaces/${workspaceId}/summary`);
    expect(summary.body).toMatchObject({ approved: 1, submitted: 0, total: 1 });
  });
  it('does not allow requesters to approve themselves, even owners', async () => {
    const agent = await signIn(owner);
    const r = await create(agent);
    await transition(agent, r.id, 'submit', 1);
    expect((await transition(agent, r.id, 'approve', 2)).status).toBe(403);
    expect((await collections(store.db).requests.findOne({ _id: new ObjectId(r.id) }))?.state).toBe(
      'submitted',
    );
  });
  it('allows only the author to submit drafts and only reviewers to decide', async () => {
    const author = await signIn(member);
    const reviewer = await signIn(approver);
    const r = await create(author);
    expect((await transition(reviewer, r.id, 'submit', 1)).status).toBe(403);
    const other = await create(reviewer);
    await transition(reviewer, other.id, 'submit', 1);
    expect((await transition(author, other.id, 'approve', 2)).status).toBe(403);
  });
  it('requires a rejection reason and never reopens resolved requests', async () => {
    const author = await signIn(member);
    const reviewer = await signIn(approver);
    const r = await create(author);
    await transition(author, r.id, 'submit', 1);
    expect((await transition(reviewer, r.id, 'reject', 2)).status).toBe(400);
    expect((await transition(reviewer, r.id, 'reject', 2, 'Duplicate request.')).status).toBe(200);
    expect((await transition(reviewer, r.id, 'approve', 3)).status).toBe(409);
  });
  it('makes retries idempotent and rejects a reused key with a different payload', async () => {
    const agent = await signIn(member);
    const key = crypto.randomUUID();
    const first = await create(agent, key);
    const second = await create(agent, key);
    expect(second.id).toBe(first.id);
    expect(await collections(store.db).requests.countDocuments()).toBe(1);
    await agent
      .post(`/api/workspaces/${workspaceId}/requests`)
      .set('Origin', ORIGIN)
      .set('Idempotency-Key', key)
      .send({ ...input, title: 'Different details' })
      .expect(409);
    expect(
      await collections(store.db).audit.countDocuments({ entityId: new ObjectId(first.id) }),
    ).toBe(1);
  });
  it('deduplicates concurrent creates and advances the tenant sequence once', async () => {
    const agent = await signIn(member);
    const key = crypto.randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        agent
          .post(`/api/workspaces/${workspaceId}/requests`)
          .set('Origin', ORIGIN)
          .set('Idempotency-Key', key)
          .send(input),
      ),
    );
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(
      (await collections(store.db).workspaces.findOne({ _id: new ObjectId(workspaceId) }))
        ?.sequence,
    ).toBe(1);
  });
  it('allows exactly one of two conflicting decisions to commit', async () => {
    const author = await signIn(member);
    const reviewer = await signIn(approver);
    const r = await create(author);
    await transition(author, r.id, 'submit', 1);
    const results = await Promise.all([
      transition(reviewer, r.id, 'approve', 2, 'Reviewed.'),
      transition(reviewer, r.id, 'reject', 2, 'Not in scope.'),
    ]);
    expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(await collections(store.db).audit.countDocuments({ entityId: new ObjectId(r.id) })).toBe(
      3,
    );
    expect(await collections(store.db).jobs.countDocuments({ requestId: new ObjectId(r.id) })).toBe(
      2,
    );
  });
  it('rolls back request creation if its audit write fails', async () => {
    const agent = await signIn(member);
    const before = await collections(store.db).audit.countDocuments();
    await collections(store.db).audit.createIndex(
      { action: 1 },
      { unique: true, partialFilterExpression: { action: 'request.created' } },
    );
    try {
      await create(agent);
      await agent
        .post(`/api/workspaces/${workspaceId}/requests`)
        .set('Origin', ORIGIN)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ ...input, title: 'This must roll back' })
        .expect(500);
      expect(await collections(store.db).requests.countDocuments()).toBe(1);
      expect(await collections(store.db).audit.countDocuments()).toBe(before + 1);
      expect(
        (await collections(store.db).workspaces.findOne({ _id: new ObjectId(workspaceId) }))
          ?.sequence,
      ).toBe(1);
    } finally {
      await collections(store.db).audit.dropIndex('action_1');
    }
  });
  it('paginates without repeats and escapes regular-expression search text', async () => {
    const agent = await signIn(member);
    for (let n = 0; n < 4; n++)
      await create(agent, crypto.randomUUID(), { ...input, title: `Request ${n} [review]` });
    const first = await agent.get(`/api/workspaces/${workspaceId}/requests?limit=2`);
    const next = await agent.get(
      `/api/workspaces/${workspaceId}/requests?limit=2&cursor=${first.body.nextCursor}`,
    );
    expect(new Set([...first.body.items, ...next.body.items].map((r) => r.id)).size).toBe(4);
    expect(next.body.nextCursor).toBeNull();
    const literal = await agent.get(`/api/workspaces/${workspaceId}/requests?q=%5Breview%5D`);
    expect(literal.body.items).toHaveLength(4);
  });
});
describe('Transactional outbox and worker recovery', () => {
  async function submitted() {
    const agent = await signIn(member);
    const r = await create(agent);
    await transition(agent, r.id, 'submit', 1);
    return r;
  }
  it('claims a job once across competing workers', async () => {
    await submitted();
    const claims = await Promise.all(Array.from({ length: 6 }, () => claimJob(store)));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });
  it('delivers once per recipient even when the same job is retried', async () => {
    await submitted();
    const job = await claimJob(store);
    expect(job).not.toBeNull();
    await deliverJob(store, job!);
    await deliverJob(store, job!);
    expect(await collections(store.db).notifications.countDocuments()).toBe(2);
    expect((await collections(store.db).jobs.findOne({ _id: job!._id }))?.state).toBe('done');
  });
  it('recovers an expired lease after partial delivery', async () => {
    await submitted();
    const job = (await claimJob(store))!;
    const userId = job.recipients[0]!;
    await collections(store.db).notifications.insertOne({
      _id: new ObjectId(),
      workspaceId: job.workspaceId,
      userId,
      jobId: job._id,
      requestId: job.requestId,
      message: job.message,
      read: false,
      createdAt: new Date(),
    });
    await collections(store.db).jobs.updateOne(
      { _id: job._id },
      { $set: { leaseUntil: new Date(0) } },
    );
    expect(await processNextJob(store)).toBe(true);
    expect(await collections(store.db).notifications.countDocuments()).toBe(2);
    expect((await collections(store.db).jobs.findOne({ _id: job._id }))?.attempts).toBe(2);
  });
  it('skips revoked members and scopes notification reads to the recipient', async () => {
    await submitted();
    await collections(store.db).members.deleteOne({
      workspaceId: new ObjectId(workspaceId),
      userId: approver._id,
    });
    await processNextJob(store);
    expect(await collections(store.db).notifications.countDocuments()).toBe(1);
    const ownerAgent = await signIn(owner);
    const memberAgent = await signIn(member);
    const inbox = await ownerAgent.get(`/api/workspaces/${workspaceId}/notifications`);
    expect(inbox.body).toHaveLength(1);
    await memberAgent
      .post(`/api/workspaces/${workspaceId}/notifications/${inbox.body[0].id}/read`)
      .set('Origin', ORIGIN)
      .expect(404);
    await ownerAgent
      .post(`/api/workspaces/${workspaceId}/notifications/${inbox.body[0].id}/read`)
      .set('Origin', ORIGIN)
      .expect(204);
  });
  it('dead-letters jobs that exhaust the lease retry limit', async () => {
    await submitted();
    const job = (await claimJob(store))!;
    await collections(store.db).jobs.updateOne(
      { _id: job._id },
      { $set: { attempts: 5, leaseUntil: new Date(0) } },
    );
    expect(await processNextJob(store)).toBe(false);
    expect((await collections(store.db).jobs.findOne({ _id: job._id }))?.state).toBe('dead');
  });
  it('backs off a failed delivery and completes it on a later attempt', async () => {
    await submitted();
    const now = new Date();
    await processNextJob(store, now, async () => {
      throw new Error('Simulated sink failure');
    });
    const job = await collections(store.db).jobs.findOne({});
    expect(job?.state).toBe('ready');
    expect(job?.availableAt.getTime()).toBeGreaterThan(now.getTime());
    expect(await processNextJob(store, now)).toBe(false);
    expect(await processNextJob(store, new Date(now.getTime() + 60000))).toBe(true);
    expect(await collections(store.db).notifications.countDocuments()).toBe(2);
  });
});
