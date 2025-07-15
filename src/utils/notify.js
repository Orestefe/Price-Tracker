const notifier = require('node-notifier');
const nodemailer = require('nodemailer');

let email, password;

if (process.env.EMAIL_ADDRESS && process.env.EMAIL_SECRET) {
    email = process.env.EMAIL_ADDRESS;
    password = process.env.EMAIL_SECRET;
} else {
    const secrets = require('../../data/secrets.json');
    email = secrets.email;
    password = secrets.appPassword;
}

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
            user: email,
            pass: password
        }
    });

    await transporter.sendMail({
        from: `"Price Tracker" <${email}>`,
        to: email,
        subject,
        text: message
    });
}

module.exports = { notifyDesktop, notifyEmail };