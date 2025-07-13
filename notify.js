const notifier = require('node-notifier');
const nodemailer = require('nodemailer');
const secrets = require('./secrets.json');

function notifyDesktop(title, message) {
  notifier.notify({
    title,
    message,
    sound: true,
  });
}

async function notifyEmail(subject, message) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: secrets.gmail.user,
      pass: secrets.gmail.pass
    }
  });

  await transporter.sendMail({
    from: `"Price Tracker" <${secrets.gmail.user}>`,
    to: secrets.gmail.user,
    subject,
    text: message
  });
}

module.exports = { notifyDesktop, notifyEmail };