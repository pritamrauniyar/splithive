import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { emitToUser } from '../../realtime/io.js';
import { sendMail } from '../../utils/mailer.js';
import { generateInviteToken } from './invites.js';

const router = Router();

const createGroupSchema = z.object({
  name: z.string().min(1)
});

async function isMember(userId, groupId) {
  const [[{ cnt }]] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM group_members WHERE user_id = ? AND group_id = ?',
    [userId, groupId]
  );
  return Number(cnt) > 0;
}

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = createGroupSchema.parse(req.body);
    const createdBy = req.user?.id || null;
    const [result] = await pool.execute(
      'INSERT INTO `groups` (name, created_by) VALUES (?, ?)',
      [body.name, createdBy]
    );
    const groupId = result.insertId;
    if (createdBy) {
      await pool.execute('INSERT IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)', [groupId, createdBy]);
      emitToUser(createdBy, 'groups:refresh', { reason: 'group_created', group_id: groupId });
    }
    res.status(201).json({ id: groupId, name: body.name, created_by: createdBy });
  } catch (err) {
    next(err);
  }
});

// List only groups where the requester is a member
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [rows] = await pool.query(
      `SELECT g.id, g.name, g.created_by, g.created_at
       FROM \`groups\` g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = ?
       ORDER BY g.id DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/:groupId/members', requireAuth, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    // Only members can add new members
    if (!(await isMember(req.user.id, groupId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    // Accept either { user_id } or { name, email }
    const schemaEither = z.union([
      z.object({ user_id: z.number().int() }),
      z.object({ name: z.string().min(1), email: z.string().email() })
    ]);
    const body = schemaEither.parse(req.body);

    let targetUserId = null;
    let createdNewUser = false;
    if ('user_id' in body) {
      targetUserId = Number(body.user_id);
    } else {
      // Find existing user by email or create a placeholder user
      const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [body.email]);
      if (rows.length) {
        targetUserId = rows[0].id;
      } else {
        const [ins] = await pool.execute('INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, NULL, 0)', [body.name, body.email]);
        targetUserId = ins.insertId;
        createdNewUser = true;
      }
    }

    await pool.execute(
      'INSERT IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)',
      [groupId, targetUserId]
    );

    // Notify the user via realtime channel
    emitToUser(targetUserId, 'groups:refresh', { reason: 'added_to_group', group_id: groupId });
    emitToUser(targetUserId, 'groups:added', { group_id: groupId });

    // If this is a newly created user (by email only), send an email notification to install/sign up
    if (createdNewUser) {
      (async () => {
        try {
          const [[g]] = await pool.execute('SELECT name FROM `groups` WHERE id = ?', [groupId]);
          const subject = 'You were added to a SplitHive group';
          const text = `Hello ${'name' in body ? body.name : ''},\n\nYou were added to the group "${g?.name || ''}" on SplitHive.\nInstall the SplitHive app and sign up with this email to view your expenses.\n\nThanks,\nSplitHive`;
          const html = `<p>Hello ${'name' in body ? body.name : ''},</p><p>You were added to the group <strong>${g?.name || ''}</strong> on SplitHive.</p><p>Please install the SplitHive app and sign up with this email to view your expenses.</p><p>Thanks,<br/>SplitHive</p>`;
          await sendMail({ to: 'email' in body ? body.email : undefined, subject, text, html });
        } catch (_) {}
      })();
    }

    res.status(201).json({ ok: true, user_id: targetUserId, created_new_user: createdNewUser });
  } catch (err) {
    next(err);
  }
});

router.get('/:groupId/members', requireAuth, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    if (!(await isMember(req.user.id, groupId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const [rows] = await pool.execute(
      'SELECT u.id, u.name, u.email, gm.joined_at FROM users u JOIN group_members gm ON gm.user_id = u.id WHERE gm.group_id = ? ORDER BY gm.joined_at ASC',
      [groupId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:groupId/balances', requireAuth, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    if (!(await isMember(req.user.id, groupId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    // Compute per-user net balance: positive = should receive, negative = owes
    const [expenses] = await pool.execute(
      'SELECT id, payer_id, amount FROM expenses WHERE group_id = ?',
      [groupId]
    );
    const net = new Map();
    for (const e of expenses) {
      net.set(e.payer_id, (net.get(e.payer_id) || 0) + Number(e.amount));
      const [splits] = await pool.execute(
        'SELECT user_id, share_amount FROM expense_splits WHERE expense_id = ?',
        [e.id]
      );
      for (const s of splits) {
        net.set(s.user_id, (net.get(s.user_id) || 0) - Number(s.share_amount));
      }
    }
    // Apply recorded settlements: from_user pays to to_user
    const [settlements] = await pool.execute(
      'SELECT from_user_id, to_user_id, amount FROM settlements WHERE group_id = ?',
      [groupId]
    );
    for (const st of settlements) {
      net.set(st.from_user_id, (net.get(st.from_user_id) || 0) + Number(st.amount));
      net.set(st.to_user_id, (net.get(st.to_user_id) || 0) - Number(st.amount));
    }
    const ids = Array.from(net.keys());
    let users = [];
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await pool.query(
        `SELECT id, name, email FROM users WHERE id IN (${placeholders})`,
        ids
      );
      users = rows;
    }
    const byId = new Map(users.map(u => [u.id, u]));
    const result = [];
    for (const [user_id, bal] of net.entries()) {
      const u = byId.get(user_id);
      result.push({
        user_id,
        user_name: u?.name || null,
        user_email: u?.email || null,
        net_balance: Number(Number(bal).toFixed(2))
      });
    }
    // sort by name if available
    result.sort((a,b) => (a.user_name||'').localeCompare(b.user_name||''));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Suggest minimal settlement transfers to clear balances
router.get('/:groupId/settlements/suggested', async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    // Reuse balances endpoint logic by querying DB directly here
    const [expenses] = await pool.execute(
      'SELECT id, payer_id, amount FROM expenses WHERE group_id = ?',
      [groupId]
    );
    const net = new Map();
    for (const e of expenses) {
      net.set(e.payer_id, (net.get(e.payer_id) || 0) + Number(e.amount));
      const [splits] = await pool.execute(
        'SELECT user_id, share_amount FROM expense_splits WHERE expense_id = ?',
        [e.id]
      );
      for (const s of splits) {
        net.set(s.user_id, (net.get(s.user_id) || 0) - Number(s.share_amount));
      }
    }
    const [settlements] = await pool.execute(
      'SELECT from_user_id, to_user_id, amount FROM settlements WHERE group_id = ?',
      [groupId]
    );
    for (const st of settlements) {
      net.set(st.from_user_id, (net.get(st.from_user_id) || 0) + Number(st.amount));
      net.set(st.to_user_id, (net.get(st.to_user_id) || 0) - Number(st.amount));
    }
    // Build arrays of debtors and creditors
    const debtors = [];
    const creditors = [];
    for (const [user_id, bal] of net.entries()) {
      const amt = Number(Number(bal).toFixed(2));
      if (amt < -0.009) debtors.push({ user_id, amount: -amt }); // owes amount
      else if (amt > 0.009) creditors.push({ user_id, amount: amt }); // should receive
    }
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);
    const transfers = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const d = debtors[i];
      const c = creditors[j];
      const pay = Number(Math.min(d.amount, c.amount).toFixed(2));
      if (pay > 0) transfers.push({ from_user_id: d.user_id, to_user_id: c.user_id, amount: pay });
      d.amount = Number((d.amount - pay).toFixed(2));
      c.amount = Number((c.amount - pay).toFixed(2));
      if (d.amount <= 0.009) i++;
      if (c.amount <= 0.009) j++;
    }
    res.json(transfers);
  } catch (err) {
    next(err);
  }
});

// Remove a member if they have no financial ties in the group
router.delete('/:groupId/members/:userId', requireAuth, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    if (!(await isMember(req.user.id, groupId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const userId = Number(req.params.userId);
    // Check if user has any expense ties in the group
    const [[{ cnt: asPayer }]] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM expenses WHERE group_id = ? AND payer_id = ?',
      [groupId, userId]
    );
    const [[{ cnt: inSplits }]] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM expense_splits s JOIN expenses e ON e.id = s.expense_id WHERE e.group_id = ? AND s.user_id = ?',
      [groupId, userId]
    );
    const [[{ cnt: inSettlements }]] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM settlements WHERE group_id = ? AND (from_user_id = ? OR to_user_id = ?)',
      [groupId, userId, userId]
    );
    if (asPayer > 0 || inSplits > 0 || inSettlements > 0) {
      return res.status(400).json({ error: 'Cannot remove member with existing expenses or settlements' });
    }
    await pool.execute('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', [groupId, userId]);
    try {
      const [members] = await pool.execute('SELECT user_id FROM group_members WHERE group_id = ?', [groupId]);
      for (const m of members) emitToUser(m.user_id, 'members:removed', { group_id: groupId, user_id: userId });
      // if the removed user has a socket, also notify them
      emitToUser(userId, 'groups:refresh', { reason: 'removed_from_group', group_id: groupId });
    } catch (_) {}
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Create an invite token for this group
router.post('/:groupId/invites', requireAuth, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    if (!(await isMember(req.user.id, groupId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const token = generateInviteToken();
    await pool.execute('INSERT INTO group_invites (token, group_id) VALUES (?, ?)', [token, groupId]);
    res.status(201).json({ token });
  } catch (err) {
    next(err);
  }
});

export default router;
