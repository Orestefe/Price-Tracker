const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');

const { ensureSelectors } = require('./utils/selectors');
const { notifyDesktop, notifyEmail } = require('./utils/notify');
const {
    colorText,
    logInfo,
    logSuccess,
    logError,
    logBold,
    logPrice
} = require('./utils/logging');

// === CONFIGURATION ===
const WATCHLIST_PATH = path.resolve(__dirname, '../data/watchlist.json');
const HISTORY_PATH = path.resolve(__dirname, '../data/price-history.json');
const MAX_CONCURRENT_TABS = 5;
const DELAY_AFTER_LOAD_MS = 5000;

// === LOAD FILES ===
const watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf-8'));
let history = fs.existsSync(HISTORY_PATH)
    ? JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'))
    : {};

// === HELPERS ===
function parsePrice(text) {
    const match = text.match(/\$\d{1,3}(,\d{3})*(\.\d{2})?/);
    if (!match) throw new Error('Price pattern not found');
    return parseFloat(match[0].replace(/[^\d.]/g, ''));
}

function compareAndLogPrice(item, price) {
    const timestamp = new Date().toISOString();

    if (!history[item.name]) history[item.name] = [];
    history[item.name].push({ timestamp, price });
    const prevEntry = history[item.name].length > 1
        ? history[item.name][history[item.name].length - 2]
        : null;
    const prevPrice = prevEntry?.price;

    if (price < item.maxPrice && (prevPrice === undefined || price < prevPrice)) {
        const msg = `${item.name} price dropped to $${price} (was previously ${prevPrice ?? 'unknown'})`;
        notifyDesktop(`Price Drop Alert! - ${item.name}`, msg);
        notifyEmail(`Price Drop Alert! - ${item.name}`, msg);
        logSuccess(`${msg} (Notified)`);
        return true;
    }

    if (prevPrice === undefined) {
        logPrice(item.name, price, "(First time seen)");
    } else if (price > prevPrice) {
        logPrice(item.name, price, `(Increased from $${prevPrice})`);
    } else if (price === prevPrice) {
        logPrice(item.name, price, "(No change)");
    } else {
        logPrice(item.name, price, `(Dropped, but not below threshold $${item.maxPrice})`);
    }

    return false;
}

async function checkPrice(item, browser) {
    const page = await browser.newPage();
    try {
        logInfo(`Checking: ${colorText(item.name, 'cyan')}`);
        await page.goto(item.url, { timeout: 60000, waitUntil: 'domcontentloaded' });
        await page.waitForSelector(item.priceSelector, { timeout: 15000 });
        await new Promise(r => setTimeout(r, DELAY_AFTER_LOAD_MS));

        const text = await page.$eval(item.priceSelector, el => el.innerText);
        const price = parsePrice(text);
        const notified = compareAndLogPrice(item, price);
        return { item: item.name, price, notified };
    } catch (err) {
        logError(`[${item.name}] Error: ${err.message}`);
        await page.screenshot({ path: `errors/${item.name.replace(/[^a-z0-9]/gi, '_')}.png` });
    } finally {
        await page.close();
    }

}

// === MAIN ===
(async () => {
    const isCI = process.env.CI === 'true';
    const allSelectorsPresent = watchlist.every(item => !!item.priceSelector && item.priceSelector !== "");

    const browser = await puppeteer.launch({
        headless: allSelectorsPresent ? 'new' : false,
        defaultViewport: null,
        args: isCI ? ['--no-sandbox', '--disable-setuid-sandbox'] : []
    });

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