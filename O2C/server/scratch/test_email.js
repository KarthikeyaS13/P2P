const { sendEmail } = require('../services/emailService');

async function test() {
  console.log('Sending test email to verify credentials...');
  const result = await sendEmail({
    to: 'Update.O2C@sudhaanalyticals.com', // send it to themselves to verify delivery
    subject: 'O2C Portal - SMTP Connection Test',
    html: '<h3>Test Successful!</h3><p>Your O2C system is successfully connected to Microsoft 365 SMTP.</p>'
  });

  if (result.success) {
    console.log('🎉 TEST SUCCESSFUL! The email was sent.');
  } else {
    console.log('❌ TEST FAILED!', result.error);
  }
}

test();
