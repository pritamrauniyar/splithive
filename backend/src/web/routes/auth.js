import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from '../../db/pool.js';
import { sendMail, verificationLink, isEmailEnabled } from '../../utils/mailer.js';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const MIN_RESEND_SEC_VERIFY = parseInt(process.env.VERIFY_RESEND_MIN_SEC || '60', 10);
const MAX_PER_HOUR_VERIFY = parseInt(process.env.VERIFY_MAX_PER_HOUR || '5', 10);
const MIN_RESEND_SEC_RESET = parseInt(process.env.RESET_RESEND_MIN_SEC || process.env.VERIFY_RESEND_MIN_SEC || '60', 10);
const MAX_PER_HOUR_RESET = parseInt(process.env.RESET_MAX_PER_HOUR || process.env.VERIFY_MAX_PER_HOUR || '5', 10);

async function enforceThrottle(userId, purpose) {
  const minSec = purpose === 'password_reset' ? MIN_RESEND_SEC_RESET : MIN_RESEND_SEC_VERIFY;
  const maxHour = purpose === 'password_reset' ? MAX_PER_HOUR_RESET : MAX_PER_HOUR_VERIFY;
  // Block if last code was sent within MIN_RESEND_SEC seconds
  const [lastRows] = await pool.execute(
    'SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS age_s FROM verification_tokens WHERE user_id = ? AND purpose = ? ORDER BY created_at DESC LIMIT 1',
    [userId, purpose]
  );
  if (lastRows.length) {
    const age = Number(lastRows[0].age_s || 0);
    if (age < minSec) {
      return { ok: false, retryAfter: minSec - age };
    }
  }
  // Block if too many within past hour
  const [[cntRow]] = await pool.execute(
    'SELECT COUNT(*) AS cnt FROM verification_tokens WHERE user_id = ? AND purpose = ? AND created_at >= (NOW() - INTERVAL 1 HOUR)',
    [userId, purpose]
  );
  if (Number(cntRow.cnt || 0) >= maxHour) {
    return { ok: false, tooMany: true };
  }
  return { ok: true };
}

async function invalidatePreviousCodes(userId, purpose) {
  await pool.execute('UPDATE verification_tokens SET used_at = NOW() WHERE user_id = ? AND purpose = ? AND used_at IS NULL', [userId, purpose]);
}

// Signup with email/password, returns a verification token (dev) and minimal user info
router.post('/signup', async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6)
    }).parse(req.body);
    const [exists] = await pool.execute('SELECT id, name, password_hash, email_verified FROM users WHERE email = ?', [body.email]);
    let userId = null;
    let effectiveName = body.name;
    const hash = await bcrypt.hash(body.password, 10);
    if (exists.length) {
      // If password is already set, block signup (user must login)
      if (exists[0].password_hash) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      // Upgrade placeholder account: set password and name, keep email_verified as is (likely 0)
      userId = exists[0].id;
      if (!exists[0].name || exists[0].name.trim().length === 0) {
        await pool.execute('UPDATE users SET name = ?, password_hash = ?, email_verified = 0 WHERE id = ?', [effectiveName, hash, userId]);
      } else {
        // Preserve existing name if present
        effectiveName = exists[0].name;
        await pool.execute('UPDATE users SET password_hash = ?, email_verified = 0 WHERE id = ?', [hash, userId]);
      }
    } else {
      const [ins] = await pool.execute('INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, 0)', [effectiveName, body.email, hash]);
      userId = ins.insertId;
    }
    await invalidatePreviousCodes(userId, 'email_verify');
    // 6-digit numeric code
    const token = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await pool.execute('INSERT INTO verification_tokens (token, user_id, expires_at, purpose) VALUES (?, ?, ?, ?)', [token, userId, expires, 'email_verify']);
    if (isEmailEnabled()) {
      await sendMail({
        to: body.email,
        subject: 'Your SplitHive verification code',
        text: `Hi ${effectiveName},\n\nYour verification code is: ${token}\n\nThis code expires in 24 hours. If you did not sign up, you can ignore this email.`,
        html: `<p>Hi ${effectiveName},</p><p>Your verification code is:</p><p style=\"font-size:20px;font-weight:bold;letter-spacing:2px;\">${token}</p><p>This code expires in 24 hours. If you did not sign up, you can ignore this email.</p>`
      });
      res.status(201).json({ ok: true, emailed: true, user: { id: userId, name: effectiveName, email: body.email } });
    } else {
      // Dev fallback: return the token in response
      res.status(201).json({ ok: true, verify_token: token, user: { id: userId, name: effectiveName, email: body.email } });
    }
  } catch (err) {
    next(err);
  }
});

