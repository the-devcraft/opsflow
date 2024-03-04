import { ObjectId } from 'mongodb';
import { collections, type Store, type User } from './db.js';
import { hashPassword } from './security.js';
import {
  changeMember,
  createRequest,
  createWorkspace,
  newKey,
  transitionRequest,
} from './services.js';
export const DEMO_PASSWORD = 'DemoAccount!2026';
export async function seedDemo(store: Store) {
  const c = collections(store.db);
  if (await c.users.countDocuments()) throw new Error('Demo seed requires an empty database.');
  const people = [
    ['Sam Rivera', 'sam@meridian.example'],
    ['Jordan Lee', 'jordan@meridian.example'],
    ['Casey Chen', 'casey@meridian.example'],
    ['Morgan Ellis', 'morgan@harbor.example'],
  ];
  const users: User[] = [];
  for (const [name, email] of people) {
    const user: User = {
      _id: new ObjectId(),
      name: name!,
      email: email!,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      createdAt: new Date(),
    };
    await c.users.insertOne(user);
    users.push(user);
  }
  const [sam, jordan, casey, morgan] = users as [User, User, User, User];
  const meridian = await createWorkspace(store, sam, 'Meridian Studio');
  const workspaceId = new ObjectId(meridian.id);
  await changeMember(store, workspaceId, sam, 'owner', jordan.email, 'approver');
  await changeMember(store, workspaceId, sam, 'owner', casey.email, 'member');
  await createWorkspace(store, sam, 'Northstar Labs');
  const harbor = await createWorkspace(store, morgan, 'Harbor Operations');
  await createRequest(
    store,
    new ObjectId(harbor.id),
    morgan,
    {
      title: 'Harbor private access request',
      description: 'This record belongs exclusively to Harbor Operations.',
      category: 'access',
      priority: 'high',
      amountCents: 0,
    },
    newKey(),
  );
  const entries = [
    [
      'Design team workspace access',
      'Grant the design team access to the shared research workspace.',
      'access',
      'high',
      0,
      'submitted',
    ],
    [
      'Quarterly monitoring renewal',
      'Renew the monitoring subscription for the next quarter.',
      'purchase',
      'medium',
      48000,
      'submitted',
    ],
    [
      'Update release approval policy',
      'Require an independent reviewer before a production release.',
      'change',
      'high',
      0,
      'submitted',
    ],
    [
      'Customer research software',
      'Purchase a shared license for the customer research team.',
      'purchase',
      'low',
      16000,
      'approved',
    ],
    [
      'Staging environment access',
      'Provide temporary staging access for the support lead.',
      'access',
      'medium',
      0,
      'approved',
    ],
    [
      'Replace team conference equipment',
      'Replace the video conference equipment in the main meeting room.',
      'purchase',
      'low',
      95000,
      'draft',
    ],
    [
      'Support handover checklist',
      'Create a consistent handover checklist for the evening support team.',
      'change',
      'medium',
      0,
      'draft',
    ],
    [
      'Additional analytics subscription',
      'Add a second analytics subscription alongside the existing service.',
      'purchase',
      'low',
      25000,
      'rejected',
    ],
  ] as const;
  for (const [title, description, category, priority, amountCents, target] of entries) {
    let r = await createRequest(
      store,
      workspaceId,
      casey,
      { title, description, category, priority, amountCents },
      newKey(),
    );
    if (target !== 'draft')
      r = await transitionRequest(store, workspaceId, r._id, casey, 'member', {
        action: 'submit',
        version: r.version,
        note: '',
      });
    if (target === 'approved' || target === 'rejected')
      await transitionRequest(store, workspaceId, r._id, jordan, 'approver', {
        action: target === 'approved' ? 'approve' : 'reject',
        version: r.version,
        note:
          target === 'approved'
            ? 'Reviewed and approved.'
            : 'An existing subscription already covers this need.',
      });
  }
}
