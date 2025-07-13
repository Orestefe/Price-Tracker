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
    logPrice,
    startSpinner,
    stopSpinner,
} = require('./logging');

const { ensureSelectors } = require('./selectors');

const WATCHLIST_PATH = './watchlist.json';
const HISTORY_PATH = './price-history.json';

let watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf-8'));
let history = fs.existsSync(HISTORY_PATH)
    ? JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'))
    : {};

const MAX_CONCURRENT_TABS = 3;

async function checkPrice(item, browser) {
    const page = await browser.newPage();

    try {
        stopSpinner();
        logInfo(`Checking: ${colorText(item.name, 'cyan')}`);
        await page.goto(item.url, { timeout: 60000, waitUntil: 'domcontentloaded' });
        await page.waitForSelector(item.priceSelector, { timeout: 15000 });
        await new Promise(r => setTimeout(r, 5000));

        const text = await page.$eval(item.priceSelector, el => el.innerText);
        const priceMatch = text.match(/\$\d{1,3}(,\d{3})*(\.\d{2})?/);

        if (!priceMatch) throw new Error('Price pattern not found');

        const price = parseFloat(priceMatch[0].replace(/[^\d.]/g, ''));
        logPrice(item.name, price);

        const prevPrice = history[item.name];
        const shouldNotify = price < item.maxPrice && (prevPrice === undefined || price < prevPrice);

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
        return null;
    }
}

(async () => {
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    await ensureSelectors(browser, watchlist);

    const results = [];
    for (let i = 0; i < watchlist.length; i += MAX_CONCURRENT_TABS) {
        const batch = watchlist.slice(i, i + MAX_CONCURRENT_TABS);
        stopSpinner();
        logInfo(
            `Checking batch ${i / MAX_CONCURRENT_TABS + 1} of ${Math.ceil(
                watchlist.length / MAX_CONCURRENT_TABS
            )}`
        );
        startSpinner('Checking prices \n');
        const batchResults = await Promise.all(batch.map(item => checkPrice(item, browser)));
        results.push(...batchResults.filter(Boolean));
    }

    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    await browser.close();

    logBold('\n--- Summary ---');
    results.forEach(r => {
        logInfo(`${r.item}: $${r.price}`);
    });
    stopSpinner();
})();
