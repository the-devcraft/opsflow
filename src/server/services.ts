import { ObjectId, type ClientSession, MongoServerError } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { collections, transaction, type Store, type User, type OperationRequest } from './db.js';
import { AppError, sha256 } from './security.js';
import type { CreateRequestInput, Role } from '../shared/contracts.js';
export const requestView = (r: OperationRequest) => ({
  id: r._id.toHexString(),
  number: r.number,
  title: r.title,
  description: r.description,
  category: r.category,
  priority: r.priority,
  amountCents: r.amountCents,
  state: r.state,
  version: r.version,
  authorId: r.authorId.toHexString(),
  authorName: r.authorName,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  ...(r.decisionNote ? { decisionNote: r.decisionNote } : {}),
});
export async function audit(
  store: Store,
  session: ClientSession,
  workspaceId: ObjectId,
  user: User,
  action: string,
  entityId: ObjectId,
  detail: string,
) {
  await collections(store.db).audit.insertOne(
    {
      _id: new ObjectId(),
      workspaceId,
      actorId: user._id,
      actorName: user.name,
      action,
      entityId,
      detail,
      createdAt: new Date(),
    },
    { session },
  );
}
export async function createWorkspace(store: Store, user: User, name: string) {
  const workspaceId = new ObjectId();
  await transaction(store, async (session) => {
    await collections(store.db).workspaces.insertOne(
      { _id: workspaceId, name, ownerId: user._id, sequence: 0, createdAt: new Date() },
      { session },
    );
    await collections(store.db).members.insertOne(
      { _id: new ObjectId(), workspaceId, userId: user._id, role: 'owner' },
      { session },
    );
    await audit(store, session, workspaceId, user, 'workspace.created', workspaceId, name);
  });
  return { id: workspaceId.toHexString(), name, role: 'owner' as const };
}
export async function createRequest(
  store: Store,
  workspaceId: ObjectId,
  user: User,
  input: CreateRequestInput,
  key: string,
) {
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key))
    throw new AppError(
      400,
      'invalid_idempotency_key',
      'Provide an Idempotency-Key with 16–100 letters, numbers, hyphens or underscores.',
    );
  const c = collections(store.db);
  const payloadHash = sha256(JSON.stringify(input));
  const check = (existing: OperationRequest) => {
    if (existing.payloadHash !== payloadHash)
      throw new AppError(
        409,
        'idempotency_conflict',
        'This idempotency key was already used with different request details.',
      );
    return existing;
  };
  try {
    return await transaction(store, async (session) => {
      const existing = await c.requests.findOne(
        { workspaceId, authorId: user._id, requestKey: key },
        { session },
      );
      if (existing) return check(existing);
      const workspace = await c.workspaces.findOneAndUpdate(
        { _id: workspaceId },
        { $inc: { sequence: 1 } },
        { session, returnDocument: 'after' },
      );
      if (!workspace) throw new AppError(404, 'not_found', 'Workspace not found.');
      const now = new Date();
      const request: OperationRequest = {
        _id: new ObjectId(),
        workspaceId,
        ...input,
        number: workspace.sequence,
        state: 'draft',
        version: 1,
        authorId: user._id,
        authorName: user.name,
        createdAt: now,
        updatedAt: now,
        requestKey: key,
        payloadHash,
      };
      await c.requests.insertOne(request, { session });
      await audit(store, session, workspaceId, user, 'request.created', request._id, input.title);
      return request;
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      const existing = await c.requests.findOne({
        workspaceId,
        authorId: user._id,
        requestKey: key,
      });
      if (existing) return check(existing);
    }
    throw error;
  }
}
export async function transitionRequest(
  store: Store,
  workspaceId: ObjectId,
  requestId: ObjectId,
  user: User,
  role: Role,
  input: { action: 'submit' | 'approve' | 'reject'; version: number; note: string },
) {
  const c = collections(store.db);
  return transaction(store, async (session) => {
    const request = await c.requests.findOne({ _id: requestId, workspaceId }, { session });
    if (!request) throw new AppError(404, 'not_found', 'Request not found.');
    if (input.version !== request.version)
      throw new AppError(
        409,
        'version_conflict',
        'This request changed. Refresh it before continuing.',
      );
    const target =
      input.action === 'submit'
        ? 'submitted'
        : input.action === 'approve'
          ? 'approved'
          : 'rejected';
    if (input.action === 'submit') {
      if (!request.authorId.equals(user._id))
        throw new AppError(403, 'forbidden', 'Only the requester can submit this draft.');
      if (request.state !== 'draft')
        throw new AppError(409, 'invalid_transition', 'Only drafts can be submitted.');
    } else {
      if (!['owner', 'admin', 'approver'].includes(role))
        throw new AppError(403, 'forbidden', 'An approver role is required.');
      if (request.authorId.equals(user._id))
        throw new AppError(403, 'self_approval', 'A different person must review your request.');
      if (request.state !== 'submitted')
        throw new AppError(409, 'invalid_transition', 'Only submitted requests can be reviewed.');
      if (input.action === 'reject' && input.note.length < 5)
        throw new AppError(
          400,
          'reason_required',
          'Add a reason of at least five characters when rejecting.',
        );
    }
    const updated = await c.requests.findOneAndUpdate(
      { _id: requestId, workspaceId, version: request.version, state: request.state },
      {
        $set: {
          state: target,
          updatedAt: new Date(),
          ...(input.action !== 'submit' ? { decisionNote: input.note } : {}),
        },
        $inc: { version: 1 },
      },
      { session, returnDocument: 'after' },
    );
    if (!updated)
      throw new AppError(
        409,
        'version_conflict',
        'Another reviewer updated this request. Refresh to see their decision.',
      );
    await audit(
      store,
      session,
      workspaceId,
      user,
      'request.' + target,
      requestId,
      input.note || request.title,
    );
    const reviewers =
      input.action === 'submit'
        ? await c.members
            .find(
              {
                workspaceId,
                role: { $in: ['owner', 'admin', 'approver'] },
                userId: { $ne: user._id },
              },
              { session },
            )
            .toArray()
        : null;
    const recipients = reviewers ? reviewers.map((m) => m.userId) : [request.authorId];
    await c.jobs.insertOne(
      {
        _id: new ObjectId(),
        workspaceId,
        requestId,
        message: `${user.name} ${target} OP-${String(request.number).padStart(3, '0')}: ${request.title}`,
        recipients,
        state: 'ready',
        attempts: 0,
        availableAt: new Date(),
        createdAt: new Date(),
      },
      { session },
    );
    return updated;
  });
}
export async function changeMember(
  store: Store,
  workspaceId: ObjectId,
  actor: User,
  actorRole: Role,
  email: string,
  role: 'admin' | 'approver' | 'member',
) {
  if (!['owner', 'admin'].includes(actorRole))
    throw new AppError(403, 'forbidden', 'Workspace administration is required.');
  if (role === 'admin' && actorRole !== 'owner')
    throw new AppError(403, 'forbidden', 'Only the workspace owner can assign administrators.');
  const c = collections(store.db);
  await transaction(store, async (session) => {
    const user = await c.users.findOne({ email }, { session });
    if (!user)
      throw new AppError(
        404,
        'user_not_found',
        'The user must register an account before being added.',
      );
    if (user._id.equals(actor._id))
      throw new AppError(409, 'self_role_change', 'Ask another administrator to change your role.');
    const existing = await c.members.findOne({ workspaceId, userId: user._id }, { session });
    if (existing?.role === 'owner' || (existing?.role === 'admin' && actorRole !== 'owner'))
      throw new AppError(403, 'forbidden', 'This membership cannot be changed by your role.');
    await c.members.updateOne(
      { workspaceId, userId: user._id },
      { $set: { role }, $setOnInsert: { _id: new ObjectId(), workspaceId, userId: user._id } },
      { session, upsert: true },
    );
    await audit(
      store,
      session,
      workspaceId,
      actor,
      existing ? 'member.role_changed' : 'member.added',
      user._id,
      `${user.name}: ${role}`,
    );
  });
}
export async function removeMember(
  store: Store,
  workspaceId: ObjectId,
  actor: User,
  role: Role,
  userId: ObjectId,
) {
  if (!['owner', 'admin'].includes(role))
    throw new AppError(403, 'forbidden', 'Workspace administration is required.');
  const c = collections(store.db);
  await transaction(store, async (session) => {
    const member = await c.members.findOne({ workspaceId, userId }, { session });
    if (!member) throw new AppError(404, 'not_found', 'Membership not found.');
    if (
      userId.equals(actor._id) ||
      member.role === 'owner' ||
      (member.role === 'admin' && role !== 'owner')
    )
      throw new AppError(403, 'forbidden', 'This membership cannot be removed by your role.');
    await c.members.deleteOne({ _id: member._id, workspaceId }, { session });
    await audit(
      store,
      session,
      workspaceId,
      actor,
      'member.removed',
      userId,
      'Workspace access revoked.',
    );
  });
}
export const newKey = () => randomUUID();
