const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { notifyDesktop, notifyEmail } = require('./notify');

const WATCHLIST_PATH = './watchlist.json';
const HISTORY_PATH = './price-history.json';


function logPrice(name, price) {
    const logPath = path.resolve(__dirname, 'price-log.csv');
    const timestamp = new Date().toISOString();
    const line = `${timestamp},"${name}",${price}\n`;

    if (!fs.existsSync(logPath)) {
        fs.writeFileSync(logPath, 'timestamp,name,price\n');
    }

    fs.appendFileSync(logPath, line);
}

(async () => {
    const watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH));
    const history = fs.existsSync(HISTORY_PATH)
        ? JSON.parse(fs.readFileSync(HISTORY_PATH))
        : {};

    const browser = await puppeteer.launch({
        headless: false,
        slowMo: 100  // optional: slows down actions for visibility
    });
    const page = await browser.newPage();

    for (const item of watchlist) {
        console.log(`Checking: ${item.name}`);
        await page.goto(item.url, { waitUntil: 'networkidle0' });

        await page.waitForSelector(item.selector, { timeout: 10000 }); // Wait up to 10s for price element
        await new Promise(r => setTimeout(r, 2000)); // Then wait 2 more seconds for price to populate

        let price;
        try {
            const el = await page.$(item.selector);
            if (!el) {
                console.log(`❌ Selector not found: ${item.selector} for "${item.name}"`);
                continue;
            }

            const text = await page.evaluate(el => el.innerText, el);
            console.log(`🔎 Found element text for "${item.name}": ${text}`);

            const priceMatch = text.match(/\$\d{1,3}(,\d{3})*(\.\d{2})?/);
            if (!priceMatch) {
                console.log(`⚠️ No price match found in element text.`);
                continue;
            }

            price = parseFloat(priceMatch[0].replace(/[^\d.]/g, ''));
            console.log(`💰 Extracted price: $${price}`);
        } catch (err) {
            console.log(`⚠️ Error scraping "${item.name}": ${err.message}`);
            continue;
        }

        if (price === null) {
            console.log(`❌ Could not find price for "${item.name}"`);
            continue;
        }

        console.log(`💰 ${item.name}: $${price}`);
        logPrice(item.name, price);

        const prev = history[item.name];
        const shouldNotify =
            price < item.maxPrice &&
            (prev === undefined || price < prev);

        if (shouldNotify) {
            const message = `${item.name} is now $${price} (was ${prev ?? 'unknown'})`;
            notifyDesktop('Price Drop Alert!', message);
            await notifyEmail('Price Dropped!', message);
            history[item.name] = price;
        }
    }

    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    await browser.close();
})();