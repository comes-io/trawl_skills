---
title: Cookie Injection
---

### setCookie before goto

Call `page.setCookie(...cookies)` before `page.goto`. Cookies set after `goto` are ignored — request headers are already sent.

```js
const page = await browser.newPage();
await page.setCookie(...cookies);  // must come before goto
await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
```

### HttpOnly cookies are invisible from JS

`document.cookie` and `page.evaluate(() => document.cookie)` silently skip HttpOnly cookies — the partial set won't authenticate the session. This is the most common silent failure.

Capture the full cookie set via:
- **DevTools** → Application → Cookies → select the domain → copy to JSON manually.
- **A WebExtensions-based Chrome extension** from https://chromewebstore.google.com/search/cookie%20exporter

### Domain matching gotchas

Three distinct forms:

- `.example.com` (leading dot) — matches apex + all subdomains. Most session cookies use this.
- `example.com` (no dot) — apex only.
- `www.example.com` — that subdomain only.

When cookies don't apply, check `domain` first. Export the exact value from DevTools.

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

Some sites store JWTs in `localStorage`, not cookies. Detection signal: navigation succeeds but immediately redirects to `/login` despite valid cookies.

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

The worker starts a fresh browser context on each run. Persistence requires:

- `saveSession(await page.cookies())` — stores encrypted, exposed as `account.session.cookies` next run.
- Flavour B persistence endpoint — cookies pushed externally.

Flavour A re-injects cookies from the script source on every run.

### Exporting cookies from Chrome — walkthrough

1. Log in to the target site in Chrome.
2. Open DevTools → Application → Storage → Cookies → select the domain.
3. Copy values to a JSON array matching `CookieParam` shape (`name`, `value`, `domain`, `path`, `httpOnly`, `secure`).

Or use a cookie-export extension: https://chromewebstore.google.com/search/cookie%20exporter

### Storage state expiry

Signs of expired cookies:
- Navigation lands on `/login` or identity-provider redirect.
- First protected request returns 401 or 403.
- Page loads but user-specific data is absent (silent guest view).

Refresh:
1. Log in locally in a fresh Chrome session.
2. Export new cookies (walkthrough above).
3. Re-upload via flavour B, or update the embedded array (flavour A).
4. Trawl-managed flow: `trawl scraps account clear-session <id>` to force re-login on next run.
