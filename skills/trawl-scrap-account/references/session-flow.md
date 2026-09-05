---
title: Session Flow
---

### saveSession(cookies)

Async helper injected by the worker. Call after confirming login succeeded — not on the login page or an error page.

```js
await saveSession(await page.cookies());
```

The worker persists the cookie array encrypted and replays it automatically on the next run, before your script's first navigation. This is a **cookies-only** refresh — it never touches or clears any `origins` (localStorage) block already on the account, whether that came from `session capture` or the web UI. Call once per run only.

### Reuse pattern (full code)

```js
const page = await browser.newPage();

// The worker has already replayed any stored session onto this page.
// Check for a marker that only appears when logged in, rather than
// assuming a saved session means you're logged in.
await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
const loggedIn = await page.$('.account-menu') !== null;

if (!loggedIn) {
  await page.goto('https://example.com/login', { waitUntil: 'domcontentloaded' });
  await page.type('#username', TRAWL.account.username);
  await page.type('#password', TRAWL.account.password);
  await Promise.all([
    page.click('button[type=submit]'),
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
  ]);
  // Persist for the next run.
  await saveSession(await page.cookies());
}
```

`TRAWL.account.session` is always an object once an account is configured — `cookies` and `origins` default to `[]` rather than the field itself being absent or `undefined`, so `if (TRAWL.account?.session?.cookies)` is *always* truthy (an empty array is truthy in JS) and can't tell you whether a session was actually captured. The marker check above is what actually distinguishes the two cases. Both branches must reach the same post-login URL before scraping starts.

### Forced re-login

```bash
trawl scraps account clear-session <scrap-id>
```

The next run replays `cookies: []` / `origins: []` (nothing to restore), the marker check fails, the script falls into the login branch, and `saveSession` re-runs on success.

### When the login flow itself breaks

Two failure modes:

**Navigation failed** — `page.waitForNavigation` throws (network error or timeout). The `try/catch` catches this only; it does NOT detect wrong credentials.

**Wrong credentials** — site redirects back to a login route (navigational success, so `try/catch` never fires). Detect by checking `page.url()` after navigation resolves — but match the **exact pathname**, never a substring like `.includes('/login')`. A substring match false-positives on any URL that merely contains the word — `github.com/{org}/login`, `reddit.com/r/login`, a docs page at `/docs/login` — and would misclassify a page that loaded fine as a rejected login. Match against the same login-route vocabulary Trawl's own server-side login-wall detector uses, exact-whole-pathname (trailing-slash-insensitive):

```js
const LOGIN_ROUTES = new Set([
  '/login', '/signin', '/accounts/login', '/ap/signin',
  '/i/flow/login', '/users/sign_in', '/auth/login',
]);

function isLoginRoute(url) {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  const normalized = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return LOGIN_ROUTES.has(normalized);
}
```

```js
const page = await browser.newPage();

try {
  await page.goto('https://example.com/login', { waitUntil: 'domcontentloaded' });
  await page.type('#username', TRAWL.account.username);
  await page.type('#password', TRAWL.account.password);
  await Promise.all([
    page.click('button[type=submit]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
  ]);
} catch (err) {
  // Navigation timed out or network failed — distinct from wrong-credentials.
  throw new Error(`Login navigation failed: ${err.message}`);
}

if (isLoginRoute(page.url())) {
  // Exact route match, not a substring — form rejected our credentials and we're still on a login page.
  throw new Error('Login failed: wrong credentials');
}

// Persist for next run only after we've confirmed login success.
await saveSession(await page.cookies());
```

**Login form changed** — selector breakage, not credentials. Throw with the broken selector name so AI Fix can surface it:

```js
const usernameField = await page.$('#username');
if (!usernameField) throw new Error('Login form changed — #username selector not found. Update the selector.');
```
