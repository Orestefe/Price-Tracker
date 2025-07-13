const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { notifyDesktop, notifyEmail } = require('./notify');

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
    const watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH));
    const history = fs.existsSync(HISTORY_PATH)
        ? JSON.parse(fs.readFileSync(HISTORY_PATH))
        : {};

    const browser = await puppeteer.launch({ headless: false });

    async function checkPrice(item) {
        const page = await browser.newPage();

        try {
            await page.goto(item.url, { waitUntil: 'networkidle0' });
            await page.waitForSelector(item.selector, { timeout: 15000 });
            await new Promise(r => setTimeout(r, 2000));

            const text = await page.$eval(item.selector, el => el.innerText);
            const priceMatch = text.match(/\$\d{1,3}(,\d{3})*(\.\d{2})?/);

            if (!priceMatch) {
                throw new Error('Price pattern not found');
            }

            const price = parseFloat(priceMatch[0].replace(/[^\d.]/g, ''));

            console.log(`[${item.name}] Price found: $${price}`);

            logPrice(item.name, price);

            const prevPrice = history[item.name];
            const shouldNotify =
                price < item.maxPrice && (prevPrice === undefined || price < prevPrice);

            if (shouldNotify) {
                const msg = `${item.name} price dropped to $${price} (was ${prevPrice ?? 'unknown'})`;
                notifyDesktop('Price Drop Alert!', msg);
                await notifyEmail('Price Drop Alert!', msg);
                history[item.name] = price;
            } else {
                // Update history to current price even if no notification (optional)
                if (prevPrice === undefined) history[item.name] = price;
            }

            await page.close();

            return { item: item.name, price, notified: shouldNotify };
        } catch (err) {
            console.error(`[${item.name}] Error: ${err.message}`);
            await page.close();
            return null;
        }
    }

    // Process watchlist in batches
    const results = [];
    for (let i = 0; i < watchlist.length; i += MAX_CONCURRENT_TABS) {
        const batch = watchlist.slice(i, i + MAX_CONCURRENT_TABS);
        const batchResults = await Promise.all(batch.map(checkPrice));
        results.push(...batchResults.filter(Boolean));
    }

    fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
    await browser.close();

    // Summary log
    console.log('--- Price check complete ---');
    results.forEach(r =>
        console.log(
            `${r.item}: $${r.price} ${r.notified ? '(Notified)' : '(No change)'}`
        )
    );
})();
