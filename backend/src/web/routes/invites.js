import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { v4 as uuidv4 } from 'uuid';
import { emitToUser } from '../../realtime/io.js';

const router = Router();

router.get('/:token', async (req, res, next) => {
  try {
    const token = String(req.params.token);
    const [rows] = await pool.execute(
      'SELECT token, group_id, used_at FROM group_invites WHERE token = ?',
      [token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invalid token' });
    const inv = rows[0];
    if (inv.used_at) return res.status(400).json({ error: 'Token already used' });
    res.json({ ok: true, group_id: inv.group_id });
  } catch (err) {
    next(err);
  }
});

router.post('/redeem', async (req, res, next) => {
  const schema = z.object({ token: z.string().min(8), name: z.string().min(1), email: z.string().email().optional() });
  const conn = await pool.getConnection();
  try {
    const body = schema.parse(req.body);
    await conn.beginTransaction();
    const [rows] = await conn.execute(
      'SELECT token, group_id, used_at FROM group_invites WHERE token = ? FOR UPDATE',
      [body.token]
    );
    if (rows.length === 0) throw Object.assign(new Error('Invalid token'), { status: 404 });
    const inv = rows[0];
    if (inv.used_at) throw Object.assign(new Error('Token already used'), { status: 400 });

    let userId = null;
    if (body.email) {
      const [u] = await conn.execute('SELECT id FROM users WHERE email = ?', [body.email]);
      if (u.length) userId = u[0].id;
    }
    if (!userId) {
      const [ins] = await conn.execute('INSERT INTO users (name, email) VALUES (?, ?)', [body.name, body.email || null]);
      userId = ins.insertId;
    }
    await conn.execute('INSERT IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [inv.group_id, userId]);
    await conn.execute('UPDATE group_invites SET used_at = NOW() WHERE token = ?', [body.token]);
    await conn.commit();
    try {
      // Notify group creator that someone joined
      const [[g]] = await pool.execute('SELECT created_by FROM `groups` WHERE id = ?', [inv.group_id]);
      if (g && g.created_by) emitToUser(g.created_by, 'groups:member_joined', { group_id: inv.group_id, user_id: userId, name: body.name, email: body.email });
    } catch (_) {}
    res.status(201).json({ ok: true, group_id: inv.group_id, user_id: userId });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// helper to generate a token (used by groups route)
export function generateInviteToken() {
  return uuidv4().replace(/-/g, '');
}

export default router;
