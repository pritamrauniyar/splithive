import 'dotenv/config';
import mysql from 'mysql2/promise';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const hard = args.includes('--hard'); // also clears _migrations and reruns migrate

  if (!force) {
    console.error('[reset_db] Refusing to reset without --force.');
    console.error('Usage: npm run reset:db -- --force [--hard]');
    process.exit(1);
  }

  const cfg = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'splithive',
    multipleStatements: true
  };

  const conn = await mysql.createConnection(cfg);
  try {
    console.log('[reset_db] Connected to DB', cfg.database);
    await conn.query('SET FOREIGN_KEY_CHECKS=0');

    const tables = [
      'expense_splits',
      'expenses',
      'settlements',
      'group_members',
      'group_invites',
      'verification_tokens',
      'users',
      '`groups`'
    ];

    for (const t of tables) {
      try {
        console.log('[reset_db] TRUNCATE', t);
        await conn.query(`TRUNCATE TABLE ${t}`);
      } catch (err) {
        console.warn(`[reset_db] Skip ${t}: ${err.message}`);
      }
    }

    if (hard) {
      try {
        console.log('[reset_db] TRUNCATE _migrations (hard mode)');
        await conn.query('TRUNCATE TABLE _migrations');
      } catch (err) {
        console.warn('[reset_db] _migrations not found or cannot truncate:', err.message);
      }
    }

    await conn.query('SET FOREIGN_KEY_CHECKS=1');
    console.log('[reset_db] Data cleared.');
  } finally {
    await conn.end();
  }

  if (hard) {
    console.log('[reset_db] Reapplying migrations...');
    const backendRoot = path.resolve(__dirname, '..');
    const res = spawnSync(process.execPath, ['scripts/migrate.js'], {
      cwd: backendRoot,
      stdio: 'inherit'
    });
    if (res.status !== 0) {
      console.error('[reset_db] Migrations failed after hard reset.');
      process.exit(res.status || 1);
    }
  }

  console.log('[reset_db] Done. You can now test from a clean state.');
}

main().catch((err) => {
  console.error('[reset_db] FAILED:', err.message);
  process.exit(1);
});

