import { useState, type FormEvent } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { WorkspaceView } from '../../shared/contracts';
import { client } from '../api';
import { initials, label } from '../format';
import { Loading, ErrorNotice } from '../components/ui';

export function People({
  workspace,
  userId,
  onChanged,
  onMessage,
}: {
  workspace: WorkspaceView;
  userId: string;
  onChanged: () => void;
  onMessage: (s: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [removing, setRemoving] = useState<string | null>(null);
  const members = useQuery({
    queryKey: ['workspace', workspace.id, 'members'],
    queryFn: () => client.members(workspace.id),
  });
  const add = useMutation({
    mutationFn: () => client.addMember(workspace.id, email, role),
    onSuccess: () => {
      setEmail('');
      onChanged();
      onMessage('Workspace membership saved.');
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.removeMember(workspace.id, id),
    onSuccess: () => {
      setRemoving(null);
      onChanged();
      onMessage('Workspace access removed.');
    },
  });
  const admin = workspace.role === 'owner' || workspace.role === 'admin';
  return (
    <>
      {admin && (
        <section className="card membership-form">
          <div>
            <h2>Add or update a member</h2>
            <p>
              The person must already have an Opsflow account. Existing memberships will receive the
              selected role.
            </p>
          </div>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <label>
              Email address
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
              />
            </label>
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="member">Member</option>
                <option value="approver">Approver</option>
                {workspace.role === 'owner' && <option value="admin">Admin</option>}
              </select>
            </label>
            <button className="button primary" disabled={add.isPending}>
              {add.isPending ? 'Saving…' : 'Save membership'}
            </button>
          </form>
          {add.error && <ErrorNotice error={add.error} />}
        </section>
      )}
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Workspace members</h2>
            <p>Access is checked on every request.</p>
          </div>
          <span className="count-badge">{members.data?.length ?? '—'} people</span>
        </div>
        {members.isPending ? (
          <Loading />
        ) : members.error ? (
          <ErrorNotice error={members.error} />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {members.data.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <div className="member-person">
                        <span className="avatar">{initials(person.name)}</span>
                        <div>
                          <strong>
                            {person.name}
                            {person.id === userId ? ' (you)' : ''}
                          </strong>
                          <small>{person.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="role-tag">{label(person.role)}</span>
                    </td>
                    <td>
                      {admin &&
                      person.role !== 'owner' &&
                      person.id !== userId &&
                      (workspace.role === 'owner' || person.role !== 'admin') ? (
                        removing === person.id ? (
                          <div className="button-row">
                            <button
                              className="text-button danger-text"
                              disabled={remove.isPending}
                              onClick={() => remove.mutate(person.id)}
                            >
                              Confirm removal
                            </button>
                            <button className="text-button" onClick={() => setRemoving(null)}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="text-button muted"
                            onClick={() => setRemoving(person.id)}
                          >
                            Remove access
                          </button>
                        )
                      ) : (
                        <span className="muted">
                          {person.role === 'owner' ? 'Workspace owner' : 'Active'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {remove.error && <ErrorNotice error={remove.error} />}
      </section>
      <p className="fine-print">
        Owners manage administrators. Administrators manage members and approvers. Ownership is
        fixed for this release.
      </p>
    </>
  );
}
