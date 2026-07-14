import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb } from './db/connect.js';

async function main() {
  await connectDb(env.MONGODB_URI);
  const app = createApp();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`server listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal startup error', err);
  process.exit(1);
});
