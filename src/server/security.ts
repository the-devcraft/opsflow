import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Request, Response, NextFunction } from 'express';
import { ObjectId } from 'mongodb';
import { collections, type Store, type User, type Membership } from './db.js';
const scrypt = promisify(scryptCallback);
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [, salt, expected] = encoded.split(':');
  if (!salt || !expected) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const stored = Buffer.from(expected, 'hex');
  return stored.length === key.length && timingSafeEqual(stored, key);
}
export interface Config {
  origin: string;
  secureCookies: boolean;
  serveWeb: boolean;
  demo: boolean;
  authLimit?: number;
  sessionHours?: number;
}
export interface AuthRequest extends Request {
  user: User;
  membership: Membership;
  workspaceId: ObjectId;
  sessionHash: string;
  requestId: string;
}
export function id(value: unknown): ObjectId {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value))
    throw new AppError(400, 'invalid_id', 'Invalid resource identifier.');
  return new ObjectId(value);
}
export async function issueSession(store: Store, res: Response, userId: ObjectId, config: Config) {
  const token = randomBytes(32).toString('base64url');
  const maxAge = (config.sessionHours ?? 8) * 60 * 60 * 1000;
  await collections(store.db).sessions.insertOne({
    _id: new ObjectId(),
    userId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + maxAge),
  });
  res.cookie('opsflow_session', token, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict',
    path: '/',
    maxAge,
  });
}
export function authentication(store: Store) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const auth = req as AuthRequest;
    const token = req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('opsflow_session='))
      ?.slice('opsflow_session='.length);
    if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token))
      throw new AppError(401, 'unauthenticated', 'Sign in to continue.');
    const tokenHash = sha256(token);
    const session = await collections(store.db).sessions.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
    });
    const user = session && (await collections(store.db).users.findOne({ _id: session.userId }));
    if (!user)
      throw new AppError(401, 'unauthenticated', 'Your session has expired. Sign in again.');
    auth.user = user;
    auth.sessionHash = tokenHash;
    next();
  };
}
export function tenantScope(store: Store) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const auth = req as AuthRequest;
    auth.workspaceId = id(req.params.workspaceId);
    const membership = await collections(store.db).members.findOne({
      workspaceId: auth.workspaceId,
      userId: auth.user._id,
    });
    if (!membership) throw new AppError(404, 'not_found', 'Workspace not found.');
    auth.membership = membership;
    next();
  };
}
export function originGuard(config: Config) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== config.origin)
      throw new AppError(403, 'invalid_origin', 'This request origin is not allowed.');
    next();
  };
}
export const publicUser = (user: User) => ({
  id: user._id.toHexString(),
  name: user.name,
  email: user.email,
});
