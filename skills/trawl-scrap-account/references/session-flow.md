---
title: Session Flow
---

### saveSession(cookies)

Async helper injected by the worker. Call after confirming login succeeded — not on the login page or an error page.

```js
await saveSession(await page.cookies());
```

The worker persists the cookie array encrypted. On the next run, `TRAWL.account.session.cookies` is populated and the login flow is skipped. Call once per run only.

### Reuse pattern (full code)

```js
const page = await browser.newPage();

if (TRAWL.account?.session?.cookies) {
  // Saved session exists — restore cookies and skip the login flow.
  await page.setCookie(...TRAWL.account.session.cookies);
  await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
} else {
  // First run (or cleared session) — perform full login.
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

`TRAWL.account.session` is `undefined` on the first run — hence the optional chain. Both branches must reach the same post-login URL before scraping starts.

### Forced re-login

```bash
trawl scraps account clear-session <scrap-id>
```

The next run finds `TRAWL.account.session` undefined, falls into the login branch, and re-runs `saveSession` on success.

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
