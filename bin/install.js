#!/usr/bin/env node
import { mkdirSync, copyFileSync, existsSync, rmSync, readFileSync, readdirSync, statSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, '..');
const SKILLS_SOURCE = join(PACKAGE_ROOT, 'skills');

function getSkillsBase(scope) {
  const base = scope === 'local' ? join(process.cwd(), '.claude') : join(homedir(), '.claude');
  return join(base, 'skills');
}

function listSourceSkills() {
  if (!existsSync(SKILLS_SOURCE)) return [];
  return readdirSync(SKILLS_SOURCE).filter((name) => {
    const dir = join(SKILLS_SOURCE, name);
    return statSync(dir).isDirectory() && existsSync(join(dir, 'SKILL.md'));
  });
}

function getVersion() {
  const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

const LEGACY_SKILL_DIRS = ['trawl']; // names removed in v0.2.0 due to rename

function migrateLegacy(scope) {
  const base = getSkillsBase(scope);
  for (const name of LEGACY_SKILL_DIRS) {
    const legacy = join(base, name);
    if (!existsSync(legacy)) continue;
    try {
      rmSync(legacy, { recursive: true, force: true });
      if (existsSync(legacy)) {
        console.warn(`[trawlme-skills] Legacy skill "${name}/" detected but could not be removed — please delete ${legacy} manually.`);
      } else {
        console.log(`[trawlme-skills] Legacy skill "${name}/" detected — removed (renamed in v0.2.0)`);
      }
    } catch (err) {
      console.warn(`[trawlme-skills] Failed to remove legacy "${name}/": ${err.message}. Please delete ${legacy} manually.`);
    }
  }
}

function installOne(name, scope) {
  const src = join(SKILLS_SOURCE, name);
  const dest = join(getSkillsBase(scope), name);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  return dest;
}

function uninstallOne(name, scope) {
  const dest = join(getSkillsBase(scope), name);
  if (!existsSync(dest)) return null;
  rmSync(dest, { recursive: true, force: true });
  return dest;
}

function pickSkills(arg) {
  const all = listSourceSkills();
  if (!arg || arg === 'all') return all;
  if (!all.includes(arg)) {
    console.error(`Unknown skill "${arg}". Available: ${all.join(', ')}`);
    process.exit(1);
  }
  return [arg];
}

function printUsage() {
  const all = listSourceSkills();
  console.log(`@trawlme/skills ${getVersion()}

Usage:
  trawlme-skills install [<skill>] [--local]      Install one or all skills
  trawlme-skills uninstall [<skill>] [--local]    Remove one or all skills
  trawlme-skills update [<skill>] [--local]       Reinstall over existing
  trawlme-skills list                             List bundled skills
  trawlme-skills version                          Print version
  trawlme-skills help                             Print this message

Options:
  --local    Install to ./.claude/skills/ instead of ~/.claude/skills/

Available skills: ${all.join(', ') || '(none)'}
`);
}

const args = process.argv.slice(2);
const cmd = args[0];
const scope = args.includes('--local') ? 'local' : 'user';
const positional = args.filter((a) => !a.startsWith('-') && a !== cmd);
const skillArg = positional[0];

switch (cmd) {
  case 'install':
  case 'update': {
    const skills = pickSkills(skillArg);
    if (!skills.length) {
      console.error('No skills found in package.');
      process.exit(1);
    }
    migrateLegacy(scope);
    for (const name of skills) {
      const dest = installOne(name, scope);
      console.log(`✓ Installed "${name}" at ${dest}`);
    }
    console.log(`  Restart Claude Code if it was already running.`);
    break;
  }
  case 'uninstall': {
    const skills = pickSkills(skillArg);
    for (const name of skills) {
      const dest = uninstallOne(name, scope);
      if (dest) console.log(`✓ Removed "${name}" from ${dest}`);
      else console.log(`  No "${name}" found in ${getSkillsBase(scope)}`);
    }
    break;
  }
  case 'list':
    for (const name of listSourceSkills()) console.log(name);
    break;
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
