# Anti-Patterns — Trawl Scrap Scripts

These patterns are forbidden in Trawl scrap scripts. Each has a rationale and a public source citation.

---

## No in-script stealth libraries

`puppeteer-extra-plugin-stealth` is legacy — newer approaches operate at the CDP launch layer. Adding any stealth plugin duplicates what the worker does centrally and will drift when worker policy evolves. For stronger fingerprinting, use a higher proxy tier (*Trawl Scraping Advanced docs*).

Source: [scrapfly.io/blog/posts/puppeteer-stealth-complete-guide](https://scrapfly.io/blog/posts/puppeteer-stealth-complete-guide)

---

## No User-Agent spoofing

`page.setUserAgent(...)` is ineffective — detection cross-references UA against Client Hints, WebGL, canvas, and audio fingerprints. A spoofed UA string alone is easier to flag, not harder, and conflicts with the worker's UA policy.

Source: [browser-use.com/posts/bot-detection](https://browser-use.com/posts/bot-detection)

---

## No random jitter as primary defence

Bot detection decides at the fingerprint level — milliseconds before any timing signal exists. `Math.random() * 500` delays have no effect. Small jitter (200–800ms) is acceptable for **rate-limit politeness** only, never as an anti-bot mechanism.

Source: [browser-use.com/posts/bot-detection](https://browser-use.com/posts/bot-detection)

---

## No fixed setTimeout / waitForTimeout

`page.waitForTimeout(N)` is deprecated. `setTimeout` is unreliable under load and slows every run unconditionally. Use state-based waits:
- `page.waitForSelector(selector)` — most targeted
- `page.waitForNetworkIdle()` — for SPA-heavy pages
- `page.waitForFunction(fn)` — for complex DOM conditions
- `page.waitForResponse(urlMatcher)` — for API-driven state changes

Sources:
- [pptr.dev/api/puppeteer.page.waitfornetworkidle](https://pptr.dev/api/puppeteer.page.waitfornetworkidle)
- [dev.to/checkly/avoiding-hard-waits-in-playwright-and-puppeteer-272](https://dev.to/checkly/avoiding-hard-waits-in-playwright-and-puppeteer-272)

---

## No deep CSS chains

`div > div:nth-child(2) > div > span.price`-style selectors break on every layout refactor and give AI Fix no semantic context. Anchor on semantic attributes in priority order:
1. `data-*` — stable by engineering convention
2. `aria-*` / `role` — semantically meaningful
3. Short, stable class name (not generated hash)
4. XPath with text anchor — when nothing else works

Document *why* the selector was chosen in a comment — AI Fix uses it to find an equivalent.

Source: [rebrowser.net/blog/xpath-vs-css-selectors-a-comprehensive-guide-for-web-automation-and-testing](https://rebrowser.net/blog/xpath-vs-css-selectors-a-comprehensive-guide-for-web-automation-and-testing)

---

## No silent catch on data writes

Never swallow extraction errors silently:

```js
// Bad — error is hidden, returnData gets undefined or wrong data
const price = await page.$eval(PRICE_SEL, (el) => el.textContent).catch(() => {});

// Good — log the error, return explicit null, let partial data flow
let price = null;
try {
  price = parseFloat(await page.$eval(PRICE_SEL, (el) => el.textContent.replace(/[^0-9.]/g, '')));
} catch (err) {
  console.error('price extraction failed:', err.message);
}
```

Silent catches hide selector breakage from AI Fix. Explicit nulls surface in Trawl's Data Quality view; hidden undefined values do not.

---

## Sources

- https://pptr.dev/api/puppeteer.page.waitfornetworkidle
- https://dev.to/checkly/avoiding-hard-waits-in-playwright-and-puppeteer-272
- https://rebrowser.net/blog/xpath-vs-css-selectors-a-comprehensive-guide-for-web-automation-and-testing
- https://browser-use.com/posts/bot-detection
- https://scrapfly.io/blog/posts/puppeteer-stealth-complete-guide
