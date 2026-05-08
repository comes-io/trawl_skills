# Interaction Patterns — Trawl Scrap Scripts

> *These patterns are about correctness — making the page reveal the data it functionally hides behind interaction. They are NOT anti-bot stealth. The worker handles bot detection; you handle the page's real interaction surface.*

---

### Scroll to trigger lazy-load

Use `window.scrollBy` in a loop; wait for new content, stop when the item count stabilises.

```js
let prev = 0;
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => window.scrollBy(0, window.innerHeight));
  try {
    await page.waitForFunction(
      (p) => document.querySelectorAll('article').length > p,
      { timeout: 3000 },
      prev,
    );
  } catch {
    break; // no new items loaded within timeout — list exhausted
  }
  prev = await page.$$eval('article', (els) => els.length);
}
```

Stop when item count is unchanged after a scroll, or a "end of results" sentinel appears.

---

### Hover to reveal

Content only rendered on `mouseenter` — read the value after the hover, not before.

```js
const HOVER_TARGET = '[data-testid="price-trigger"]';
const REVEALED_PRICE = '[data-testid="price-tooltip"]';

await page.hover(HOVER_TARGET);
await page.waitForSelector(REVEALED_PRICE, { timeout: 5000 });
const price = await page.$eval(REVEALED_PRICE, (el) => el.textContent.trim());
```

---

### Click to expand (FAQ, accordions, "show more")

Click each trigger, wait for the expanded region, then read its content.

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

### Form fill via page.type()

`page.type` fires `keydown`/`keypress`/`keyup` per character. Some sites reject paste-style instant assignment (`el.value = ...`).

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

After a click that triggers an XHR, prefer `waitForResponse` or `waitForNetworkIdle` over a fixed delay.

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

Click "next", wait for the first item to change. Track items across pages to detect stale pagination (same items returned).

```js
const allItems = [];
let pageNum = 1;

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
  pageNum++;
  if (pageNum > 20) break; // safety cap
}

returnData(allItems);
```
