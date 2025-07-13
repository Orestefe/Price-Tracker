const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
};

function colorText(text, color) {
    return colors[color] + text + colors.reset;
}

function logInfo(text) {
    console.log(`${colorText('[INFO]', 'cyan')} ${text}\n`);
}

function logSuccess(text) {
    console.log(`${colorText('[SUCCESS]', 'green')} ${text}\n`);
}

function logWarning(text) {
    console.log(`${colorText('[WARN]', 'yellow')} ${text}\n`);
}

function logError(text) {
    console.error(`${colorText('[ERROR]', 'red')} ${text}\n`);
}

function logBold(text) {
    console.log(colors.bright + text + colors.reset);
}

function logPrice(name, price, text) {
    const timestamp = new Date().toLocaleString();
    console.log(`${colorText(`@${timestamp} [PRICE]`, 'cyan')} ${name}: $${price} ${text}`);
}

module.exports = {
    colorText,
    logInfo,
    logSuccess,
    logWarning,
    logError,
    logPrice,
    logBold,
};
