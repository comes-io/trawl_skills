---
name: trawl-scrap-design
description: Use when writing or fixing the Puppeteer script body for a Trawl scrap. Triggers on "create a scrap that...", "fix my scrap", "why does my scrap return 0 items", "scrape <site>", or any prompt about what to put inside the script. Does NOT cover CLI commands (see trawl-cli), authentication flows (see trawl-scrap-account), or local test runs (see trawl-scrap-local-test).
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

**One named selector per logical field.** Declare as constants at the top with a comment explaining the choice — AI Fix uses that context to pick a replacement when the selector breaks. AI Fix is toggled per-scrap with `trawl scraps update <id> --autofix` / `--no-autofix`; inspect what it actually did with `trawl scraps doctor <id> --autofix` (last-run diagnosis + autofix outcome) or `trawl scraps autofix <id>` (decision, diff, dry-run, knowledge) — see the `trawl-cli` skill.

```js
// data-testid is stable — the engineering team committed to never removing it
const PRICE_SEL = '[data-testid="product-price"]';
// Aria role used because the class name is generated (hash suffix)
const ADD_TO_CART_SEL = '[role="button"][aria-label="Add to cart"]';

const price = await page.$eval(PRICE_SEL, (el) => el.textContent.trim());
```

**Avoid obfuscated hash classes** (`css-1a2b3c`, styled-components like `fPSBzf`) — they rotate every deploy. When the only classes are hashes:
- prefer `data-*` / `aria-*` / `role` / semantic tags (`<article>`, `<address>`) / `time[datetime]`
- module-CSS (stable prefix + hash suffix) → match the prefix: `[class*="ListingCard_price"]`
- `aria-label` often encodes the value (`[aria-label*="Current price"]`) — more stable than any class
- **JSON beats DOM**: `window.__NEXT_DATA__` (Next.js SSR) and JSON-LD (`script[type="application/ld+json"]`, schema.org) carry the data pre-render — use as primary, DOM as fallback.

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
- **`TRAWL.<custom>`** — any custom parameter defined in Settings → Parameters (UI), or provisioned via the CLI: `trawl scraps update <id> -p/--params '[{"TRAWL.<name>":"<value>"}]'` (JSON array) or `--params-file <path>` for bulk — see the `trawl-cli` skill.
- **`RANDOM(...)`** — a helper that returns a random value from a list (see Trawl params docs). *Signature not independently re-verified against the worker runtime as part of this pass — treat as provisional.*
- **`DATE(±N, unit, format)`** — a date helper that returns a formatted date offset from now. *Signature not independently re-verified against the worker runtime as part of this pass — treat as provisional.*

Validate inputs early — throw before any network call if a required param is missing.

```js
const { url, category } = TRAWL;
if (!category) throw new Error('Missing required param: category (set in Settings → Parameters, or `trawl scraps update <id> -p \'[{"TRAWL.category":"value"}]\'`)');

await page.goto(url, { waitUntil: 'domcontentloaded' });
```

**URL hygiene**: a page can return HTTP 200 with a soft-404 ("page not found") body — verify *content*, not status. Prefer search/category URLs over guessed deep-link IDs (product/hotel IDs go stale). Pre-wire locale in the URL (`/en/`, `intl=nosplash`, country path) to skip region splashes.

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

// Structural failure: required param missing — throw immediately
// Do NOT sniff for bot-challenge markers ("Access Denied", "Just a moment") — see anti-patterns.md
```

**Throw only for:**
- Auth missing (session cookie expired, login redirect)
- Page never loaded or returned a fatal error
- Required param missing

## Hard anti-bot sites

The platform auto-escalates proxy tiers when a run comes back empty — you usually don't manage tiers at all. For a site you *know* is heavily protected, there are two CLI knobs (see the `trawl-cli` skill for full flag docs):

- `trawl scraps update <id> --tier tier0..tier4` — requests a starting tier so the first run doesn't waste a cycle. **It's clamped to tier3 for domains that aren't allow-listed for tier4** — requesting `tier4` does not error, it just gets capped. On `update` the CLI echoes the clamp (`⚠ proxyTier requested tier4 → applied tier3`); on `create`/older servers it's silent.
- `trawl scraps update <id> --force-tier tier0..tier4` — raises the tier **ceiling** past that auto-cap. History-gated: the server may refuse it (CLI exits `1`) or it may cost more, depending on the scrap's run history.

Don't assume the requested tier was honored — verify with `trawl scraps history <id>` / `trawl scraps run-info <hid>` after a run. Don't try to outsmart protection in your script — return what you can and let the platform escalate.

## Anti-patterns (don't do this)

Full detail in `references/anti-patterns.md`. Summary:

- No `puppeteer-extra-plugin-stealth` or any stealth plugin in your script.
- No `setUserAgent(...)` — conflicts with worker UA policy.
- No `waitForTimeout(N)` — deprecated and flaky.
- No deep CSS chains (`div > div > div > span`) — break on every redesign.
- No random jitter as anti-bot defence — detection happens at fingerprint level before timing matters.
- No bot-challenge detection or vendor-string sniffing (e.g. `if (html.includes('px-captcha'))`) — false-throws on pages that actually loaded. Throw only on structural failures.
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
