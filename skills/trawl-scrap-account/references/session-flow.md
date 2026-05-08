---
title: Session Flow
---

### saveSession(cookies)

`saveSession` is an async helper injected by the worker. Call it immediately after a successful login redirect, passing the current page's cookie array.

```js
await saveSession(await page.cookies());
```

The worker persists the cookie array encrypted at rest. On the next run, `account.session.cookies` is populated with the saved array and the login flow can be skipped entirely.

Call `saveSession` only once per run, after confirming the login succeeded (e.g. after `waitForNavigation` resolves to the post-login URL). Calling it on the login page itself or on an error page persists a broken session.

### Reuse pattern (full code)

```js
const page = await browser.newPage();

if (account.session?.cookies) {
  // Saved session exists — restore cookies and skip the login flow.
  await page.setCookie(...account.session.cookies);
  await page.goto('https://example.com/dashboard', { waitUntil: 'domcontentloaded' });
} else {
  // First run (or cleared session) — perform full login.
  await page.goto('https://example.com/login', { waitUntil: 'domcontentloaded' });
  await page.type('#username', account.username);
  await page.type('#password', account.password);
  await Promise.all([
    page.click('button[type=submit]'),
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
  ]);
  // Persist for the next run.
  await saveSession(await page.cookies());
}
```

The `account.session?.cookies` check uses optional chaining because `account.session` is `undefined` on the very first run (no session has been saved yet). Both branches should reach the same post-login URL before the scraping logic starts.

### Forced re-login

If the saved session has expired or the user needs to force the next run to reauthenticate, clear the stored session via the CLI:

```bash
trawl scraps account clear-session <scrap-id>
```

This is handled by the `trawl-cli` skill. After clearing, the next run finds `account.session` undefined and falls into the login branch, re-running `saveSession` on success.

### When the login flow itself breaks

Distinguish two failure modes:

**Navigation timed out or network failed** — `page.waitForNavigation` throws when the browser can't complete the navigation (network error, timeout, etc.). The `try/catch` catches this case only; it does NOT detect wrong credentials.

**Credentials wrong** — the site rejects the login form and redirects back to `/login` (or leaves the URL unchanged). This succeeds navigationally, so the `try/catch` never fires. Detect it by checking `page.url()` after the navigation resolves.

```js
const page = await browser.newPage();

try {
  await page.goto('https://example.com/login', { waitUntil: 'domcontentloaded' });
  await page.type('#username', account.username);
  await page.type('#password', account.password);
  await Promise.all([
    page.click('button[type=submit]'),
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }),
  ]);
} catch (err) {
  // Navigation timed out or network failed — distinct from wrong-credentials.
  throw new Error(`Login navigation failed: ${err.message}`);
}

if (page.url().includes('/login')) {
  // Form rejected our credentials and we're still on the login page.
  throw new Error('Login failed: wrong credentials');
}

// Persist for next run only after we've confirmed login success.
await saveSession(await page.cookies());
```

**Login form changed** — the selector for `#username`, `#password`, or `button[type=submit]` no longer matches. This is a selector breakage, not a credentials problem. Throw with a message that names the broken selector so Trawl's AI Fix can surface it:

```js
const usernameField = await page.$('#username');
if (!usernameField) throw new Error('Login form changed — #username selector not found. Update the selector.');
```

Surface selector breakages to AI Fix rather than silently swallowing them. A clear error message in the throw is what AI Fix uses to generate a replacement.
