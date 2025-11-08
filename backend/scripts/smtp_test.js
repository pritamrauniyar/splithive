import 'dotenv/config';
import { getTransporter, sendMail } from '../src/utils/mailer.js';

async function main() {
  try {
    const transporter = await getTransporter();
    await transporter.verify();
    console.log('[smtp] Connection OK to', process.env.SMTP_HOST, 'port', process.env.SMTP_PORT, 'secure', process.env.SMTP_SECURE);
    const to = process.argv[2] || process.env.SMTP_USER;
    if (!to) {
      console.log('[smtp] Skipping test message (no recipient provided).');
      return;
    }
    const info = await sendMail({
      to,
      subject: 'SplitHive SMTP test',
      text: 'This is a test email from SplitHive SMTP test script.'
    });
    console.log('[smtp] Test message sent:', info && info.messageId);
  } catch (err) {
    console.error('[smtp] FAILED:', err.message);
    process.exit(1);
  }
}

main();

