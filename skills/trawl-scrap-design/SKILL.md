---
name: trawl-scrap-design
description: Use when writing or fixing a Puppeteer script that runs on a Trawl worker — selector resilience, returnData shape, params handling, validation, and what NOT to do (no in-script stealth, no fixed delays, no UA spoofing). Triggers on "create a scrap that...", "fix my scrap", "why does my scrap return 0 items", "scrape <site>", or any prompt about the body of a Trawl scrap script. Does NOT cover CLI commands (see trawl-cli), authentication flows (see trawl-scrap-account), or local test runs (see trawl-scrap-local-test).
---

# Trawl Scrap Design

Use when writing the Puppeteer script body that runs on a Trawl worker.

## The worker boundary

The worker handles fingerprinting, proxy escalation, AI Fix, and schema validation. Your script handles selectors, returnData shape, params, and graceful failure. See `references/anti-patterns.md`.

> **Don't add stealth in your script.** Trawl's worker handles fingerprinting, proxy rotation, and bot-detection countermeasures centrally. Adding stealth plugins, UA spoofing, viewport randomisation, or aggressive jitter in your script duplicates worker policy and causes drift. The worker's policy evolves; your script's hardcoded tricks won't.

## Selectors

Selector priority (most to least resilient):

1. `data-*` attribute — stable across visual redesigns
2. `aria-*` / `role` — semantically meaningful
3. Stable class (short, non-generated, meaningful name)
4. XPath with text anchor — use when no attribute is reliable

**One named selector per logical field.** Declare as constants at the top with a comment explaining the choice — AI Fix uses that context to pick a replacement when the selector breaks.

```js
// data-testid is stable — the engineering team committed to never removing it
const PRICE_SEL = '[data-testid="product-price"]';
// Aria role used because the class name is generated (hash suffix)
const ADD_TO_CART_SEL = '[role="button"][aria-label="Add to cart"]';

const price = await page.$eval(PRICE_SEL, (el) => el.textContent.trim());
```

## Waits

- **`page.waitForSelector(selector)`** — most targeted; use as the default.
- **`page.waitForNetworkIdle()`** — for SPA-heavy pages where DOM updates trail XHR completion.
- **`page.waitForFunction(fn)`** — for state conditions that don't map to a single selector (e.g. item count growing).
- **`page.waitForResponse(urlMatcher)`** — to gate on a specific API call completing.

**Never use `page.waitForTimeout(N)`** — it is deprecated, flaky, and slow. Always use state-based waits.

```js
// Good: state-based wait
await page.waitForSelector('[data-testid="results-loaded"]');

// Bad: fixed delay — never do this
// await page.waitForTimeout(3000);
```

## returnData shape

Return a flat JSON array. Each item is a plain object.

- Explicit `null` for optional fields that are absent — do not omit the key.
- Numbers as numbers, not strings — parse before returning.
- Dates as ISO-8601 UTC — `new Date(...).toISOString()`.

See `references/returndata-shapes.md` for full rules and examples.

```js
returnData([
  {
    title: 'Widget Pro',
    price: 29.99,           // number, not "€29.99"
    currency: 'EUR',
    published_at: new Date('2024-03-15').toISOString(), // ISO-8601 UTC
    discount_pct: null,     // explicit null, not omitted
  },
]);
```

## Params

- **`TRAWL.url`** — the target URL, set by the scrap schedule. Treat as immutable; never override it.
- **`TRAWL.<custom>`** — any custom parameter defined in Settings → Parameters.
- **`RANDOM(...)`** — a helper that returns a random value from a list (see Trawl params docs).
- **`DATE(±N, unit, format)`** — a date helper that returns a formatted date offset from now.

Validate inputs early — throw before any network call if a required param is missing.

```js
const { url, category } = TRAWL;
if (!category) throw new Error('Missing required param: category (set in Settings → Parameters)');

await page.goto(url, { waitUntil: 'domcontentloaded' });
```

## Resilience

Wrap each logical field in its own `try/catch` and return what you have. Throw only for structural failures that make the entire run meaningless.

```js
let price = null;
try {
  price = parseFloat(await page.$eval(PRICE_SEL, (el) => el.textContent.replace(/[^0-9.]/g, '')));
} catch (err) {
  console.error('price extraction failed:', err.message);
  // continue — return partial data with price: null
}

// Structural failure: the page never loaded — throw so the worker retries / escalates
const bodyText = await page.$eval('body', (el) => el.textContent);
if (bodyText.includes('Access Denied')) throw new Error('Access denied — escalate proxy tier');
```

**Throw only for:**
- Auth missing (session cookie expired, login redirect)
- Page never loaded or returned a fatal error
- Required param missing

## Anti-patterns (don't do this)

Full detail in `references/anti-patterns.md`. Summary:

- No `puppeteer-extra-plugin-stealth` or any stealth plugin in your script.
- No `setUserAgent(...)` — conflicts with worker UA policy.
- No `waitForTimeout(N)` — deprecated and flaky.
- No deep CSS chains (`div > div > div > span`) — break on every redesign.
- No random jitter as anti-bot defence — detection happens at fingerprint level before timing matters.
- No silent `.catch(() => {})` around data extraction.

## Interaction patterns (when the page needs them)

Some pages hide data behind real UI interactions — scroll, hover, click, form fill. These are about **functional correctness**, not bot evasion. See `references/interaction-patterns.md` for patterns: lazy-load scroll, hover-to-reveal, click-to-expand, `page.type` form fill, state-transition waits, "next" pagination.

## Canonical Trawl docs

- *Trawl Scraping docs (in-app help center)* — selector basics, `returnData`, scrap lifecycle.
- *Trawl Scraping Advanced docs* — proxy tiers, escalation triggers, rate-limit guidance.
- *Trawl Data Quality docs* — `checkSchema` usage; note that `validation_failed` is a distinct history status from `error` and `0 items`.
- *Trawl AI Features docs* — AI Fix quotas, how selector comments improve AI Fix accuracy.
- *Trawl Schedule + Parameters docs* — `TRAWL.<custom>` params, `RANDOM(...)` and `DATE(...)` helpers.

## What this skill does NOT cover

- CLI commands → `trawl-cli`
- Authentication flows → `trawl-scrap-account`
- Local test runs → `trawl-scrap-local-test`
