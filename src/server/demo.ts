import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from './app.js';
import { connect } from './db.js';
import { seedDemo, DEMO_PASSWORD } from './seed.js';
import { startWorker } from './worker.js';
const apiOnly = process.argv.includes('--api-only');
const port = Number(process.env.PORT ?? 4000);
const mongo = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  binary: { version: '8.2.6' },
});
const store = await connect(mongo.getUri('opsflow_demo'));
await seedDemo(store);
const app = createApp(store, {
  origin: apiOnly ? 'http://127.0.0.1:5173' : `http://127.0.0.1:${port}`,
  secureCookies: false,
  serveWeb: !apiOnly,
  demo: true,
  authLimit: 100,
});
const server = app.listen(port, '127.0.0.1', () =>
  console.log(
    `\nOpsflow demo: http://127.0.0.1:${apiOnly ? 5173 : port}\nDemo password: ${DEMO_PASSWORD}\nTemporary database; data resets when this process exits.\n`,
  ),
);
const stop = startWorker(store);
let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  setTimeout(() => process.exit(1), 10000).unref();
  void stop().then(() =>
    server.close(() => {
      void store.client
        .close()
        .then(() => mongo.stop())
        .then(() => process.exit(0));
    }),
  );
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
