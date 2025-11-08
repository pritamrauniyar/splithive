import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';

const router = Router();

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional()
});

router.post('/', async (req, res, next) => {
  try {
    const body = userSchema.parse(req.body);
    const [result] = await pool.execute(
      'INSERT INTO users (name, email) VALUES (?, ?)',
      [body.name, body.email || null]
    );
    res.status(201).json({ id: result.insertId, ...body });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, created_at FROM users ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;

