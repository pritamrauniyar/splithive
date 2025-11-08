import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const cfg = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'splithive',
    multipleStatements: true
  };

  const migrationsDir = path.resolve(__dirname, '..', 'db', 'migrations');
  const conn = await mysql.createConnection(cfg);
  try {
    await conn.execute(`CREATE TABLE IF NOT EXISTS _migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    const [appliedRows] = await conn.query('SELECT filename FROM _migrations');
    const applied = new Set(appliedRows.map(r => r.filename));

    let files = [];
    try {
      files = (await fs.readdir(migrationsDir)).filter(f => f.toLowerCase().endsWith('.sql')).sort();
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.log(`No migrations directory found at ${migrationsDir}. Nothing to do.`);
        return;
      }
      throw e;
    }

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const fullPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(fullPath, 'utf8');
      const trimmed = sql.trim();
      if (!trimmed) {
        console.log(`- Skipping empty migration ${file}`);
        continue;
      }
      console.log(`Applying ${file} ...`);
      try {
        await conn.beginTransaction();
        await conn.query(trimmed);
        await conn.execute('INSERT INTO _migrations (filename) VALUES (?)', [file]);
        await conn.commit();
        appliedCount += 1;
        console.log(`✔ Applied ${file}`);
      } catch (err) {
        await conn.rollback();
        console.error(`✖ Failed ${file}: ${err.message}`);
        process.exitCode = 1;
        return;
      }
    }

    if (appliedCount === 0) console.log('No new migrations to apply.');
    else console.log(`Done. Applied ${appliedCount} migration(s).`);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

