#!/usr/bin/env node
import { mkdirSync, copyFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const SKILL_SOURCE = join(PACKAGE_ROOT, 'SKILL.md');
const SKILL_NAME = 'trawl';

function getDestination(scope) {
  const base = scope === 'local' ? join(process.cwd(), '.claude') : join(homedir(), '.claude');
  return join(base, 'skills', SKILL_NAME);
}

function getVersion() {
  const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

function install(scope) {
  const dest = getDestination(scope);
  mkdirSync(dest, { recursive: true });
  copyFileSync(SKILL_SOURCE, join(dest, 'SKILL.md'));
  return dest;
}

function uninstall(scope) {
  const dest = getDestination(scope);
  if (!existsSync(dest)) return null;
  rmSync(dest, { recursive: true, force: true });
  return dest;
}

function printUsage() {
  console.log(`@trawlme/skills ${getVersion()}

Usage:
  trawlme-skills install [--local]      Install the Trawl skill into Claude Code
  trawlme-skills uninstall [--local]    Remove the Trawl skill
  trawlme-skills update [--local]       Reinstall (overwrites existing)
  trawlme-skills version                Print version
  trawlme-skills help                   Print this message

Options:
  --local    Install to ./.claude/skills/trawl/ (project-level) instead of ~/.claude/skills/trawl/

Default scope is user-level (~/.claude/skills/).
`);
}

const [, , cmd, ...rest] = process.argv;
const scope = rest.includes('--local') ? 'local' : 'user';

switch (cmd) {
  case 'install':
  case 'update': {
    const dest = install(scope);
    console.log(`✓ Trawl skill installed at ${dest}`);
    console.log(`  Restart Claude Code if it was already running.`);
    break;
  }
  case 'uninstall': {
    const dest = uninstall(scope);
    if (dest) console.log(`✓ Trawl skill removed from ${dest}`);
    else console.log(`  No Trawl skill found at ${getDestination(scope)}`);
    break;
  }
  case 'version':
    console.log(getVersion());
    break;
  case 'help':
  case undefined:
    printUsage();
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    printUsage();
    process.exit(1);
}
