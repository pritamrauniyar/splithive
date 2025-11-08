import './setupEnv.js';
import app from './web/app.js';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import http from 'http';
import { initRealtime } from './realtime/io.js';

const port = process.env.PORT || 4000;
const host = '0.0.0.0';

// Optional: auto-run DB migrations on startup (dev convenience)
if (process.env.RUN_MIGRATIONS === 'true') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const backendRoot = path.resolve(__dirname, '..');
  console.log('[migrate] Applying pending DB migrations...');
  const res = spawnSync(process.execPath, ['scripts/migrate.js'], {
    cwd: backendRoot,
    stdio: 'inherit'
  });
  if (res.status !== 0) {
    console.error('[migrate] Migrations failed. Aborting server start.');
    process.exit(res.status || 1);
  }
}

const server = http.createServer(app);
initRealtime(server);

server.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});
