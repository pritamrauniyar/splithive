import nodemailer from 'nodemailer';

let transporterPromise = null;

function bool(v) {
  if (typeof v === 'string') return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
  return !!v;
}

export function isEmailEnabled() {
  return !!process.env.SMTP_HOST && !!process.env.SMTP_USER;
}

export async function getTransporter() {
  if (!isEmailEnabled()) {
    throw new Error('SMTP not configured');
  }
  if (!transporterPromise) {
    transporterPromise = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: bool(process.env.SMTP_SECURE || 'false'),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return transporterPromise;
}

export async function sendMail({ to, subject, text, html }) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  try {
    const transporter = await getTransporter();
    return await transporter.sendMail({ from, to, subject, text, html });
  } catch (err) {
    console.warn('[mail] sendMail skipped or failed:', err.message);
    return null;
  }
}

export function verificationLink(token) {
  const base = process.env.APP_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`;
  return `${base}/auth/verify-email?token=${encodeURIComponent(token)}`;
}

