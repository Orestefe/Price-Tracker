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

const WATCHLIST_PATH = './watchlist.json';
const HISTORY_PATH = './price-history.json';

let watchlist = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf-8'));
let history = fs.existsSync(HISTORY_PATH)
    ? JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'))
    : {};

const MAX_CONCURRENT_TABS = 3;

async function pickSelector(page) {
    const selector = await page.evaluate(() => {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.pointerEvents = 'none';
            overlay.style.border = '2px solid red';
            overlay.style.zIndex = 9999999;
            document.body.appendChild(overlay);

            let lastElem = null;

            function updateOverlay(el) {
                if (!el) {
                    overlay.style.width = '0px';
                    overlay.style.height = '0px';
                    return;
                }
                const rect = el.getBoundingClientRect();
                overlay.style.top = rect.top + 'px';
                overlay.style.left = rect.left + 'px';
                overlay.style.width = rect.width + 'px';
                overlay.style.height = rect.height + 'px';
            }

            function getUniqueSelector(el) {
                if (el.id) return `#${el.id}`;
                if (el === document.body) return 'body';

                let path = [];
                while (el && el.nodeType === 1 && el !== document.body) {
                    let selector = el.nodeName.toLowerCase();
                    if (el.className) {
                        const classes = el.className.trim().split(/\s+/).join('.');
                        selector += `.${classes}`;
                    }

                    const siblings = Array.from(el.parentNode.children).filter(sib => sib.nodeName === el.nodeName);
                    if (siblings.length > 1) {
                        const index = siblings.indexOf(el) + 1;
                        selector += `:nth-of-type(${index})`;
                    }

                    path.unshift(selector);
                    el = el.parentNode;
                }
                return path.join(' > ');
            }

            function onMouseMove(e) {
                if (lastElem !== e.target) {
                    lastElem = e.target;
                    updateOverlay(lastElem);
                }
            }

            function onClick(e) {
                e.preventDefault();
                e.stopPropagation();

                const selector = getUniqueSelector(e.target);
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('click', onClick);
                overlay.remove();

                resolve(selector);
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('click', onClick);

            alert('Click the price element you want to track.');
        });
    });
    return selector;
}

async function ensureSelectors(browser) {
    let updated = false;

    for (const item of watchlist) {
        if (!item.priceSelector) {
            logWarning(`No selector found for "${item.name}". Opening page for selection...`);

            const page = await browser.newPage();

            await page.goto(item.url, { waitUntil: 'networkidle2' });

            const selector = await pickSelector(page);
            if (selector) {
                item.priceSelector = selector;
                updated = true;
                logSuccess(`Selector for "${item.name}" saved: ${selector}`);
            } else {
                logError(`Selector for "${item.name}" not selected. Skipping.`);
            }

            await page.close();
        }
    }

    if (updated) {
        fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(watchlist, null, 2));
        logSuccess(`Updated ${WATCHLIST_PATH} with new selectors.`);
    }
}

async function checkPrice(item, browser) {
    const page = await browser.newPage();

    try {
        stopSpinner();
        logInfo(`Checking: ${colorText(item.name, 'cyan')}`);
        await page.goto(item.url, { timeout: 5000, waitUntil: 'domcontentloaded' });
        await page.waitForSelector(item.priceSelector, { timeout: 15000 });
        await new Promise(r => setTimeout(r, 5000));

        const text = await page.$eval(item.priceSelector, el => el.innerText);
        logInfo(`Text: ${text}`);
        const priceMatch = text.match(/\$\d{1,3}(,\d{3})*(\.\d{2})?/);
        logInfo(`priceMatch: ${priceMatch}`);

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
    await ensureSelectors(browser);

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

    logBold('\n--- Summary ---')
    results.forEach(r => {
        logInfo(`${r.item}: $${r.price}`)
    });
    stopSpinner();
})();
