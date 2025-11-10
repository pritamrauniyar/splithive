import { Router } from 'express';
import { pool } from '../../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// List recent expense activity for groups the user belongs to
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.execute(
      `SELECT a.id, a.expense_id, a.group_id, a.actor_user_id, a.action, a.snapshot, a.created_at,
              g.name AS group_name, u.name AS actor_name
       FROM expense_audit a
       JOIN group_members gm ON gm.group_id = a.group_id AND gm.user_id = ?
       LEFT JOIN \`groups\` g ON g.id = a.group_id
       LEFT JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.id DESC
       LIMIT 100`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;

