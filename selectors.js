const fs = require('fs');
const { logWarning, logSuccess, logError } = require('./logging');

const WATCHLIST_PATH = './watchlist.json';

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

        console.log('Selected element:', e.target);
        console.log('Computed selector:', selector);
        console.log('Outer HTML snippet:', e.target.outerHTML.slice(0, 200));

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

async function ensureSelectors(browser, watchlist) {
  let updated = false;

  for (const item of watchlist) {
    if (!item.priceSelector) {
      logWarning(`No selector found for "${item.name}". Opening page for selection...`);

      const page = await browser.newPage();

      page.on('console', msg => {
        if (msg.type() === 'log' || msg.type() === 'error') {
          console.log(`BROWSER LOG: ${msg.text()}`);
        }
      });

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

module.exports = {
  pickSelector,
  ensureSelectors,
};
