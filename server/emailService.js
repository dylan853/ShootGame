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
  if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: SMTP_SECURE === 'true',
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
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
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    subject,
    text,
    html
  });
}

module.exports = {
  sendSystemEmail
};

