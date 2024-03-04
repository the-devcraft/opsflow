import { z } from 'zod';
export const roles = ['owner', 'admin', 'approver', 'member'] as const;
export type Role = (typeof roles)[number];
export const states = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type RequestState = (typeof states)[number];
export const categories = ['purchase', 'access', 'change'] as const;
export const priorities = ['low', 'medium', 'high'] as const;
export const emailSchema = z.email().trim().toLowerCase().max(254);
export const loginSchema = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
export const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2).max(70),
  password: z.string().min(12).max(128),
});
export const workspaceSchema = z.object({ name: z.string().trim().min(2).max(60) }).strict();
export const createRequestSchema = z
  .object({
    title: z.string().trim().min(4).max(120),
    description: z.string().trim().min(12).max(4000),
    category: z.enum(categories),
    priority: z.enum(priorities),
    amountCents: z.number().int().min(0).max(100_000_000).default(0),
  })
  .strict();
export const transitionSchema = z
  .object({
    action: z.enum(['submit', 'approve', 'reject']),
    version: z.number().int().positive(),
    note: z.string().trim().max(1000).default(''),
  })
  .strict();
export const memberSchema = z
  .object({ email: emailSchema, role: z.enum(['admin', 'approver', 'member']) })
  .strict();
export const pageSchema = z.object({
  cursor: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export interface UserView {
  id: string;
  name: string;
  email: string;
}
export interface WorkspaceView {
  id: string;
  name: string;
  role: Role;
}
export interface RequestView extends CreateRequestInput {
  id: string;
  number: number;
  state: RequestState;
  version: number;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  decisionNote?: string;
}
export interface MemberView extends UserView {
  role: Role;
}
export interface AuditView {
  id: string;
  action: string;
  actorName: string;
  entityId: string;
  detail: string;
  createdAt: string;
}
export interface NotificationView {
  id: string;
  message: string;
  requestId: string;
  read: boolean;
  createdAt: string;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface SessionView {
  user: UserView;
  workspaces: WorkspaceView[];
  demo: boolean;
}
export interface Summary {
  total: number;
  draft: number;
  submitted: number;
  approved: number;
  rejected: number;
  members: number;
}
