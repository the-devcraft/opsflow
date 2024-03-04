import { useInfiniteQuery } from '@tanstack/react-query';
import { Activity, ShieldCheck } from 'lucide-react';
import { client } from '../api';
import { Loading, ErrorNotice } from '../components/ui';

export function AuditTrail({ workspaceId }: { workspaceId: string }) {
  const results = useInfiniteQuery({
    queryKey: ['workspace', workspaceId, 'audit'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => client.audit(workspaceId, pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <h2>Workspace activity</h2>
          <p>Append-only through the application. Every change has an actor.</p>
        </div>
        <ShieldCheck size={22} className="muted" />
      </div>
      {results.isPending ? (
        <Loading />
      ) : results.error ? (
        <ErrorNotice error={results.error} retry={() => void results.refetch()} />
      ) : (
        <>
          <ol className="audit-list">
            {results.data.pages
              .flatMap((p) => p.items)
              .map((event) => (
                <li key={event.id}>
                  <span className="audit-icon">
                    <Activity size={16} />
                  </span>
                  <div>
                    <p>
                      <strong>{event.actorName}</strong>{' '}
                      <span>{event.action.replaceAll('.', ' ').replaceAll('_', ' ')}</span>
                    </p>
                    <p className="audit-detail">{event.detail}</p>
                    <small>{new Date(event.createdAt).toLocaleString()}</small>
                  </div>
                  <span className="audit-id" title={event.entityId}>
                    {event.entityId.slice(-6)}
                  </span>
                </li>
              ))}
          </ol>
          {results.hasNextPage && (
            <div className="load-more">
              <button
                className="button secondary"
                disabled={results.isFetchingNextPage}
                onClick={() => void results.fetchNextPage()}
              >
                Load more activity
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
