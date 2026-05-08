# Anti-Patterns — Trawl Scrap Scripts

These patterns are forbidden in Trawl scrap scripts. Each has a rationale and a public source citation.

---

### No in-script stealth libraries

`puppeteer-extra-plugin-stealth` was designed for an older Chrome fingerprinting landscape and is widely considered legacy. Newer approaches operate at the CDP launch layer, not inside the page script. Either way, adding any stealth plugin in your script duplicates what Trawl's worker already does centrally, and it will drift as soon as the worker's policy evolves — your hardcoded plugin version stays frozen.

If you need stronger fingerprinting, use a higher proxy tier (see *Trawl Scraping Advanced docs*). Do not patch it in-script.

Source: [scrapfly.io/blog/posts/puppeteer-stealth-complete-guide](https://scrapfly.io/blog/posts/puppeteer-stealth-complete-guide)

---

### No User-Agent spoofing

`page.setUserAgent(...)` is ineffective against modern bot detection. Detection systems cross-reference UA strings with Client Hints (`Sec-CH-UA-*`), WebGL renderer, canvas fingerprint, and audio fingerprint. Spoofing the UA string alone produces an inconsistent signal that is easier to flag, not harder. It also conflicts with the worker's UA policy.

Source: [browser-use.com/posts/bot-detection](https://browser-use.com/posts/bot-detection)

---

### No random jitter as primary defence

Modern bot detection makes its decision at the fingerprint level — in milliseconds, before any human-timing signal exists in the session. A `Math.random() * 500` delay between page actions has no effect on that decision.

Small randomised inter-action delays (200–800ms) are acceptable for **rate-limit politeness** when a target page is sensitive to burst requests — that is a different concern. Use them sparingly for that purpose only, never as an anti-bot mechanism.

Source: [browser-use.com/posts/bot-detection](https://browser-use.com/posts/bot-detection)

---

### No fixed setTimeout / waitForTimeout

`page.waitForTimeout(N)` was deprecated and removed from the Puppeteer API. `setTimeout` works but is unreliable: it passes on fast machines and fails on slow ones or under load. Fixed delays also slow every run unconditionally.

Always use state-based waits:
- `page.waitForSelector(selector)` — most targeted
- `page.waitForNetworkIdle()` — for SPA-heavy pages
- `page.waitForFunction(fn)` — for complex DOM conditions
- `page.waitForResponse(urlMatcher)` — for API-driven state changes

Sources:
- [pptr.dev/api/puppeteer.page.waitfornetworkidle](https://pptr.dev/api/puppeteer.page.waitfornetworkidle)
- [dev.to/checkly/avoiding-hard-waits-in-playwright-and-puppeteer-272](https://dev.to/checkly/avoiding-hard-waits-in-playwright-and-puppeteer-272)

---

### No deep CSS chains

Selectors like `div > div:nth-child(2) > div > span.price` are fragile — a minor layout refactor breaks them silently. They also give Trawl's AI Fix no semantic context when trying to pick a replacement.

Anchor on semantic attributes in this priority order:
1. `data-*` — stable by engineering convention
2. `aria-*` / `role` — semantically meaningful
3. Short, stable class name (not generated hash)
4. XPath with text anchor — when nothing else works

Document *why* the selector was chosen in a comment. That comment is what AI Fix uses to search for an equivalent.

Source: [rebrowser.net/blog/xpath-vs-css-selectors-a-comprehensive-guide-for-web-automation-and-testing](https://rebrowser.net/blog/xpath-vs-css-selectors-a-comprehensive-guide-for-web-automation-and-testing)

---

### No silent catch on data writes

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

Silent catches hide selector breakage from AI Fix and from your run history. Explicit nulls in `returnData` are surfaced in Trawl's Data Quality view; hidden undefined values are not.

---

## Sources

- https://pptr.dev/api/puppeteer.page.waitfornetworkidle
- https://dev.to/checkly/avoiding-hard-waits-in-playwright-and-puppeteer-272
- https://rebrowser.net/blog/xpath-vs-css-selectors-a-comprehensive-guide-for-web-automation-and-testing
- https://browser-use.com/posts/bot-detection
- https://scrapfly.io/blog/posts/puppeteer-stealth-complete-guide
