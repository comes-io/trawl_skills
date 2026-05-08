---
title: Cookie Injection
---

### setCookie before goto

Call `page.setCookie(...cookies)` before any `page.goto` on the target domain. Cookies set after `goto` are ignored on the first request — the browser has already sent the request headers by the time setCookie resolves.

```js
const page = await browser.newPage();
await page.setCookie(...cookies);  // must come before goto
await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
```

### HttpOnly cookies are invisible from JS

`document.cookie` does not return HttpOnly cookies. Capturing cookies by running `document.cookie` in the browser console or via `page.evaluate(() => document.cookie)` silently skips them — you get a partial set that will not authenticate the session.

Capture the full cookie set via:
- **DevTools** → Application → Cookies → select the domain → copy rows to JSON manually.
- **A WebExtensions-based Chrome extension** that exports all cookies including HttpOnly ones. Search the Chrome Web Store: https://chromewebstore.google.com/search/cookie%20exporter — do not hard-code a specific extension name since availability changes.

This is the most common silent failure when cookies are partially captured: the session cookie is set, navigation succeeds, but the site redirects back to `/login` because the authentication cookie was HttpOnly and was not included.

### Domain matching gotchas

The cookie's `domain` field must match the hostname rules the site expects. There are three distinct forms:

- `.example.com` (leading dot) — matches `example.com` and all subdomains (`www.example.com`, `api.example.com`). Most session cookies use this form.
- `example.com` (no dot) — matches only the apex domain.
- `www.example.com` — matches only that specific subdomain.

When cookies don't apply on navigation, check the `domain` field first. Export the exact value from DevTools rather than guessing.

```json
[
  {
    "name": "session_id",
    "value": "abc123",
    "domain": ".example.com",
    "path": "/",
    "httpOnly": true,
    "secure": true
  }
]
```

### localStorage / sessionStorage parallel save

Many sites store JWTs or auth tokens in `localStorage`, not cookies. The browser's cookie jar can be fully correct, yet the site still redirects to `/login` because it also checks `localStorage`.

Detection signal: navigation succeeds (no network error, page loads), but the page immediately redirects to `/login` despite valid cookies being set.

Capture localStorage from a logged-in session:

```js
// In DevTools console on the logged-in page:
JSON.stringify(localStorage)
```

Replay after `goto` via `page.evaluate`:

```js
await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
await page.evaluate((data) => {
  for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
}, capturedLocalStorage);
await page.reload({ waitUntil: 'domcontentloaded' });
```

### Cookies don't persist across worker runs except via Trawl session

The worker starts a fresh browser context on each run. Any cookies set inside the script are gone when the run ends. Persistence is only achieved via:

- `saveSession(await page.cookies())` in the Trawl-managed flow (stores encrypted at rest, exposes as `account.session.cookies` next run).
- The flavour B persistence endpoint (cookies pushed externally into `account.session.cookies`).

Flavour A (embedded cookies) relies on cookies being re-injected from the script source on every run.

### Exporting cookies from Chrome — walkthrough

1. Open Chrome and log in to the target site normally.
2. Open DevTools (F12 or Cmd+Opt+I).
3. Go to Application → Storage → Cookies → select the target domain.
4. All cookies are listed, including HttpOnly ones (marked with a checkmark in the HttpOnly column).
5. Copy the values manually to a JSON array matching the Puppeteer `CookieParam` shape (`name`, `value`, `domain`, `path`, `httpOnly`, `secure`).

Alternatively, use a WebExtensions-based cookie-export extension from the Chrome Web Store: https://chromewebstore.google.com/search/cookie%20exporter

### Storage state expiry

Signs that cookies have expired:
- Navigation lands on `/login` or a redirect to the identity provider.
- First protected request returns a 401 or 403.
- The page loads but user-specific data is absent (the site silently fell back to a guest view).

Refresh strategy:
1. Log in locally in a fresh Chrome session.
2. Export the new cookies using the walkthrough above.
3. Re-upload via flavour B persistence endpoint, or update the embedded array (flavour A).
4. For the Trawl-managed flow: run `trawl scraps account clear-session <id>` to force a re-login on the next run (see `trawl-cli` skill).
