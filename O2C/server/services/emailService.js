const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from server/.env if it exists
dotenv.config({ path: path.join(__dirname, '../.env') });

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'; // true for port 465, false for 587
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

let transporter = null;

if (SMTP_USER && SMTP_PASS) {
  const transportConfig = {
    host: SMTP_HOST || 'smtp.office365.com',
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  };

  // If using Office365 or Outlook, apply standard TLS configurations to prevent cipher handshake errors
  if (transportConfig.host.includes('office365') || transportConfig.host.includes('outlook')) {
    transportConfig.tls = {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    };
  }

  transporter = nodemailer.createTransport(transportConfig);
  console.log(`✅ Email service initialized with SMTP Host: ${transportConfig.host}`);
} else {
  console.log('⚠️ SMTP credentials not found in environment variables. Email service is running in mock/dry-run mode.');
}

/**
 * Sends an email using Nodemailer or logs to console if in mock mode.
 * @param {object} params
 * @param {string} params.to Recipient email
 * @param {string} params.subject Email subject
 * @param {string} params.html HTML body content
 * @param {string} [params.text] Plain text body content
 */
async function sendEmail({ to, subject, html, text }) {
  if (!to) {
    console.error('❌ Cannot send email: No recipient address specified.');
    return { success: false, error: 'No recipient' };
  }

  const mailOptions = {
    from: `"Enterprise O2C Portal" <${SMTP_USER || 'no-reply@company.com'}>`,
    to,
    subject,
    text: text || html.replace(/<[^>]*>/g, ''), // fall back to basic strip-tags plain text
    html
  };

  if (transporter) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✉️ Email successfully sent to ${to}. Message ID: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`❌ Failed to send email to ${to}:`, error);
      return { success: false, error };
    }
  } else {
    console.log(`\n================= [EMAIL MOCK SERVICE] =================`);
    console.log(`TO:      ${to}`);
    console.log(`FROM:    ${mailOptions.from}`);
    console.log(`SUBJECT: ${subject}`);
    console.log(`BODY (HTML):`);
    console.log(html);
    console.log(`========================================================\n`);
    return { success: true, mock: true };
  }
}

module.exports = {
  sendEmail
};
