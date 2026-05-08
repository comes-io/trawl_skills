#!/usr/bin/env node
// Local Trawl scrap harness — mirrors the worker entry contract.
// Globals injected: browser, TRAWL, account, returnData, saveSession.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);

function help() {
  console.log(`run-local.mjs <scrap-file> [flags]

Flags:
  --url=<url>                  TRAWL.url
  --params=k=v[,k=v]*          TRAWL.<custom> keys
  --account-username=<user>    account.username
  --account-password=<pwd>     account.password
  --account-cookies=<path>     account.session.cookies (JSON array)
  --remote                     connect to existing Chrome at 127.0.0.1:9222
  --headless                   launch Chrome in headless mode (no window)
  --chrome=<path>              path to Chrome executable (auto-detected if omitted)
  --help                       this message
`);
}

if (args.length === 0 || args.includes('--help')) {
  help();
  process.exit(args.length === 0 ? 1 : 0);
}

const positional = args.filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.join('=') || true];
    })
);

const scrapPath = positional[0];
if (!scrapPath) {
  console.error('Missing scrap file argument');
  help();
  process.exit(1);
}

const scrapBody = readFileSync(resolve(scrapPath), 'utf8');

const TRAWL = { url: flags.url || null };
if (typeof flags.params === 'string') {
  for (const pair of flags.params.split(',')) {
    const [k, v] = pair.split('=');
    if (k) TRAWL[k] = v;
  }
}

const account = { username: flags['account-username'] || null, password: flags['account-password'] || null };
if (flags['account-cookies']) {
  const cookies = JSON.parse(readFileSync(resolve(flags['account-cookies']), 'utf8'));
  account.session = { cookies };
}

let puppeteer;
try {
  puppeteer = await import('puppeteer-core');
} catch {
  console.error('puppeteer-core not installed. Run: npm install -g puppeteer-core');
  process.exit(1);
}

// Auto-detect Chrome executable if not specified via --chrome flag.
function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ];
  return candidates.find(existsSync) || null;
}

let browser;
if (flags.remote) {
  browser = await puppeteer.default.connect({ browserURL: 'http://127.0.0.1:9222' });
} else {
  let executablePath;
  if (typeof flags.chrome === 'string') {
    if (!existsSync(flags.chrome)) {
      console.error(`Chrome not found at: ${flags.chrome}`);
      process.exit(1);
    }
    executablePath = flags.chrome;
  } else {
    executablePath = findChrome();
    if (!executablePath) {
      console.error('No Chrome executable found. Install Chrome or pass --chrome=/path/to/chrome');
      process.exit(1);
    }
  }

  browser = await puppeteer.default.launch({
    executablePath,
    headless: !!flags.headless,
    slowMo: flags.headless ? 0 : 250,
    devtools: !flags.headless,
    args: ['--no-sandbox'],
  });
}

const returnData = (arr) => {
  console.log('--- returnData ---');
  console.log(JSON.stringify(arr, null, 2));
};
const saveSession = async (cookies) => {
  console.log('--- saveSession (stub) ---');
  console.log(JSON.stringify(cookies, null, 2));
};

const wrapped = `(async () => {\n${scrapBody}\n})()`;

try {
  const fn = new Function('browser', 'TRAWL', 'account', 'returnData', 'saveSession', `return ${wrapped}`);
  await fn(browser, TRAWL, account, returnData, saveSession);
} catch (err) {
  console.error('--- script error ---');
  console.error(err.stack || err);
  process.exitCode = 1;
} finally {
  if (!flags.remote) await browser.close();
  else await browser.disconnect();
}
