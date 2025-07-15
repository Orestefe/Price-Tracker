const notifier = require('node-notifier');
const nodemailer = require('nodemailer');
let email, password;

if (process.env.EMAIL_ADDRESS && process.env.EMAIL_APP_PASSWORD) {
    email = process.env.EMAIL_ADDRESS;
    password = process.env.EMAIL_APP_PASSWORD;
} else {
    const secrets = require('./secrets.json');
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
        from: `"Price Tracker" <${secrets.gmail.user}>`,
        to: secrets.gmail.user,
        subject,
        text: message
    });
}

module.exports = { notifyDesktop, notifyEmail };