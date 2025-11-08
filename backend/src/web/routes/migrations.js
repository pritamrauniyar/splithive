import { Router } from 'express';
import { pool } from '../../db/pool.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const migrationsDir = path.resolve(__dirname, '..', '..', 'db', 'migrations');

    let files = [];
    try {
      files = (await fs.readdir(migrationsDir))
        .filter((f) => f.toLowerCase().endsWith('.sql'))
        .sort();
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      files = [];
    }

    let appliedRows = [];
    try {
      const [rows] = await pool.query('SELECT filename, applied_at FROM _migrations ORDER BY applied_at ASC');
      appliedRows = rows;
    } catch (e) {
      // If _migrations table does not exist yet, treat as none applied
      appliedRows = [];
    }
    const applied = new Set(appliedRows.map((r) => r.filename));
    const pending = files.filter((f) => !applied.has(f));

    res.json({
      ok: true,
      applied: appliedRows,
      pending,
      totalFiles: files.length,
      appliedCount: appliedRows.length,
      pendingCount: pending.length,
      autoRunOnStart: process.env.RUN_MIGRATIONS === 'true'
    });
  } catch (err) {
    next(err);
  }
});

export default router;

