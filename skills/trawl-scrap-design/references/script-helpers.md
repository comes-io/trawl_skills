# Script Helpers — Trawl Scrap Scripts

> *Besides `page`, `browser`, `TRAWL` and `returnData`, a script on the worker can call four helpers: `fetch`, `cursor`, `captcha` and `trawl.waitForHydration`. This page lists what each one takes and returns. They exist on the worker only: the local harness (`trawl-scrap-local-test`) does not inject `cursor`, `captcha` or `trawl`, so a script that uses them fails locally with a `ReferenceError`.*

The script runs in a sandbox, not in Node. Only these globals exist at script level: `page`, `browser`, `cursor`, `captcha`, `TRAWL`, `account`, `trawl`, `saveSession`, `returnData`, `fetch`, `console`, the timers (`setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`), `JSON`, `Math`, `Date`, `Array`, `Object`, `String`, `Number`, `Boolean`, `RegExp`, `Map`, `Set`, `Promise`, `Error`, `URL`, `URLSearchParams`, `Buffer`. Anything else (`AbortSignal`, `AbortController`, `Headers`, `FormData`, `TextDecoder`, `require`, `process`) is undefined at script level; it is still there inside `page.evaluate`, which runs in the browser.

---

## `fetch` — a request from the script, not from the page

`fetch(url, options?)` → `Promise<Response>`. The standard `fetch`: same arguments, same `Response` (`res.ok`, `res.status`, `await res.json()`, `await res.text()`).

It runs on the worker, **outside the page**: it does not carry the page's cookies, session or headers, and does not go the way the page's own requests go. So:

- **For the target site, keep using `fetch` inside `page.evaluate`** (see "Run budget" in `SKILL.md`): same origin, same cookies, same session as the page.
- **Use the script-level `fetch` for a public endpoint that needs no page**: a sitemap, a public JSON feed, a file you then parse in the script.

`AbortSignal` does not exist at script level, so bound the wait with `Promise.race`:

```js
// one request, at most 20 s — the request itself is not cancelled, the script just stops waiting
const withTimeout = (p, ms) => Promise.race([
  p,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms)),
]);

let urls = [];
try {
  // bound the headers AND the body read: a server can send headers, then stall
  const xml = await withTimeout(
    fetch('https://example.com/sitemap.xml').then((res) => (res.ok ? res.text() : '')),
    20000,
  );
  urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
} catch (err) {
  console.error('sitemap fetch failed:', err.message);
}
```

---

## `cursor` — a mouse that moves along a path

`cursor` drives the mouse of the main `page` along a curved path instead of jumping to the target. Use it for pages that react to real pointer movement: a menu that opens on hover, a control that ignores `element.click()`. It is bound to the main `page` only; a tab you open with `browser.newPage()` has no cursor. `page.click()` and `page.hover()` do not use it.

Every method returns `Promise<void>`. `target` is a CSS selector, an XPath, or an element handle.

| Method | What it does |
|---|---|
| `cursor.click(target?, options?)` | Moves to `target` (scrolling it into view), then clicks. No `target` = click where the mouse is. Options: `button` (`'left'`), `clickCount` (`1`), `hesitate` (ms before the click), `waitForClick` (ms between press and release), `moveDelay` (pause after the move, random from 0 up to this, default 2000 ms). |
| `cursor.move(target, options?)` | Moves to `target` (hover), scrolling it into view first. Options: `moveDelay`, `moveSpeed`, `paddingPercentage` (how far inside the element to aim). |
| `cursor.moveTo({ x, y }, options?)` | Moves to a point in the viewport. |
| `cursor.scrollIntoView(target, options?)` | Scrolls until `target` is visible; no scroll if it already is. |
| `cursor.scroll({ x?, y? }, options?)` | Scrolls by that many pixels. |
| `cursor.getLocation()` | Returns the current `{ x, y }` (not a promise). |

```js
// open a hover menu, then read the links it reveals
const MENU_SEL = 'nav [aria-haspopup="true"]';   // the menu trigger
const ITEM_SEL = 'nav [role="menu"] a';          // links shown once open
await page.waitForSelector(MENU_SEL);
await cursor.move(MENU_SEL);
await page.waitForSelector(ITEM_SEL, { visible: true });
const links = await page.$$eval(ITEM_SEL, (els) => els.map((a) => a.href));
```

---

## `trawl.waitForHydration` — wait until the page has finished loading its data

Waits on the last page the script navigated. Use it after `page.goto` on a site that renders its content with JavaScript, before you read the DOM.

| Option | Default | Meaning |
|---|---|---|
| `strategy` | `'networkIdle'` | `'networkIdle'`: no network request for 500 ms. `'selector'`: wait for `selector` to appear. |
| `selector` | — | Required with `strategy: 'selector'` (throws without it). |
| `timeout` | `30000` | Milliseconds before it throws. |

Returns nothing; throws on timeout.

```js
await page.goto(TRAWL.url, { waitUntil: 'domcontentloaded' });
await trawl.waitForHydration({ strategy: 'selector', selector: '.product-card', timeout: 45000 });
const items = await page.$$eval('.product-card', (cards) => cards.map((c) => ({ title: c.textContent.trim() })));
return returnData(items);
```

## `captcha` — get a token for a captcha the script must submit

The worker already handles the common challenge pages by itself, after your script runs (see `anti-patterns.md`: never detect or fight them in your script). `captcha` is for one case only: a captcha that is **part of a form the script fills and submits** (a search or lookup form that asks for a token before it answers).

Each solver takes the widget's site key and the page URL and returns `Promise<string>`, the token. It **throws** when solving is not available on the worker, fails, or takes too long. A solve can take from seconds to a few minutes, and that time counts against the run budget (`SKILL.md`, "Run budget"): always `try`/`catch` it and keep the deadline guard.

| Helper | Arguments | Returns |
|---|---|---|
| `captcha.solveRecaptchaV2(siteKey, pageUrl)` | site key (`data-sitekey` on the widget), page URL | `Promise<string>` token |
| `captcha.solveRecaptchaV3(siteKey, pageUrl, action?, minScore?)` | site key, page URL, the page's action name (default `'verify'`), minimum score (default `0.7`) | `Promise<string>` token |
| `captcha.solveHcaptcha(siteKey, pageUrl)` | site key, page URL | `Promise<string>` token |
| `captcha.solveTurnstile(siteKey, pageUrl)` | site key, page URL | `Promise<string>` token |
| `captcha.injectRecaptchaSolution(page, token)` | the page, a reCAPTCHA token | `Promise<void>`: writes the token into `#g-recaptcha-response` and calls the widget's callbacks |

Only reCAPTCHA has an inject helper. For the others, write the token into the widget's response field yourself (`[name="h-captcha-response"]` for hCaptcha, `[name="cf-turnstile-response"]` for Turnstile), then submit the form.

```js
// a lookup form protected by a reCAPTCHA v2 checkbox
const FORM_SEL = 'form#lookup';
const WIDGET_SEL = '.g-recaptcha[data-sitekey]';
await page.type(`${FORM_SEL} input[name="q"]`, TRAWL.query);
try {
  const siteKey = await page.$eval(WIDGET_SEL, (el) => el.getAttribute('data-sitekey'));
  const token = await captcha.solveRecaptchaV2(siteKey, page.url());
  await captcha.injectRecaptchaSolution(page, token);
} catch (err) {
  console.error('captcha step failed:', err.message);
  returnData([]); // nothing to read without the form's answer
  return;
}
await Promise.all([
  page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
  page.click(`${FORM_SEL} [type="submit"]`),
]);
```
