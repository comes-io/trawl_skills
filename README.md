# @trawlme/skills

[![npm version](https://img.shields.io/npm/v/@trawlme/skills.svg)](https://www.npmjs.com/package/@trawlme/skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Claude Code skills for [Trawl](https://trawl.me). Teaches Claude how to manage scraps via `@trawlme/cli` — listing, creating, running, watching, debugging.

Follows the [Anthropic Agent Skills](https://github.com/anthropics/skills) layout: each skill lives in `skills/<name>/SKILL.md`.

## Bundled skills

| Skill | What it does |
|---|---|
| `trawl-cli` | Use the `trawl` CLI to manage scraps via @trawlme/cli (auth, list, create, run, watch, debug). |
| `trawl-scrap-design` | Best practices for writing the Puppeteer script body — selectors, returnData shape, params, validation, anti-patterns. |
| `trawl-scrap-account` | Authentication — Trawl-managed credentials, BYO-cookies (embedded and persisted flavours), session reuse. |
| `trawl-scrap-local-test` | Run a scrap locally with headed Chrome before publishing, mirroring the worker entry contract. |
| `trawl-scrap-banner` | Generate + upload a brand-aware 1200x630 banner image for a scrap. |

## Install

### Option 1 — via npx (no global install)

```bash
npx @trawlme/skills install
```

Installs all bundled skills into `~/.claude/skills/<name>/` (user-level, available across all projects).

For project-level install:

```bash
npx @trawlme/skills install --local
```

Install a specific skill only:

```bash
npx @trawlme/skills install trawl-cli
```

### Option 2 — via the Trawl CLI

If you already have `@trawlme/cli` installed:

```bash
npm install -g @trawlme/cli
trawl skills install
```

The CLI bundles the skills and keeps them in sync with the CLI version — every `trawl` command re-syncs a skill whose installed version drifts from the CLI's.

Since `@trawlme/cli` 3.10, `trawl login` also installs any bundled skill you don't already have when run interactively — no separate `trawl skills install` needed. It prints exactly what it installed, plus the one thing you have to do yourself: **restart Claude Code**, since skills are only picked up at session start.

## Migrating from v0.1.x

In v0.1.x there was a single skill named `trawl`. v0.2.0 split it into four focused skills; `trawl-scrap-banner` was added later, bringing the total to the five listed in the bundled skills table above. When you run `npx @trawlme/skills install` (or `update`), the installer detects the legacy `~/.claude/skills/trawl/` directory and removes it before installing the current set. No manual cleanup needed.

Restart Claude Code after the install for the new skills to be picked up.

## Usage

Once installed, restart Claude Code. Skills auto-trigger when you ask Claude about Trawl, scraps, scheduling jobs, or use the `trawl` CLI.

Example prompts:
- "list my failed scraps from last week" (`trawl-cli`)
- "create a scrap that scrapes example.com daily at 9am" (`trawl-cli` + `trawl-scrap-design`)
- "scrape a site behind login without giving Trawl my credentials" (`trawl-scrap-account`)
- "test my scrap locally before pushing" (`trawl-scrap-local-test`)

### Authenticated scraps: session capture

For a site that needs a login, `trawl-scrap-account` walks Claude through `trawl scraps account session capture <id>` — it opens a real, visible Chrome window at the scrap's target URL, you log in there exactly as you normally would (2FA included), and the CLI reads the resulting session over the Chrome DevTools Protocol (cookies and per-origin localStorage) and uploads it. No manual cookie export.

> You stay authenticated as yourself throughout — Trawl never sees your credentials, only the resulting session. Responsibility for lawful use of that session stays with you; this isn't legal advice.

This needs a local interactive terminal with a real display — it doesn't work headless, in CI, or over a plain SSH session. `session set -c <file>` (manual cookie upload) remains the fallback when capture can't run.

## Commands

```
trawlme-skills install [<skill>] [--local]      Install one or all skills
trawlme-skills uninstall [<skill>] [--local]    Remove one or all skills
trawlme-skills update [<skill>] [--local]       Reinstall over existing
trawlme-skills list                             List bundled skills
trawlme-skills version                          Print version
trawlme-skills help                             Print usage
```

## Prerequisites

The `trawl-cli` skill assumes `@trawlme/cli` is installed and the user is authenticated:

```bash
npm install -g @trawlme/cli
trawl login
```

## Editing the skills

Each skill lives in [`skills/<name>/SKILL.md`](./skills/). PRs to improve invocation accuracy or coverage are welcome.

## License

MIT — see [LICENSE](./LICENSE).
