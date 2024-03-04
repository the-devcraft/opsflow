import express, { type ErrorRequestHandler, type Request } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ObjectId, MongoServerError } from 'mongodb';
import { z, ZodError } from 'zod';
import { collections, type Store, type User } from './db.js';
import {
  AppError,
  authentication,
  tenantScope,
  originGuard,
  issueSession,
  hashPassword,
  verifyPassword,
  publicUser,
  id,
  type AuthRequest,
  type Config,
} from './security.js';
import {
  registerSchema,
  loginSchema,
  workspaceSchema,
  createRequestSchema,
  transitionSchema,
  memberSchema,
  pageSchema,
  states,
} from '../shared/contracts.js';
import {
  changeMember,
  createRequest,
  createWorkspace,
  removeMember,
  requestView,
  transitionRequest,
} from './services.js';
const auth = (req: Request) => req as AuthRequest;
export function createApp(store: Store, config: Config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use((req, res, next) => {
    auth(req).requestId = randomUUID();
    res.setHeader('X-Request-Id', auth(req).requestId);
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    '/api',
    express.json({ limit: '32kb' }),
    originGuard(config),
    rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  const c = collections(store.db);
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', demo: config.demo }));
  app.get('/api/ready', async (_req, res) => {
    await store.db.command({ ping: 1 });
    res.json({ status: 'ready' });
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: config.authLimit ?? 15,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: { code: 'rate_limited', message: 'Too many sign-in attempts. Try again later.' },
    },
  });
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const input = registerSchema.parse(req.body);
    const user: User = {
      _id: new ObjectId(),
      name: input.name,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      createdAt: new Date(),
    };
    try {
      await c.users.insertOne(user);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000)
        throw new AppError(
          409,
          'registration_failed',
          'Unable to register this account. Try signing in.',
        );
      throw error;
    }
    await issueSession(store, res, user._id, config);
    res.status(201).json({ user: publicUser(user) });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await c.users.findOne({ email: input.email });
    // A real scrypt calculation on missing users avoids a cheap account-existence timing probe.
    const valid = await verifyPassword(
      input.password,
      user?.passwordHash ?? 'scrypt:00000000000000000000000000000000:' + '00'.repeat(64),
    );
    if (!user || !valid)
      throw new AppError(401, 'invalid_credentials', 'Email or password is incorrect.');
    await issueSession(store, res, user._id, config);
    res.json({ user: publicUser(user) });
  });
  app.use('/api', authentication(store));
  app.post('/api/auth/logout', async (req, res) => {
    await c.sessions.deleteOne({ tokenHash: auth(req).sessionHash });
    res.clearCookie('opsflow_session', {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'strict',
      path: '/',
    });
    res.status(204).end();
  });
  app.get('/api/me', async (req, res) => {
    const user = auth(req).user;
    const memberships = await c.members.find({ userId: user._id }).toArray();
    const workspaces = await c.workspaces
      .find({ _id: { $in: memberships.map((m) => m.workspaceId) } })
      .sort({ name: 1 })
      .toArray();
    res.json({
      user: publicUser(user),
      demo: config.demo,
      workspaces: workspaces.map((w) => ({
        id: w._id.toHexString(),
        name: w.name,
        role: memberships.find((m) => m.workspaceId.equals(w._id))!.role,
      })),
    });
  });
  app.post('/api/workspaces', async (req, res) => {
    const { name } = workspaceSchema.parse(req.body);
    res.status(201).json(await createWorkspace(store, auth(req).user, name));
  });
  const scope = express.Router({ mergeParams: true });
  app.use('/api/workspaces/:workspaceId', tenantScope(store), scope);
  scope.get('/summary', async (req, res) => {
    const workspaceId = auth(req).workspaceId;
    const rows = await c.requests
      .aggregate<{ _id: string; count: number }>([
        { $match: { workspaceId } },
        { $group: { _id: '$state', count: { $sum: 1 } } },
      ])
      .toArray();
    const counts = Object.fromEntries(rows.map((r) => [r._id, r.count]));
    res.json({
      total: rows.reduce((sum, r) => sum + r.count, 0),
      ...Object.fromEntries(states.map((s) => [s, counts[s] ?? 0])),
      members: await c.members.countDocuments({ workspaceId }),
    });
  });
  scope.get('/requests', async (req, res) => {
    const page = pageSchema.parse(req.query);
    const filter = z
      .object({ state: z.enum(states).optional(), q: z.string().trim().max(60).optional() })
      .parse(req.query);
    const workspaceId = auth(req).workspaceId;
    const rows = await c.requests
      .find({
        workspaceId,
        ...(page.cursor ? { _id: { $lt: new ObjectId(page.cursor) } } : {}),
        ...(filter.state ? { state: filter.state } : {}),
        ...(filter.q
          ? { title: { $regex: filter.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
          : {}),
      })
      .sort({ _id: -1 })
      .limit(page.limit + 1)
      .toArray();
    res.json({
      items: rows.slice(0, page.limit).map(requestView),
      nextCursor: rows.length > page.limit ? rows[page.limit - 1]!._id.toHexString() : null,
    });
  });
  scope.post('/requests', async (req, res) => {
    const input = createRequestSchema.parse(req.body);
    const a = auth(req);
    res
      .status(201)
      .json(
        requestView(
          await createRequest(
            store,
            a.workspaceId,
            a.user,
            input,
            req.header('Idempotency-Key') ?? '',
          ),
        ),
      );
  });
  scope.get('/requests/:requestId', async (req, res) => {
    const request = await c.requests.findOne({
      _id: id(req.params.requestId),
      workspaceId: auth(req).workspaceId,
    });
    if (!request) throw new AppError(404, 'not_found', 'Request not found.');
    res.json(requestView(request));
  });
  scope.post('/requests/:requestId/transitions', async (req, res) => {
    const input = transitionSchema.parse(req.body);
    const a = auth(req);
    res.json(
      requestView(
        await transitionRequest(
          store,
          a.workspaceId,
          id(req.params.requestId),
          a.user,
          a.membership.role,
          input,
        ),
      ),
    );
  });
  scope.get('/members', async (req, res) => {
    const memberships = await c.members.find({ workspaceId: auth(req).workspaceId }).toArray();
    const users = await c.users
      .find({ _id: { $in: memberships.map((m) => m.userId) } })
      .sort({ name: 1 })
      .toArray();
    res.json(
      users.map((user) => ({
        ...publicUser(user),
        role: memberships.find((m) => m.userId.equals(user._id))!.role,
      })),
    );
  });
  scope.post('/members', async (req, res) => {
    const input = memberSchema.parse(req.body);
    const a = auth(req);
    await changeMember(store, a.workspaceId, a.user, a.membership.role, input.email, input.role);
    res.status(204).end();
  });
  scope.delete('/members/:userId', async (req, res) => {
    const a = auth(req);
    await removeMember(store, a.workspaceId, a.user, a.membership.role, id(req.params.userId));
    res.status(204).end();
  });
  scope.get('/audit', async (req, res) => {
    const page = pageSchema.parse(req.query);
    const rows = await c.audit
      .find({
        workspaceId: auth(req).workspaceId,
        ...(page.cursor ? { _id: { $lt: new ObjectId(page.cursor) } } : {}),
      })
      .sort({ _id: -1 })
      .limit(page.limit + 1)
      .toArray();
    res.json({
      items: rows.slice(0, page.limit).map((r) => ({
        id: r._id.toHexString(),
        action: r.action,
        actorName: r.actorName,
        entityId: r.entityId.toHexString(),
        detail: r.detail,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: rows.length > page.limit ? rows[page.limit - 1]!._id.toHexString() : null,
    });
  });
  scope.get('/notifications', async (req, res) => {
    const a = auth(req);
    const rows = await c.notifications
      .find({ workspaceId: a.workspaceId, userId: a.user._id })
      .sort({ _id: -1 })
      .limit(50)
      .toArray();
    res.json(
      rows.map((n) => ({
        id: n._id.toHexString(),
        requestId: n.requestId.toHexString(),
        message: n.message,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
    );
  });
  scope.post('/notifications/:notificationId/read', async (req, res) => {
    const a = auth(req);
    const result = await c.notifications.updateOne(
      { _id: id(req.params.notificationId), workspaceId: a.workspaceId, userId: a.user._id },
      { $set: { read: true } },
    );
    if (!result.matchedCount) throw new AppError(404, 'not_found', 'Notification not found.');
    res.status(204).end();
  });
  app.use('/api', (_req, _res) => {
    throw new AppError(404, 'not_found', 'API endpoint not found.');
  });
  if (config.serveWeb) {
    const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/client');
    app.use(express.static(web, { index: false }));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(web, 'index.html')));
  }
  const handleError: ErrorRequestHandler = (error, req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'validation_error',
          message: 'Check the highlighted request fields.',
          fields: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
          requestId: auth(req).requestId,
        },
      });
      return;
    }
    const known = error instanceof AppError;
    const badJson = error instanceof SyntaxError && 'body' in error;
    const tooLarge = error?.type === 'entity.too.large';
    if (!known && !badJson && !tooLarge)
      console.error(
        JSON.stringify({
          requestId: auth(req).requestId,
          message: 'Unhandled request error',
          type: error?.constructor?.name,
        }),
      );
    res.status(known ? error.status : badJson ? 400 : tooLarge ? 413 : 500).json({
      error: {
        code: known
          ? error.code
          : badJson
            ? 'invalid_json'
            : tooLarge
              ? 'payload_too_large'
              : 'internal_error',
        message: known
          ? error.message
          : badJson
            ? 'Malformed JSON payload.'
            : tooLarge
              ? 'Request body is too large.'
              : 'Something went wrong. Please try again.',
        requestId: auth(req).requestId,
      },
    });
  };
  app.use(handleError);
  return app;
}
