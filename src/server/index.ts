import { createApp } from './app.js';
import { connect } from './db.js';
import { startWorker } from './worker.js';
try {
  process.loadEnvFile();
} catch {
  /* Environment files are optional; deployment may supply variables directly. */
}
const uri = process.env.MONGODB_URI;
const origin = process.env.APP_ORIGIN;
const port = Number(process.env.PORT ?? 4000);
if (!uri || !origin || !Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Set MONGODB_URI, APP_ORIGIN, and a valid PORT.');
if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://'))
  throw new Error('Production requires an HTTPS APP_ORIGIN.');
const store = await connect(uri);
await store.db.command({ hello: 1 }).then((result) => {
  if (!result.setName)
    throw new Error('MongoDB must run as a replica set for transaction support.');
});
const app = createApp(store, {
  origin,
  secureCookies: process.env.NODE_ENV === 'production',
  serveWeb: process.env.SERVE_WEB !== 'false',
  demo: false,
});
const server = app.listen(port, () => console.log(`Opsflow listening on port ${port}`));
const stop = startWorker(store);
let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  setTimeout(() => process.exit(1), 10000).unref();
  void stop().then(() =>
    server.close(() => {
      void store.client.close().then(() => process.exit(0));
    }),
  );
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
