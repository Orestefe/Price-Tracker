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
} = require('./logging');

const { ensureSelectors } = require('./selectors');

const WATCHLIST_PATH = './watchlist.json';
const HISTORY_PATH = './price-history.json';

const MAX_CONCURRENT_TABS = 5;
const DELAY_AFTER_LOAD_MS = 5000;

let watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf-8'));
let history = fs.existsSync(HISTORY_PATH)
    ? JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'))
    : {};

function parsePrice(text) {
    const match = text.match(/\$\d{1,3}(,\d{3})*(\.\d{2})?/);
    if (!match) throw new Error('Price pattern not found');
    return parseFloat(match[0].replace(/[^\d.]/g, ''));
}

function compareAndLogPrice(item, price) {
    const prevPrice = history[item.name];
    history[item.name] = price;

    if (price < item.maxPrice && (prevPrice === undefined || price < prevPrice)) {
        const msg = `${item.name} price dropped to $${price} (was ${prevPrice ?? 'unknown'})`;
        notifyDesktop('Price Drop Alert!', msg);
        notifyEmail('Price Drop Alert!', msg);
        logSuccess(`${item.name}: $${price} (Notified)`);
        return true;
    }

    if (prevPrice === undefined) {
        logPrice(item.name, price, '(First time seen)');
    } else if (price > prevPrice) {
        logWarning(item.name, price, `(Increased from $${prevPrice})`);
    } else if (price === prevPrice) {
        logPrice(item.name, price, `(No change)`);
    } else {
        logPrice(item.name, price, `(Dropped, but not below threshold $${item.maxPrice})`);
    }

    return false;
}

async function checkPrice(item, browser) {
    const page = await browser.newPage();

    try {
        logInfo(`Checking: ${colorText(item.name, 'cyan')} `);
        await page.goto(item.url, { timeout: 60000, waitUntil: 'domcontentloaded' });
        await page.waitForSelector(item.priceSelector, { timeout: 15000 });
        await new Promise(r => setTimeout(r, DELAY_AFTER_LOAD_MS));

        const text = await page.$eval(item.priceSelector, el => el.innerText);
        const price = parsePrice(text);

        const notified = compareAndLogPrice(item, price);
        await page.close();
        return { item: item.name, price, notified };
    } catch (err) {
        await page.close();
        logError(`[${item.name}]Error: ${err.message} `);
        return null;
    }
}

(async () => {
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    await ensureSelectors(browser, watchlist);

    const results = [];
    const totalBatches = Math.ceil(watchlist.length / MAX_CONCURRENT_TABS);

    for (let i = 0; i < watchlist.length; i += MAX_CONCURRENT_TABS) {
        const batch = watchlist.slice(i, i + MAX_CONCURRENT_TABS);
        const batchNum = i / MAX_CONCURRENT_TABS + 1;
        logInfo(`\n--- Batch ${batchNum}/${totalBatches} ---`);
        const batchResults = await Promise.all(batch.map(item => checkPrice(item, browser)));
        results.push(...batchResults.filter(Boolean));
    }

    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    await browser.close();

    logBold('\n--- Summary ---');
    results.forEach(r => {
        const status = r.notified ? '📣 Notified' : '↔️ No alert';
        logInfo(`${r.item}: $${r.price} (${status})`);
    });
    logSuccess('End of script');
})();