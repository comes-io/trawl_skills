#!/usr/bin/env node
// Smoke test for install.js legacy migration.
// Runs in a temp dir so it never touches the real ~/.claude.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

const PACKAGE_ROOT = new URL('..', import.meta.url).pathname;
const tmpHome = mkdtempSync(join(tmpdir(), 'trawl-skills-test-'));
const skillsDir = join(tmpHome, '.claude', 'skills');
const legacyDir = join(skillsDir, 'trawl');
mkdirSync(legacyDir, { recursive: true });
writeFileSync(join(legacyDir, 'SKILL.md'), '---\nname: trawl\ndescription: legacy\n---\n');

let failed = false;
try {
  execSync(`HOME='${tmpHome}' node ${join(PACKAGE_ROOT, 'bin/install.js')} install trawl-cli`, {
    stdio: 'inherit',
  });
  if (existsSync(legacyDir)) {
    console.error(`FAIL: legacy dir ${legacyDir} still exists after install`);
    failed = true;
  }
  if (!existsSync(join(skillsDir, 'trawl-cli', 'SKILL.md'))) {
    console.error(`FAIL: trawl-cli not installed`);
    failed = true;
  }
  if (!failed) console.log('PASS: legacy dir removed and trawl-cli installed');
} finally {
  rmSync(tmpHome, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
