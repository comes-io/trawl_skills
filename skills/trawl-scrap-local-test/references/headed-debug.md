# Headed Debug Reference

Advanced debugging flags and techniques for `run-local.mjs`.

## Default flags

The harness launches Chrome with `headless: false`, `slowMo: 250`, `devtools: true`. Tune `slowMo` with the `--slowMo=<ms>` flag, e.g. `run-local.mjs scrap.js --slowMo=500` — lower is faster, higher lets you watch each action. Defaults to `0` automatically under `--headless`.

## Pause inside page.evaluate

`debugger` inside an `evaluate` callback pauses in the embedded DevTools Sources panel. Both conditions (headed + DevTools open) are met under the default harness flags.

```js
await page.evaluate(() => {
  debugger;
  return document.title;
});
```

## Attach to an existing Chrome

Launch Chrome with a remote debugging port to log in manually (MFA, OAuth) before the script runs.

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-trawl
```

Log in manually in that Chrome window (complete MFA, solve CAPTCHA, etc.). Then attach the harness to the running instance:

```bash
node run-local.mjs scrap.js --remote
```

The harness calls `puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' })` and opens a new page. It does not close the browser when done.

## Intermediate snapshots

Insert `page.screenshot` between actions to see actual page state when a selector doesn't match.

```js
await page.screenshot({ path: '/tmp/step-1.png' });
await page.click('#load-more');
await page.waitForSelector('[data-testid="results"]');
await page.screenshot({ path: '/tmp/step-2.png' });
```

Open the PNG files in any image viewer. On macOS: `open /tmp/step-1.png`.

## Network capture

Log `response` events to debug API-driven SPAs where the DOM may be stale while the XHR already returned data.

```js
page.on('response', (r) => console.log(r.status(), r.url()));
```

Place before the first `page.goto`. Filter to specific endpoints:

```js
page.on('response', (r) => {
  if (r.url().includes('/api/')) console.log(r.status(), r.url());
});
```
