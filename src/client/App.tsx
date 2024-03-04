import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Plus,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { SessionView, WorkspaceView } from '../shared/contracts';
import { ApiError, client } from './api';
import { date, label, initials } from './format';
import { Brand, Loading, ErrorNotice, Empty, Drawer } from './components/ui';
import { SignIn } from './features/SignIn';
import { Overview, Requests, RequestForm, RequestDetail } from './features/Requests';
import { People } from './features/People';
import { AuditTrail } from './features/AuditTrail';
type View = 'overview' | 'requests' | 'people' | 'audit';

export function App() {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: client.session,
    retry: false,
    refetchInterval: 60000,
  });
  if (session.isPending) return <Loading />;
  if (session.error) {
    if (session.error instanceof ApiError && session.error.status === 401)
      return (
        <SignIn
          onDone={() => {
            void queryClient.invalidateQueries({ queryKey: ['session'] });
          }}
        />
      );
    return (
      <div className="standalone-error">
        <Brand />
        <ErrorNotice error={session.error} retry={() => void session.refetch()} />
      </div>
    );
  }
  return <WorkspaceApp key={session.data.user.id} session={session.data} />;
}

export function WorkspaceApp({ session }: { session: SessionView }) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState('');
  const [view, setView] = useState<View>('overview');
  const [panel, setPanel] = useState<'new' | 'workspace' | 'notifications' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const workspace = session.workspaces.find((w) => w.id === active) ?? session.workspaces[0];
  const workspaceId = workspace?.id ?? '';
  const notifications = useQuery({
    queryKey: ['workspace', workspaceId, 'notifications'],
    queryFn: () => client.notifications(workspaceId),
    enabled: !!workspaceId,
    refetchInterval: 10000,
  });
  const unread = notifications.data?.filter((n) => !n.read).length ?? 0;
  const open = !!panel || !!selected;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    void queryClient.invalidateQueries({ queryKey: ['session'] });
  };
  const logout = useMutation({
    mutationFn: client.logout,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['workspace'] });
      void queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);
  const choose = (id: string) => {
    setActive(id);
    setSelected(null);
    setPanel(null);
    setToast('');
  };
  return (
    <>
      <div className="app-layout" inert={open}>
        <aside className="sidebar">
          <Brand />
          <div className="workspace-picker">
            <label htmlFor="workspace-switch">WORKSPACE</label>
            <select
              id="workspace-switch"
              aria-label="Active workspace"
              value={workspaceId}
              onChange={(e) => choose(e.target.value)}
            >
              {session.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
              {!workspace && <option value="">No workspaces</option>}
            </select>
            <button className="workspace-add" onClick={() => setPanel('workspace')}>
              <Plus size={14} />
              New workspace
            </button>
          </div>
          <nav aria-label="Workspace navigation">
            {(
              [
                ['overview', LayoutDashboard, 'Overview'],
                ['requests', ClipboardList, 'Requests'],
                ['people', Users, 'People'],
                ['audit', Activity, 'Audit trail'],
              ] as const
            ).map(([key, Icon, text]) => (
              <button
                key={key}
                aria-current={view === key ? 'page' : undefined}
                className={view === key ? 'active' : ''}
                onClick={() => setView(key)}
              >
                <Icon size={19} />
                <span>{text}</span>
                {key === 'requests' && <ArrowUpRight size={15} />}
              </button>
            ))}
          </nav>
          <div className="sidebar-note">
            <ShieldCheck size={19} />
            <strong>Every decision has a record.</strong>
            <p>Requests, approvals, and membership changes stay connected.</p>
          </div>
          <div className="account">
            <span className="avatar">{initials(session.user.name)}</span>
            <div>
              <strong>{session.user.name}</strong>
              <span>{workspace ? label(workspace.role) : 'Account'}</span>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
            >
              <LogOut size={17} />
            </button>
          </div>
        </aside>
        <div className="content">
          <header className="topbar">
            <div>
              <span className="muted">Workspace</span>
              <span className="divider">/</span>
              <strong>{workspace?.name ?? 'Get started'}</strong>
            </div>
            <div className="topbar-actions">
              {session.demo && <span className="demo-pill">DEMO · RESETS ON RESTART</span>}
              <button
                className="notification-button icon-button"
                aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
                onClick={() => setPanel('notifications')}
              >
                <Bell size={20} />
                {unread > 0 && <span>{unread}</span>}
              </button>
              <button
                className="icon-button mobile-signout"
                aria-label="Sign out"
                disabled={logout.isPending}
                onClick={() => logout.mutate()}
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>
          <main className="main-content">
            {logout.error && <ErrorNotice error={logout.error} />}
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {view === 'overview'
                    ? 'THE BIG PICTURE'
                    : view === 'requests'
                      ? 'KEEP WORK MOVING'
                      : view === 'people'
                        ? 'THE PEOPLE BEHIND THE WORK'
                        : 'A RECORD YOU CAN FOLLOW'}
                </span>
                <h1>
                  {view === 'overview'
                    ? 'Workspace overview'
                    : view === 'requests'
                      ? 'Requests'
                      : view === 'people'
                        ? 'People'
                        : 'Audit trail'}
                </h1>
                <p>
                  {view === 'overview'
                    ? 'A clear view of what needs attention and what’s moving forward.'
                    : view === 'requests'
                      ? 'From the first draft to the final decision.'
                      : view === 'people'
                        ? 'Manage who can participate, review, and administer this workspace.'
                        : 'See who changed what, and when.'}
                </p>
              </div>
              {workspace && (view === 'requests' || view === 'overview') && (
                <button className="button primary" onClick={() => setPanel('new')}>
                  <Plus size={17} />
                  New request
                </button>
              )}
            </div>
            {!workspace ? (
              <Empty title="Your first workspace starts here">
                Create a workspace to bring requests, people, and approvals together.{' '}
                <button className="text-button" onClick={() => setPanel('workspace')}>
                  Create a workspace
                </button>
              </Empty>
            ) : view === 'overview' ? (
              <Overview
                workspace={workspace}
                onSelect={setSelected}
                onViewRequests={() => setView('requests')}
              />
            ) : view === 'requests' ? (
              <Requests workspaceId={workspaceId} onSelect={setSelected} />
            ) : view === 'people' ? (
              <People
                workspace={workspace}
                userId={session.user.id}
                onChanged={refresh}
                onMessage={setToast}
              />
            ) : (
              <AuditTrail workspaceId={workspaceId} />
            )}
            <footer className="page-footer">
              <span>Opsflow</span>
              <span>One workspace. A clear trail.</span>
            </footer>
          </main>
        </div>
      </div>
      <div className="toast-area" role="status" aria-live="polite">
        {toast && (
          <div className="toast">
            <CheckCircle2 size={18} />
            {toast}
          </div>
        )}
      </div>
      {panel === 'workspace' && (
        <Drawer title="Create a workspace" onClose={() => setPanel(null)}>
          <WorkspaceForm
            onCreated={(w) => {
              void queryClient.invalidateQueries({ queryKey: ['session'] });
              setActive(w.id);
              setPanel(null);
              setToast('Workspace created.');
            }}
          />
        </Drawer>
      )}
      {panel === 'new' && workspace && (
        <Drawer title="New request" onClose={() => setPanel(null)}>
          <RequestForm
            workspaceId={workspaceId}
            onCreated={(r) => {
              refresh();
              setPanel(null);
              setSelected(r.id);
              setToast('Draft created. Submit it when you’re ready.');
            }}
          />
        </Drawer>
      )}
      {selected && workspace && (
        <Drawer title="Request details" onClose={() => setSelected(null)}>
          <RequestDetail
            key={workspaceId + selected}
            workspace={workspace}
            requestId={selected}
            userId={session.user.id}
            onChanged={() => {
              refresh();
              setToast('Request updated.');
            }}
          />
        </Drawer>
      )}
      {panel === 'notifications' && (
        <Drawer title="Notifications" onClose={() => setPanel(null)}>
          {notifications.isPending ? (
            <Loading />
          ) : notifications.error ? (
            <ErrorNotice error={notifications.error} />
          ) : !notifications.data?.length ? (
            <Empty title="You’re all caught up">New reviews and decisions will appear here.</Empty>
          ) : (
            <div className="notification-list">
              {notifications.data.map((n) => (
                <button
                  key={n.id}
                  className={n.read ? 'read' : ''}
                  onClick={() => {
                    void client.read(workspaceId, n.id).then(refresh);
                    setPanel(null);
                    setSelected(n.requestId);
                  }}
                >
                  <span className="notification-dot" />
                  <div>
                    <p>{n.message}</p>
                    <small>{date(n.createdAt)}</small>
                  </div>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          )}
        </Drawer>
      )}
    </>
  );
}

export function WorkspaceForm({ onCreated }: { onCreated: (w: WorkspaceView) => void }) {
  const [name, setName] = useState('');
  const mutation = useMutation({ mutationFn: () => client.workspace(name), onSuccess: onCreated });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="muted">
        A workspace keeps its requests, members, and records separate from every other workspace.
      </p>
      <label>
        Workspace name
        <input
          required
          minLength={2}
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Product operations"
        />
      </label>
      {mutation.error && <ErrorNotice error={mutation.error} />}
      <button className="button primary" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating…' : 'Create workspace'}
      </button>
    </form>
  );
}
