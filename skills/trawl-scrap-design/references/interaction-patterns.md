# Interaction Patterns — Trawl Scrap Scripts

> These patterns are about correctness — making the page reveal the data it functionally hides behind interaction. They are NOT anti-bot stealth. The worker handles bot detection; you handle the page's real interaction surface.

---

### Scroll to trigger lazy-load

Infinite-scroll lists and lazy-loaded images require real scroll events to reveal new content. Use `window.scrollBy` in a loop, wait for new content to appear, and stop when the item count stabilises.

```js
let prev = 0;
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => window.scrollBy(0, window.innerHeight));
  await page.waitForFunction((p) => document.querySelectorAll('article').length > p, {}, prev);
  const count = await page.$$eval('article', (els) => els.length);
  if (count === prev) break;
  prev = count;
}
```

Stop conditions: item count unchanged after a scroll, or a sentinel element appears (e.g. "end of results" banner).

---

### Hover to reveal

E-commerce pricing, tooltips, and dropdown menus often render their content only on `mouseenter`. Read the value after the hover, not before.

```js
const HOVER_TARGET = '[data-testid="price-trigger"]';
const REVEALED_PRICE = '[data-testid="price-tooltip"]';

await page.hover(HOVER_TARGET);
await page.waitForSelector(REVEALED_PRICE, { timeout: 5000 });
const price = await page.$eval(REVEALED_PRICE, (el) => el.textContent.trim());
```

---

### Click to expand (FAQ, accordions, "show more")

Iterate over each trigger element, click it, and wait for the expanded region to appear before reading its content.

```js
const TRIGGERS = await page.$$('[data-testid="faq-question"]');
const results = [];
for (const trigger of TRIGGERS) {
  await trigger.click();
  // Wait for the sibling answer panel to become visible
  await page.waitForSelector('[data-testid="faq-answer"]:not([hidden])', { timeout: 3000 });
  const answer = await page.$eval('[data-testid="faq-answer"]:not([hidden])', (el) => el.textContent.trim());
  const question = await trigger.evaluate((el) => el.textContent.trim());
  results.push({ question, answer });
}
```

---

### Form fill with realistic events

Use `page.type(selector, value)` which fires `keydown`/`keypress`/`keyup` per character. Some sites watch for paste-style instant value assignment (`el.value = ...`) and reject the form submission.

```js
// Good: per-keystroke events
await page.type('[name="search"]', 'quarterly report 2024');

// Bad: instant assignment — often rejected by form validation listeners
// await page.evaluate(() => { document.querySelector('[name="search"]').value = 'quarterly report 2024'; });

await page.keyboard.press('Enter');
await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
```

---

### Wait for state transitions between chained actions

After clicking a button that triggers an XHR, prefer `waitForResponse` or `waitForNetworkIdle` over a fixed delay.

```js
// Good: gate on the API response
const [response] = await Promise.all([
  page.waitForResponse((res) => res.url().includes('/api/products') && res.status() === 200),
  page.click('[data-testid="load-more"]'),
]);
const data = await response.json();

// Also acceptable for SPA-heavy pages:
await page.click('[data-testid="tab-reviews"]');
await page.waitForNetworkIdle();
```

---

### Pagination via "next" button

Click the "next" button and wait for the first item of the new page to appear. Track the item set across pages to detect stale pagination (URL did not change, same items returned).

```js
const allItems = [];
let page_num = 1;

while (true) {
  const items = await page.$$eval('[data-testid="result-item"]', (els) =>
    els.map((el) => ({ title: el.querySelector('h2')?.textContent?.trim() ?? null }))
  );
  allItems.push(...items);

  const nextBtn = await page.$('[data-testid="pagination-next"]:not([disabled])');
  if (!nextBtn) break;

  const firstTitle = items[0]?.title;
  await nextBtn.click();
  // Wait for the first item to change — confirms the page actually advanced
  await page.waitForFunction(
    (prev) => document.querySelector('[data-testid="result-item"] h2')?.textContent?.trim() !== prev,
    {},
    firstTitle
  );
  page_num++;
  if (page_num > 20) break; // safety cap
}

returnData(allItems);
```
