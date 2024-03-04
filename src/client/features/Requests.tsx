import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock,
  CheckCircle2,
  Users,
  ClipboardList,
  ShieldCheck,
  Search,
} from 'lucide-react';
import type { WorkspaceView, RequestView, CreateRequestInput } from '../../shared/contracts';
import { client } from '../api';
import { date, money, label, initials } from '../format';
import { Loading, ErrorNotice, Empty, Status } from '../components/ui';

export function Overview({
  workspace,
  onSelect,
  onViewRequests,
}: {
  workspace: WorkspaceView;
  onSelect: (id: string) => void;
  onViewRequests: () => void;
}) {
  const summary = useQuery({
    queryKey: ['workspace', workspace.id, 'summary'],
    queryFn: () => client.summary(workspace.id),
  });
  const requests = useQuery({
    queryKey: ['workspace', workspace.id, 'recent'],
    queryFn: () => client.requests(workspace.id, '', ''),
  });
  if (summary.isPending) return <Loading />;
  if (summary.error)
    return <ErrorNotice error={summary.error} retry={() => void summary.refetch()} />;
  const cards = [
    ['In review', summary.data.submitted, Clock, 'Awaiting an independent decision'],
    ['Approved', summary.data.approved, CheckCircle2, 'Reviewed and ready to move'],
    ['Open drafts', summary.data.draft, ClipboardList, 'Still taking shape'],
    ['Workspace members', summary.data.members, Users, 'People with workspace access'],
  ] as const;
  return (
    <>
      <div className="metrics">
        {cards.map(([name, value, Icon, caption], i) => (
          <article className={`metric metric-${i}`} key={name}>
            <div>
              <span>{name}</span>
              <Icon size={19} />
            </div>
            <strong>{value}</strong>
            <small>{caption}</small>
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <section className="card">
          <div className="section-heading">
            <div>
              <h2>Recent requests</h2>
              <p>The latest work across your workspace.</p>
            </div>
            <button className="text-button" onClick={onViewRequests}>
              View all <ArrowUpRight size={15} />
            </button>
          </div>
          {requests.isPending ? (
            <Loading />
          ) : requests.error ? (
            <ErrorNotice error={requests.error} />
          ) : (
            <RequestTable items={requests.data.items.slice(0, 6)} onSelect={onSelect} />
          )}
        </section>
        <div className="overview-side">
          <section className="card workflow-card">
            <span className="eyebrow">WORKFLOW HEALTH</span>
            <h2>Every stage, in view.</h2>
            <div className="status-bar">
              {(['draft', 'submitted', 'approved', 'rejected'] as const).map((s) => (
                <span key={s} className={`bar-${s}`} style={{ flex: summary.data[s] || 0.1 }} />
              ))}
            </div>
            {(['draft', 'submitted', 'approved', 'rejected'] as const).map((s) => (
              <div className="status-row" key={s}>
                <Status state={s} />
                <strong>{summary.data[s]}</strong>
              </div>
            ))}
            <small>{summary.data.total} total requests in this workspace</small>
          </section>
          <section className="review-note">
            <ShieldCheck size={24} />
            <h3>A second pair of eyes.</h3>
            <p>
              Requesters can’t approve their own work. Every decision includes a version check and
              an audit record.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}

export function RequestTable({
  items,
  onSelect,
}: {
  items: RequestView[];
  onSelect: (id: string) => void;
}) {
  return !items.length ? (
    <Empty title="No requests yet">
      Create a request to start your workspace’s first approval flow.
    </Empty>
  ) : (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Request</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Requester</th>
            <th>Created</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td>
                <button className="request-link" onClick={() => onSelect(r.id)}>
                  <span>OP-{String(r.number).padStart(3, '0')}</span>
                  <strong>{r.title}</strong>
                  <small>
                    {label(r.category)}
                    {r.amountCents > 0 ? ` · ${money(r.amountCents)}` : ''}
                  </small>
                </button>
              </td>
              <td>
                <Status state={r.state} />
              </td>
              <td>
                <span className={`priority priority-${r.priority}`}>
                  <i />
                  {label(r.priority)}
                </span>
              </td>
              <td>
                <span className="person-cell">
                  <span className="avatar small">{initials(r.authorName)}</span>
                  {r.authorName}
                </span>
              </td>
              <td className="muted">{date(r.createdAt)}</td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Open ${r.title}`}
                  onClick={() => onSelect(r.id)}
                >
                  <ArrowUpRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Requests({
  workspaceId,
  onSelect,
}: {
  workspaceId: string;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const results = useInfiniteQuery({
    queryKey: ['workspace', workspaceId, 'requests', filter, search],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      client.requests(workspaceId, filter, search, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  return (
    <section className="card">
      <div className="request-toolbar">
        <div className="filter-tabs" role="group" aria-label="Request status">
          {[
            ['', 'All requests'],
            ['submitted', 'In review'],
            ['draft', 'Drafts'],
            ['approved', 'Approved'],
            ['rejected', 'Rejected'],
          ].map(([value, text]) => (
            <button
              key={value}
              aria-pressed={filter === value}
              className={filter === value ? 'selected' : ''}
              onClick={() => setFilter(value!)}
            >
              {text}
            </button>
          ))}
        </div>
        <label className="search">
          <Search size={16} />
          <span className="sr-only">Search requests</span>
          <input
            placeholder="Search requests…"
            value={search}
            maxLength={60}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {results.isPending ? (
        <Loading />
      ) : results.error ? (
        <ErrorNotice error={results.error} retry={() => void results.refetch()} />
      ) : (
        <>
          <RequestTable items={results.data.pages.flatMap((p) => p.items)} onSelect={onSelect} />
          {results.hasNextPage && (
            <div className="load-more">
              <button
                className="button secondary"
                disabled={results.isFetchingNextPage}
                onClick={() => void results.fetchNextPage()}
              >
                {results.isFetchingNextPage ? 'Loading…' : 'Load more requests'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function RequestForm({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated: (r: RequestView) => void;
}) {
  const [input, setInput] = useState<CreateRequestInput>({
    title: '',
    description: '',
    category: 'purchase',
    priority: 'medium',
    amountCents: 0,
  });
  const [amount, setAmount] = useState('');
  const key = useRef(crypto.randomUUID());
  const mutation = useMutation({
    mutationFn: () => client.createRequest(workspaceId, input, key.current),
    onSuccess: onCreated,
  });
  const set = <K extends keyof CreateRequestInput>(field: K, value: CreateRequestInput[K]) => {
    key.current = crypto.randomUUID();
    setInput((old) => ({ ...old, [field]: value }));
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <p className="muted">
        Start with a draft. You can review the details before submitting it for approval.
      </p>
      <label>
        Request title
        <input
          required
          minLength={4}
          maxLength={120}
          value={input.title}
          onChange={(e) => {
            set('title', e.target.value);
            key.current = crypto.randomUUID();
          }}
          placeholder="What does your team need?"
        />
      </label>
      <div className="form-row">
        <label>
          Category
          <select
            value={input.category}
            onChange={(e) => set('category', e.target.value as CreateRequestInput['category'])}
          >
            <option value="purchase">Purchase</option>
            <option value="access">Access</option>
            <option value="change">Change</option>
          </select>
        </label>
        <label>
          Priority
          <select
            value={input.priority}
            onChange={(e) => set('priority', e.target.value as CreateRequestInput['priority'])}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>
      <label>
        Description
        <textarea
          required
          rows={6}
          minLength={12}
          maxLength={4000}
          value={input.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Include the context a reviewer needs to make a decision."
        />
      </label>
      <label>
        Estimated amount (USD, optional)
        <input
          type="number"
          min="0"
          max="1000000"
          step="0.01"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            set('amountCents', Math.round(Number(e.target.value) * 100));
          }}
          placeholder="0.00"
        />
      </label>
      {mutation.error && <ErrorNotice error={mutation.error} />}
      <button className="button primary" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating…' : 'Create draft'}
        <ArrowRight size={16} />
      </button>
    </form>
  );
}

export function RequestDetail({
  workspace,
  requestId,
  userId,
  onChanged,
}: {
  workspace: WorkspaceView;
  requestId: string;
  userId: string;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const request = useQuery({
    queryKey: ['workspace', workspace.id, 'request', requestId],
    queryFn: () => client.request(workspace.id, requestId),
  });
  const decision = useMutation({
    mutationFn: (action: string) =>
      client.transition(workspace.id, requestId, action, request.data!.version, note),
    onSuccess: (data) => {
      queryClient.setQueryData(['workspace', workspace.id, 'request', requestId], data);
      onChanged();
    },
    onError: () => void request.refetch(),
  });
  if (request.isPending) return <Loading />;
  if (request.error)
    return <ErrorNotice error={request.error} retry={() => void request.refetch()} />;
  const r = request.data;
  const reviewer = ['owner', 'admin', 'approver'].includes(workspace.role);
  const canReview = r.state === 'submitted' && reviewer && r.authorId !== userId;
  return (
    <>
      <div className="detail-meta">
        <span className="request-number">OP-{String(r.number).padStart(3, '0')}</span>
        <Status state={r.state} />
      </div>
      <h2 className="request-title">{r.title}</h2>
      <p className="request-description">{r.description}</p>
      <dl className="detail-grid">
        <div>
          <dt>Requested by</dt>
          <dd>{r.authorName}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{date(r.createdAt)}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{label(r.category)}</dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>{label(r.priority)}</dd>
        </div>
        <div>
          <dt>Estimated amount</dt>
          <dd>{r.amountCents ? money(r.amountCents) : 'Not specified'}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{r.version}</dd>
        </div>
      </dl>
      {r.decisionNote && (
        <div className="decision-note">
          <strong>Reviewer’s note</strong>
          <p>{r.decisionNote}</p>
        </div>
      )}
      {decision.error && <ErrorNotice error={decision.error} />}
      <div className="detail-actions">
        {r.state === 'draft' && r.authorId === userId ? (
          <>
            <p className="muted">
              Once submitted, an independent reviewer can approve or reject this request.
            </p>
            <button
              className="button primary"
              disabled={decision.isPending}
              onClick={() => decision.mutate('submit')}
            >
              {decision.isPending ? 'Submitting…' : 'Submit for review'}
              <ArrowRight size={16} />
            </button>
          </>
        ) : canReview ? (
          <>
            <label>
              Review note
              <textarea
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional for approval; required for rejection."
              />
            </label>
            <div className="button-row">
              <button
                className="button primary"
                disabled={decision.isPending}
                onClick={() => decision.mutate('approve')}
              >
                <Check size={16} />
                Approve request
              </button>
              <button
                className="button danger"
                disabled={decision.isPending || note.trim().length < 5}
                onClick={() => decision.mutate('reject')}
              >
                Reject request
              </button>
            </div>
          </>
        ) : r.state === 'submitted' ? (
          <p className="info-note">
            <ShieldCheck size={18} />
            {r.authorId === userId
              ? 'Your request needs review by someone else.'
              : 'An approver will review this request.'}
          </p>
        ) : r.state !== 'draft' ? (
          <p className="info-note">
            <CheckCircle2 size={18} />
            This request is resolved. The decision is recorded in the audit trail.
          </p>
        ) : (
          <p className="muted">Only the requester can submit this draft.</p>
        )}
      </div>
    </>
  );
}
