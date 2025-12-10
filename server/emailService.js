const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (transporter !== null) {
    return transporter;
  }
  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_SECURE
  } = process.env;
  // Fall back to Shoot Poker defaults when env not provided
  const host = SMTP_HOST || 'smtp.dreamhost.com';
  const port = Number(SMTP_PORT || 465);
  const user = SMTP_USER || 'no-reply@shoot.poker';
  const pass = SMTP_PASS || 'Auto-caravan5';
  const secure = SMTP_SECURE ? SMTP_SECURE === 'true' : true;

  if (host && port && user && pass) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass
      }
    });
  } else {
    transporter = null;
  }
  return transporter;
}

async function sendSystemEmail({
  to,
  subject,
  html,
  text
}) {
  if (!to) {
    throw new Error('Email recipient not specified');
  }
  const activeTransporter = getTransporter();
  if (!activeTransporter) {
    console.log('[Email placeholder]', { to, subject, text, html });
    return;
  }
  await activeTransporter.sendMail({
    to,
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@shoot.poker',
    subject,
    text,
    html
  });
}

module.exports = {
  sendSystemEmail
};

