const fs = require('fs');
const puppeteer = require('puppeteer');
const { notifyDesktop, notifyEmail } = require('./notify');
const {
    colorText,
    logInfo,
    logSuccess,
    logWarning,
    logError,
    logBold,
    startSpinner,
    stopSpinner,
} = require('./logging');

const WATCHLIST_PATH = './watchlist.json';
const HISTORY_PATH = './price-history.json';
const LOG_PATH = './price-log.csv';
const MAX_CONCURRENT_TABS = 5;

function logPrice(name, price) {
    const timestamp = new Date().toISOString();
    const header = 'timestamp,name,price\n';
    const line = `${timestamp},"${name}",${price}\n`;

    if (!fs.existsSync(LOG_PATH)) {
        fs.writeFileSync(LOG_PATH, header);
    }

    fs.appendFileSync(LOG_PATH, line);
}

(async () => {
    // Load config
    if (!fs.existsSync(WATCHLIST_PATH)) {
        logError(`Watchlist file not found: ${WATCHLIST_PATH}`);
        process.exit(1);
    }

    const watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH));
    const history = fs.existsSync(HISTORY_PATH)
        ? JSON.parse(fs.readFileSync(HISTORY_PATH))
        : {};

    const browser = await puppeteer.launch({ headless: false });

    async function checkPrice(item) {
        const page = await browser.newPage();

        try {
            stopSpinner();
            logInfo(`Checking: ${colorText(item.name, 'cyan')}`);

            await page.goto(item.url, { waitUntil: 'networkidle0' });
            await page.waitForSelector(item.selector, { timeout: 15000 });
            await new Promise(r => setTimeout(r, 5000));

            const text = await page.$eval(item.selector, el => el.innerText);
            const priceMatch = text.match(/\$\d{1,3}(,\d{3})*(\.\d{2})?/);

            if (!priceMatch) {
                throw new Error('Price pattern not found');
            }

            const price = parseFloat(priceMatch[0].replace(/[^\d.]/g, ''));

            logPrice(item.name, price);

            const prevPrice = history[item.name];
            const shouldNotify =
                price < item.maxPrice && (prevPrice === undefined || price < prevPrice);

            if (shouldNotify) {
                const msg = `${item.name} price dropped to $${price} (was ${prevPrice ?? 'unknown'})`;
                notifyDesktop('Price Drop Alert!', msg);
                await notifyEmail('Price Drop Alert!', msg);
                history[item.name] = price;
                logSuccess(`${item.name}: $${price} (Notified)`);
            } else {
                if (prevPrice === undefined) history[item.name] = price;
                logWarning(`${item.name}: $${price} (No change)`);
            }

            await page.close();
            startSpinner('Checking prices \n');
            return { item: item.name, price, notified: shouldNotify };
        } catch (err) {
            await page.close();
            stopSpinner();
            logError(`[${item.name}] Error: ${err.message}`);
            startSpinner('Checking prices \n');
            return null;
        }
    }

    // Process in batches
    startSpinner('Starting price checks \n');
    const results = [];
    const errors = [];

    for (let i = 0; i < watchlist.length; i += MAX_CONCURRENT_TABS) {
        const batch = watchlist.slice(i, i + MAX_CONCURRENT_TABS);

        stopSpinner();
        logInfo(
            `Checking batch ${i / MAX_CONCURRENT_TABS + 1} of ${Math.ceil(
                watchlist.length / MAX_CONCURRENT_TABS
            )}`
        );
        startSpinner('Checking prices ');

        const batchResults = await Promise.all(batch.map(checkPrice));
        batchResults.forEach(result => {
            if (result) {
                results.push(result);
            } else {
                // If checkPrice returned null, item failed
                const failedItem = batch[batchResults.indexOf(result)];
                errors.push(failedItem?.name || 'Unknown');
            }
        });
    }
    stopSpinner();

    if (results.length === 0) {
        logError('All price checks failed.');
        await browser.close();
        process.exit(1);
    }

    logSuccess(`Price checks completed. ${results.length} succeeded, ${errors.length} failed.`);

    if (errors.length > 0) {
        logWarning('The following items failed:');
        errors.forEach(name => console.log(` - ${colorText(name, 'red')}`));
    }

    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    await browser.close();

    logBold('\n--- Summary ---');
    results.forEach(r => {
        const status = r.notified
            ? colorText('Notified', 'green')
            : colorText('No change', 'yellow');
        console.log(`${colorText(r.item, 'cyan')}: $${r.price} (${status})`);
    });
})();
