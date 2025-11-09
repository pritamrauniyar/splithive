import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { emitToUser } from '../../realtime/io.js';

const router = Router();

async function isMember(userId, groupId) {
  const [[{ cnt }]] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM group_members WHERE user_id = ? AND group_id = ?',
    [userId, groupId]
  );
  return Number(cnt) > 0;
}

function toSqlDateTimeFromInput(s) {
  try {
    if (!s || typeof s !== 'string') return null;
    // If YYYY-MM-DD, force midnight without timezone conversion
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]} 00:00:00`;
    // Fallback: parse as Date and format to local 'YYYY-MM-DD HH:MM:SS'
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    const Y = d.getFullYear();
    const M = pad(d.getMonth() + 1);
    const D = pad(d.getDate());
    const h = pad(d.getHours());
    const mi = pad(d.getMinutes());
    const se = pad(d.getSeconds());
    return `${Y}-${M}-${D} ${h}:${mi}:${se}`;
  } catch (_) {
    return null;
  }
}

const splitTypeEnum = z.enum(['equal', 'exact', 'percent', 'shares']);
const createExpenseSchema = z.object({
  group_id: z.number().int(),
  payer_id: z.number().int(),
  amount: z.number().positive(),
  currency: z.string().default('INR').optional(),
  description: z.string().min(1),
  category: z.string().max(50).optional(),
  created_at: z.string().optional(),
  participants: z.array(z.number().int()).min(1),
  split_type: splitTypeEnum.optional(),
  splits: z
    .array(z.object({
      user_id: z.number().int(),
      amount: z.number().nonnegative().optional(),
      percent: z.number().nonnegative().optional(),
      shares: z.number().int().nonnegative().optional()
    }))
    .optional()
});

// Update schema identical to create (we fully replace expense + splits)
const updateExpenseSchema = createExpenseSchema.extend({});

router.post('/', requireAuth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const body = createExpenseSchema.parse(req.body);
    if (!(await isMember(req.user.id, body.group_id))) {
      conn.release();
      return res.status(403).json({ error: 'Forbidden' });
    }
    // Validate that payer and all participants are members of the group
    const [memberRows] = await pool.execute(
      'SELECT user_id FROM group_members WHERE group_id = ?',
      [body.group_id]
    );
    const memberSet = new Set(memberRows.map(r => Number(r.user_id)));
    const invalid = [];
    if (!memberSet.has(Number(body.payer_id))) invalid.push(Number(body.payer_id));
    for (const uid of body.participants) {
      if (!memberSet.has(Number(uid))) invalid.push(Number(uid));
    }
    if (invalid.length) {
      conn.release();
      return res.status(400).json({ error: `All participants and payer must be group members. Not in group: ${[...new Set(invalid)].join(', ')}` });
    }
    await conn.beginTransaction();

    const customCreatedAt = toSqlDateTimeFromInput(body.created_at);
    const insertSql = customCreatedAt
      ? 'INSERT INTO expenses (group_id, payer_id, created_by, amount, currency, description, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      : 'INSERT INTO expenses (group_id, payer_id, created_by, amount, currency, description, category) VALUES (?, ?, ?, ?, ?, ?, ?)';
    const insertArgs = customCreatedAt
      ? [body.group_id, body.payer_id, req.user.id, body.amount, body.currency || 'INR', body.description, body.category || 'General', customCreatedAt]
      : [body.group_id, body.payer_id, req.user.id, body.amount, body.currency || 'INR', body.description, body.category || 'General'];
    const [expenseResult] = await conn.execute(insertSql, insertArgs);
    const expenseId = expenseResult.insertId;

    const splitType = body.split_type || 'equal';
    if (splitType === 'equal') {
      const perHead = Number((body.amount / body.participants.length).toFixed(2));
      const remainder = Number((body.amount - perHead * body.participants.length).toFixed(2));
      for (let i = 0; i < body.participants.length; i++) {
        const userId = body.participants[i];
        const share = i === 0 ? perHead + remainder : perHead; // adjust rounding on first
        await conn.execute(
          'INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (?, ?, ?)',
          [expenseId, userId, share]
        );
      }
    } else if (splitType === 'exact') {
      if (!body.splits || body.splits.length === 0) {
        throw Object.assign(new Error('splits required for exact split'), { status: 400 });
      }
      const ids = new Set(body.participants);
      let sum = 0;
      for (const s of body.splits) {
        if (!ids.has(s.user_id)) {
          throw Object.assign(new Error('split user not in participants'), { status: 400 });
        }
        sum += Number(s.amount || 0);
      }
      sum = Number(sum.toFixed(2));
      if (Math.abs(sum - body.amount) > 0.01) {
        throw Object.assign(new Error('split amounts must total expense amount'), { status: 400 });
      }
      for (const s of body.splits) {
        await conn.execute(
          'INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (?, ?, ?)',
          [expenseId, s.user_id, s.amount]
        );
      }
    } else if (splitType === 'percent') {
      if (!body.splits || body.splits.length === 0) {
        throw Object.assign(new Error('splits required for percent split'), { status: 400 });
      }
      const ids = new Set(body.participants);
      let totalPct = 0;
      for (const s of body.splits) {
        if (!ids.has(s.user_id)) {
          throw Object.assign(new Error('split user not in participants'), { status: 400 });
        }
        totalPct += Number(s.percent || 0);
      }
      if (Math.abs(totalPct - 100) > 0.01) {
        throw Object.assign(new Error('percent splits must total 100'), { status: 400 });
      }
      // Calculate amounts and adjust rounding remainder on first participant
      const amounts = body.splits.map(s => Number(((body.amount * (Number(s.percent || 0) / 100))).toFixed(2)));
      let sum = Number(amounts.reduce((a, b) => a + b, 0).toFixed(2));
      const remainder = Number((body.amount - sum).toFixed(2));
      for (let i = 0; i < body.splits.length; i++) {
        const s = body.splits[i];
        const adj = i === 0 ? amounts[i] + remainder : amounts[i];
        await conn.execute(
          'INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (?, ?, ?)',
          [expenseId, s.user_id, adj]
        );
      }
    } else if (splitType === 'shares') {
      if (!body.splits || body.splits.length === 0) {
        throw Object.assign(new Error('splits required for shares split'), { status: 400 });
      }
      const ids = new Set(body.participants);
      let totalShares = 0;
      for (const s of body.splits) {
        if (!ids.has(s.user_id)) {
          throw Object.assign(new Error('split user not in participants'), { status: 400 });
        }
        totalShares += Number(s.shares || 0);
      }
      if (totalShares <= 0) {
        throw Object.assign(new Error('total shares must be > 0'), { status: 400 });
      }
      const perShare = body.amount / totalShares;
      const amounts = body.splits.map(s => Number((perShare * Number(s.shares || 0)).toFixed(2)));
      let sum = Number(amounts.reduce((a, b) => a + b, 0).toFixed(2));
      const remainder = Number((body.amount - sum).toFixed(2));
      for (let i = 0; i < body.splits.length; i++) {
        const s = body.splits[i];
        const adj = i === 0 ? amounts[i] + remainder : amounts[i];
        await conn.execute(
          'INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (?, ?, ?)',
          [expenseId, s.user_id, adj]
        );
      }
    } else {
      throw Object.assign(new Error('unsupported split_type'), { status: 400 });
    }

    await conn.commit();

    // Notify all group members with the new expense payload to reduce refetching
    try {
      const [[expense]] = await pool.execute(
        'SELECT id, amount, currency, description, payer_id, created_at, category FROM expenses WHERE id = ?',
        [expenseId]
      );
      const [splits] = await pool.execute(
        'SELECT user_id, share_amount FROM expense_splits WHERE expense_id = ?',
        [expenseId]
      );
      const payload = { group_id: body.group_id, expense: { ...expense, splits } };
      const [members] = await pool.execute('SELECT user_id FROM group_members WHERE group_id = ?', [body.group_id]);
      for (const m of members) emitToUser(m.user_id, 'expenses:created', payload);
    } catch (_) {}
    res.status(201).json({ id: expenseId });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

router.get('/group/:groupId', requireAuth, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    if (!(await isMember(req.user.id, groupId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const [rows] = await pool.execute(
      `SELECT e.id, e.amount, e.currency, e.description, e.payer_id, e.created_at,
              e.category, e.created_by,
              JSON_ARRAYAGG(JSON_OBJECT('user_id', s.user_id, 'share_amount', s.share_amount)) AS splits
       FROM expenses e JOIN expense_splits s ON s.expense_id = e.id
       WHERE e.group_id = ?
       GROUP BY e.id
       ORDER BY e.created_at DESC, e.id DESC`,
      [groupId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Get single expense details (with splits and names)
router.get('/:expenseId', requireAuth, async (req, res, next) => {
  try {
    const expenseId = Number(req.params.expenseId);
    const [[expense]] = await pool.execute(
      `SELECT e.id, e.group_id, e.amount, e.currency, e.description, e.payer_id, e.created_at, e.category,
              u.name AS payer_name, e.created_by, cu.name AS creator_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.payer_id
       LEFT JOIN users cu ON cu.id = e.created_by
       WHERE e.id = ?`,
      [expenseId]
    );
    if (!expense) return res.status(404).json({ error: 'Not found' });
    // Membership check
    if (!(await isMember(req.user.id, expense.group_id))) return res.status(403).json({ error: 'Forbidden' });
    const [splits] = await pool.execute(
      `SELECT s.user_id, s.share_amount, u.name AS user_name
       FROM expense_splits s LEFT JOIN users u ON u.id = s.user_id WHERE s.expense_id = ?`,
      [expenseId]
    );
    res.json({ ...expense, splits });
  } catch (err) {
    next(err);
  }
});

// Delete expense
router.delete('/:expenseId', requireAuth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const expenseId = Number(req.params.expenseId);
    const [[expense]] = await conn.execute('SELECT id, group_id FROM expenses WHERE id = ?', [expenseId]);
    if (!expense) { conn.release(); return res.status(404).json({ error: 'Not found' }); }
    if (!(await isMember(req.user.id, expense.group_id))) { conn.release(); return res.status(403).json({ error: 'Forbidden' }); }
    await conn.beginTransaction();
    await conn.execute('DELETE FROM expenses WHERE id = ?', [expenseId]);
    await conn.commit();
    try {
      const [members] = await pool.execute('SELECT user_id FROM group_members WHERE group_id = ?', [expense.group_id]);
      for (const m of members) emitToUser(m.user_id, 'expenses:deleted', { group_id: expense.group_id, id: expenseId });
    } catch (_) {}
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// Update an expense in-place (replaces description/payer/amount/category/created_at and all splits)
router.put('/:expenseId', requireAuth, async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const expenseId = Number(req.params.expenseId);
    const body = updateExpenseSchema.parse(req.body);
    // Check expense exists and membership
    const [[existing]] = await conn.execute('SELECT id, group_id FROM expenses WHERE id = ?', [expenseId]);
    if (!existing) { conn.release(); return res.status(404).json({ error: 'Not found' }); }
    if (Number(existing.group_id) !== Number(body.group_id)) { conn.release(); return res.status(400).json({ error: 'group_id mismatch' }); }
    if (!(await isMember(req.user.id, body.group_id))) { conn.release(); return res.status(403).json({ error: 'Forbidden' }); }

    // Validate participants are members
    const [memberRows] = await pool.execute('SELECT user_id FROM group_members WHERE group_id = ?', [body.group_id]);
    const memberSet = new Set(memberRows.map(r => Number(r.user_id)));
    const invalid = [];
    if (!memberSet.has(Number(body.payer_id))) invalid.push(Number(body.payer_id));
    for (const uid of body.participants) if (!memberSet.has(Number(uid))) invalid.push(Number(uid));
    if (invalid.length) { conn.release(); return res.status(400).json({ error: `All participants and payer must be group members. Not in group: ${[...new Set(invalid)].join(', ')}` }); }

    await conn.beginTransaction();
    // If expense had no creator (legacy rows), stamp current user as creator on first edit
    await conn.execute('UPDATE expenses SET created_by = IFNULL(created_by, ?) WHERE id = ?', [req.user.id, expenseId]);

    // Update expense header
    const customCreatedAt = toSqlDateTimeFromInput(body.created_at);
    if (customCreatedAt) {
      await conn.execute(
        'UPDATE expenses SET payer_id = ?, amount = ?, currency = ?, description = ?, category = ?, created_at = ? WHERE id = ?',
        [body.payer_id, body.amount, body.currency || 'INR', body.description, body.category || 'General', customCreatedAt, expenseId]
      );
    } else {
      await conn.execute(
        'UPDATE expenses SET payer_id = ?, amount = ?, currency = ?, description = ?, category = ? WHERE id = ?',
        [body.payer_id, body.amount, body.currency || 'INR', body.description, body.category || 'General', expenseId]
      );
    }

    // Replace splits
    await conn.execute('DELETE FROM expense_splits WHERE expense_id = ?', [expenseId]);

    const splitType = body.split_type || 'equal';
    if (splitType === 'equal') {
      const perHead = Number((body.amount / body.participants.length).toFixed(2));
      const remainder = Number((body.amount - perHead * body.participants.length).toFixed(2));
      for (let i = 0; i < body.participants.length; i++) {
        const userId = body.participants[i];
        const share = i === 0 ? perHead + remainder : perHead;
        await conn.execute('INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (?, ?, ?)', [expenseId, userId, share]);
      }
    } else if (splitType === 'exact') {
      if (!body.splits || body.splits.length === 0) throw Object.assign(new Error('splits required for exact split'), { status: 400 });
      const ids = new Set(body.participants);
      let sum = 0;
      for (const s of body.splits) { if (!ids.has(s.user_id)) throw Object.assign(new Error('split user not in participants'), { status: 400 }); sum += Number(s.amount || 0); }
      sum = Number(sum.toFixed(2));
      if (Math.abs(sum - body.amount) > 0.01) throw Object.assign(new Error('split amounts must total expense amount'), { status: 400 });
      for (const s of body.splits) await conn.execute('INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (?, ?, ?)', [expenseId, s.user_id, s.amount]);
    } else if (splitType === 'percent') {
      if (!body.splits || body.splits.length === 0) throw Object.assign(new Error('splits required for percent split'), { status: 400 });
      const ids = new Set(body.participants);
      let totalPct = 0; for (const s of body.splits) { if (!ids.has(s.user_id)) throw Object.assign(new Error('split user not in participants'), { status: 400 }); totalPct += Number(s.percent || 0); }
      if (Math.abs(totalPct - 100) > 0.01) throw Object.assign(new Error('percent splits must total 100'), { status: 400 });
      const amounts = body.splits.map(s => Number(((body.amount * (Number(s.percent || 0) / 100))).toFixed(2)));
      let sum = Number(amounts.reduce((a, b) => a + b, 0).toFixed(2));
      const remainder = Number((body.amount - sum).toFixed(2));
      for (let i = 0; i < body.splits.length; i++) {
        const s = body.splits[i];
        const adj = i === 0 ? amounts[i] + remainder : amounts[i];
        await conn.execute('INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (?, ?, ?)', [expenseId, s.user_id, adj]);
      }
    } else if (splitType === 'shares') {
      if (!body.splits || body.splits.length === 0) throw Object.assign(new Error('splits required for shares split'), { status: 400 });
      const ids = new Set(body.participants);
      let totalShares = 0; for (const s of body.splits) { if (!ids.has(s.user_id)) throw Object.assign(new Error('split user not in participants'), { status: 400 }); totalShares += Number(s.shares || 0); }
      if (totalShares <= 0) throw Object.assign(new Error('total shares must be > 0'), { status: 400 });
      const perShare = body.amount / totalShares;
      const amounts = body.splits.map(s => Number((perShare * Number(s.shares || 0)).toFixed(2)));
      let sum = Number(amounts.reduce((a, b) => a + b, 0).toFixed(2));
      const remainder = Number((body.amount - sum).toFixed(2));
      for (let i = 0; i < body.splits.length; i++) {
        const s = body.splits[i];
        const adj = i === 0 ? amounts[i] + remainder : amounts[i];
        await conn.execute('INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (?, ?, ?)', [expenseId, s.user_id, adj]);
      }
    } else {
      throw Object.assign(new Error('unsupported split_type'), { status: 400 });
    }

    await conn.commit();
    // Optionally emit update event
    try {
      const [members] = await pool.execute('SELECT user_id FROM group_members WHERE group_id = ?', [body.group_id]);
      for (const m of members) emitToUser(m.user_id, 'expenses:updated', { group_id: body.group_id, id: expenseId });
    } catch (_) {}
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

const settlementSchema = z.object({
  from_user_id: z.number().int(),
  to_user_id: z.number().int(),
  amount: z.number().positive()
});

router.post('/group/:groupId/settlements', requireAuth, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    if (!(await isMember(req.user.id, groupId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const body = settlementSchema.parse(req.body);
    await pool.execute(
      'INSERT INTO settlements (group_id, from_user_id, to_user_id, amount) VALUES (?, ?, ?, ?)',
      [groupId, body.from_user_id, body.to_user_id, body.amount]
    );
    try {
      const [members] = await pool.execute('SELECT user_id FROM group_members WHERE group_id = ?', [groupId]);
      const payload = { group_id: groupId, settlement: body };
      for (const m of members) emitToUser(m.user_id, 'settlements:created', payload);
    } catch (_) {}
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// List recorded settlements for a group (history)
router.get('/group/:groupId/settlements', requireAuth, async (req, res, next) => {
  try {
    const groupId = Number(req.params.groupId);
    if (!(await isMember(req.user.id, groupId))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const [rows] = await pool.execute(
      `SELECT s.id,
              s.from_user_id,
              fu.name AS from_user_name,
              s.to_user_id,
              tu.name AS to_user_name,
              s.amount,
              s.created_at
       FROM settlements s
       JOIN users fu ON fu.id = s.from_user_id
       JOIN users tu ON tu.id = s.to_user_id
       WHERE s.group_id = ?
       ORDER BY s.created_at DESC, s.id DESC`,
      [groupId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
