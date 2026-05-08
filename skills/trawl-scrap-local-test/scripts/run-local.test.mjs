#!/usr/bin/env node
// Smoke test — invokes run-local.mjs --help and checks exit code 0 + expected text.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const harness = join(here, 'run-local.mjs');

let failed = false;
try {
  const out = execFileSync(process.execPath, [harness, '--help'], { encoding: 'utf8' });
  if (!out.includes('--url=')) { console.error('FAIL: --help missing --url flag'); failed = true; }
  if (!out.includes('--params=')) { console.error('FAIL: --help missing --params flag'); failed = true; }
  if (!out.includes('--account-cookies=')) { console.error('FAIL: --help missing --account-cookies flag'); failed = true; }
  if (!failed) console.log('PASS: --help output looks right');
} catch (e) {
  console.error('FAIL: run-local.mjs --help exited non-zero:', e.message);
  failed = true;
}

// Fixture run — verify the harness can actually execute a scrap and produce returnData.
const fixture = join(here, 'fixture-scrap.mjs');
try {
  const out = execFileSync(process.execPath, [harness, fixture, '--headless'], { encoding: 'utf8' });
  if (!out.includes('"title": "hello"')) {
    console.error('FAIL: fixture run did not produce expected returnData');
    failed = true;
  } else {
    console.log('PASS: fixture run produced expected returnData');
  }
} catch (e) {
  if (e.message.includes('puppeteer-core not installed')) {
    console.log('SKIP: fixture run requires puppeteer-core (run: npm install --no-save puppeteer-core)');
  } else {
    console.error('FAIL: fixture run errored:', e.message);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
