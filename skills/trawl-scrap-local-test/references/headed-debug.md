# Headed Debug Reference

Advanced debugging flags and techniques for `run-local.mjs`.

### Default flags

The harness launches Chrome with `headless: false`, `slowMo: 250`, and `devtools: true`. This opens a visible browser window with DevTools attached.

Tune `slowMo` between 100 and 500 depending on what you want to observe. Lower values run faster; higher values give more time to watch each action in the browser.

### Pause inside page.evaluate

The `debugger` keyword inside an `evaluate` callback pauses execution in the embedded DevTools. Set a breakpoint or step through the callback from the Sources panel.

```js
await page.evaluate(() => {
  debugger;
  return document.title;
});
```

The browser must be visible (not headless) and DevTools must be open — both are true under the default harness flags.

### Attach to an existing Chrome

Start Chrome with a remote debugging port before running the harness. This lets you log in manually to sites that require MFA or browser-based OAuth before the script runs.

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-trawl
```

Log in manually in that Chrome window (complete MFA, solve CAPTCHA, etc.). Then attach the harness to the running instance:

```bash
node run-local.mjs scrap.js --remote
```

The harness calls `puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' })` and opens a new page in the existing browser. It does not close the browser when the script finishes.

### Intermediate snapshots

Insert `page.screenshot` calls between actions to capture page state at each step. Useful when a selector does not match and you want to see what the page actually looked like at that moment.

```js
await page.screenshot({ path: '/tmp/step-1.png' });
await page.click('#load-more');
await page.waitForSelector('[data-testid="results"]');
await page.screenshot({ path: '/tmp/step-2.png' });
```

Open the PNG files in any image viewer. On macOS: `open /tmp/step-1.png`.

### Network capture

Listen to `response` events to log every request and its HTTP status. Useful for debugging API-driven SPAs where the visible DOM may be stale while the underlying XHR already returned data.

```js
page.on('response', (r) => console.log(r.status(), r.url()));
```

Place this before the first `page.goto` so all requests are captured. Filter to specific endpoints with a string check:

```js
page.on('response', (r) => {
  if (r.url().includes('/api/')) console.log(r.status(), r.url());
});
```