// Verify email using token; returns JWT when successful
router.post('/verify-email', async (req, res, next) => {
  const schema = z.object({ token: z.string().min(4) });
  try {
    const { token } = schema.parse(req.body);
    const [rows] = await pool.execute('SELECT token, user_id, expires_at, used_at FROM verification_tokens WHERE token = ? AND purpose = ?', [token, 'email_verify']);
    if (!rows.length) return res.status(400).json({ error: 'Invalid token' });
    const vt = rows[0];
    if (vt.used_at) return res.status(400).json({ error: 'Token already used' });
    if (vt.expires_at && new Date(vt.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'Token expired' });
    await pool.execute('UPDATE users SET email_verified = 1 WHERE id = ?', [vt.user_id]);
    await pool.execute('UPDATE verification_tokens SET used_at = NOW() WHERE token = ?', [token]);
    const [[user]] = await pool.query('SELECT id, name, email FROM users WHERE id = ?', [vt.user_id]);
    const jwtToken = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token: jwtToken, user });
  } catch (err) {
    next(err);
  }
});

// Login with email/password
router.post('/login', async (req, res, next) => {
  try {
    const body = z.object({ email: z.string().email(), password: z.string().min(6) }).parse(req.body);
    const [rows] = await pool.execute('SELECT id, name, email, password_hash, email_verified FROM users WHERE email = ?', [body.email]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const user = rows[0];
    // If user exists but has no password (placeholder), treat as not found to drive signup flow
    if (!user.password_hash) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(body.password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.email_verified) return res.status(403).json({ error: 'Email not verified' });
    const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    next(err);
  }
});

// Forgot password: send 6-digit code for password reset
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const [rows] = await pool.execute('SELECT id, email_verified FROM users WHERE email = ?', [email]);
    // Respond 200 even if user not found to avoid user enumeration
    if (!rows.length) return res.json({ ok: true });
    const userId = rows[0].id;
    const thr = await enforceThrottle(userId, 'password_reset');
    if (!thr.ok) {
      if (thr.retryAfter) return res.status(429).json({ error: 'Too many requests', retry_after: thr.retryAfter });
      if (thr.tooMany) return res.status(429).json({ error: 'Too many requests this hour' });
      return res.status(429).json({ error: 'Too many requests' });
    }
    await invalidatePreviousCodes(userId, 'password_reset');
    const token = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry for reset
    await pool.execute('INSERT INTO verification_tokens (token, user_id, expires_at, purpose) VALUES (?, ?, ?, ?)', [token, userId, expires, 'password_reset']);
    if (isEmailEnabled()) {
      await sendMail({
        to: email,
        subject: 'Your SplitHive password reset code',
        text: `Use this code to reset your password: ${token}\n\nThis code expires in 1 hour.`,
        html: `<p>Use this code to reset your password:</p><p style=\"font-size:20px;font-weight:bold;letter-spacing:2px;\">${token}</p><p>This code expires in 1 hour.</p>`
      });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Reset password using code
router.post('/reset-password', async (req, res, next) => {
  try {
    const body = z.object({ email: z.string().email(), token: z.string().min(4), new_password: z.string().min(6) }).parse(req.body);
    const [rows] = await pool.execute('SELECT id FROM users WHERE email = ?', [body.email]);
    if (!rows.length) return res.status(400).json({ error: 'Invalid email or code' });
    const userId = rows[0].id;
    const [vtRows] = await pool.execute('SELECT token, expires_at, used_at FROM verification_tokens WHERE user_id = ? AND purpose = ? AND token = ?', [userId, 'password_reset', body.token]);
    if (!vtRows.length) return res.status(400).json({ error: 'Invalid code' });
    const vt = vtRows[0];
    if (vt.used_at) return res.status(400).json({ error: 'Code already used' });
    if (vt.expires_at && new Date(vt.expires_at).getTime() < Date.now()) return res.status(400).json({ error: 'Code expired' });
    const hash = await bcrypt.hash(body.new_password, 10);
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
    await pool.execute('UPDATE verification_tokens SET used_at = NOW() WHERE user_id = ? AND purpose = ?', [userId, 'password_reset']);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Change password (authenticated)
router.post('/change-password', async (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const m = auth.match(/^Bearer (.+)$/i);
    if (!m) return res.status(401).json({ error: 'Missing token' });
    const payload = jwt.verify(m[1], JWT_SECRET);
    const body = z.object({ old_password: z.string().min(6), new_password: z.string().min(6) }).parse(req.body);
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = ?', [payload.sub]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const ok = await bcrypt.compare(body.old_password, rows[0].password_hash || '');
    if (!ok) return res.status(401).json({ error: 'Old password incorrect' });
    const hash = await bcrypt.hash(body.new_password, 10);
    await pool.execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, payload.sub]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
// Resend verification token
router.post('/request-verification', async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const [rows] = await pool.execute('SELECT id, email_verified FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    if (rows[0].email_verified) return res.status(400).json({ error: 'Email already verified' });
    const userId = rows[0].id;
    // Throttle checks
    const thr = await enforceThrottle(userId, 'email_verify');
    if (!thr.ok) {
      if (thr.retryAfter) return res.status(429).json({ error: 'Too many requests', retry_after: thr.retryAfter });
      if (thr.tooMany) return res.status(429).json({ error: 'Too many requests this hour' });
      return res.status(429).json({ error: 'Too many requests' });
    }
    await invalidatePreviousCodes(userId, 'email_verify');
    const token = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await pool.execute('INSERT INTO verification_tokens (token, user_id, expires_at, purpose) VALUES (?, ?, ?, ?)', [token, userId, expires, 'email_verify']);
    if (isEmailEnabled()) {
      await sendMail({
        to: email,
        subject: 'Your SplitHive verification code',
        text: `Your verification code is: ${token}\n\nThis code expires in 24 hours.`,
        html: `<p>Your verification code is:</p><p style=\"font-size:20px;font-weight:bold;letter-spacing:2px;\">${token}</p><p>This code expires in 24 hours.</p>`
      });
      res.json({ ok: true, emailed: true });
    } else {
      res.json({ ok: true, verify_token: token });
    }
  } catch (err) {
    next(err);
  }
});

// Link-based verification endpoint for email links
router.get('/verify-email', async (req, res, next) => {
  try {
    const token = String(req.query.token || '');
    if (!token) return res.status(400).send('Missing token');
    const [rows] = await pool.execute('SELECT token, user_id, expires_at, used_at FROM verification_tokens WHERE token = ?', [token]);
    if (!rows.length) return res.status(400).send('Invalid token');
    const vt = rows[0];
    if (vt.used_at) return res.status(400).send('Token already used');
    if (vt.expires_at && new Date(vt.expires_at).getTime() < Date.now()) return res.status(400).send('Token expired');
    await pool.execute('UPDATE users SET email_verified = 1 WHERE id = ?', [vt.user_id]);
    await pool.execute('UPDATE verification_tokens SET used_at = NOW() WHERE token = ?', [token]);
    res.send('<html><body><h2>Email verified</h2><p>You can now return to the app.</p></body></html>');
  } catch (err) {
    next(err);
  }
});

router.get('/me', async (req, res, next) => {
  try {
    const auth = req.headers.authorization || '';
    const m = auth.match(/^Bearer (.+)$/i);
    if (!m) return res.status(401).json({ error: 'Missing token' });
    const payload = jwt.verify(m[1], JWT_SECRET);
    const [rows] = await pool.execute('SELECT id, name, email, created_at FROM users WHERE id = ?', [payload.sub]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Delete current account safely
async function handleDeleteAccount(req, res, next) {
  const userId = req.user.id;
  try {
    const [[{ cnt: asPayer }]] = await pool.query('SELECT COUNT(*) AS cnt FROM expenses WHERE payer_id = ?', [userId]);
    const [[{ cnt: inSplits }]] = await pool.query('SELECT COUNT(*) AS cnt FROM expense_splits WHERE user_id = ?', [userId]);
    const [[{ cnt: inSettlements }]] = await pool.query('SELECT COUNT(*) AS cnt FROM settlements WHERE from_user_id = ? OR to_user_id = ?', [userId, userId]);

    if (Number(asPayer) > 0 || Number(inSplits) > 0 || Number(inSettlements) > 0) {
      return res.status(400).json({
        error: 'Cannot delete account as there are pending settlements or expenses. Please settle all balances and remove related expenses, then try again.'
      });
    }

    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

router.delete('/account', requireAuth, handleDeleteAccount);
// Fallback alias in case some clients or proxies block DELETE
router.post('/account/delete', requireAuth, handleDeleteAccount);

export default router;
