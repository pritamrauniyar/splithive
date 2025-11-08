import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const m = auth.match(/^Bearer (.+)$/i);
    if (!m) return res.status(401).json({ error: 'Unauthorized' });
    const secret = process.env.JWT_SECRET || 'dev_secret_change_me';
    const payload = jwt.verify(m[1], secret);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

