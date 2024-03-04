import type {
  SessionView,
  Summary,
  RequestView,
  CreateRequestInput,
  Page,
  MemberView,
  AuditView,
  NotificationView,
  WorkspaceView,
} from '../shared/contracts';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch('/api' + path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'request_failed',
      body?.error?.fields
        ?.map((f: { path: string; message: string }) => `${f.path}: ${f.message}`)
        .join(' · ') ||
        body?.error?.message ||
        'The request could not be completed.',
    );
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
const body = (value: unknown) => JSON.stringify(value);
export const client = {
  session: () => api<SessionView>('/me'),
  health: () => api<{ demo: boolean }>('/health'),
  login: (email: string, password: string) =>
    api('/auth/login', { method: 'POST', body: body({ email, password }) }),
  register: (name: string, email: string, password: string) =>
    api('/auth/register', { method: 'POST', body: body({ name, email, password }) }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  workspace: (name: string) =>
    api<WorkspaceView>('/workspaces', { method: 'POST', body: body({ name }) }),
  summary: (id: string) => api<Summary>(`/workspaces/${id}/summary`),
  requests: (id: string, state: string, q: string, cursor?: string, signal?: AbortSignal) => {
    const params = new URLSearchParams({ limit: '20' });
    if (state) params.set('state', state);
    if (q) params.set('q', q);
    if (cursor) params.set('cursor', cursor);
    return api<Page<RequestView>>(`/workspaces/${id}/requests?${params}`, { signal });
  },
  request: (id: string, requestId: string) =>
    api<RequestView>(`/workspaces/${id}/requests/${requestId}`),
  createRequest: (id: string, input: CreateRequestInput, key: string) =>
    api<RequestView>(`/workspaces/${id}/requests`, {
      method: 'POST',
      headers: { 'Idempotency-Key': key },
      body: body(input),
    }),
  transition: (id: string, requestId: string, action: string, version: number, note: string) =>
    api<RequestView>(`/workspaces/${id}/requests/${requestId}/transitions`, {
      method: 'POST',
      body: body({ action, version, note }),
    }),
  members: (id: string) => api<MemberView[]>(`/workspaces/${id}/members`),
  addMember: (id: string, email: string, role: string) =>
    api(`/workspaces/${id}/members`, { method: 'POST', body: body({ email, role }) }),
  removeMember: (id: string, userId: string) =>
    api(`/workspaces/${id}/members/${userId}`, { method: 'DELETE' }),
  audit: (id: string, cursor?: string, signal?: AbortSignal) =>
    api<Page<AuditView>>(`/workspaces/${id}/audit?limit=20${cursor ? '&cursor=' + cursor : ''}`, {
      signal,
    }),
  notifications: (id: string) => api<NotificationView[]>(`/workspaces/${id}/notifications`),
  read: (id: string, notificationId: string) =>
    api(`/workspaces/${id}/notifications/${notificationId}/read`, { method: 'POST' }),
};
