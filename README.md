# @trawlme/skills

[![npm version](https://img.shields.io/npm/v/@trawlme/skills.svg)](https://www.npmjs.com/package/@trawlme/skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Claude Code skills for [Trawl](https://trawl.me). Teaches Claude how to manage scraps via `@trawlme/cli` — listing, creating, running, watching, debugging.

Follows the [Anthropic Agent Skills](https://github.com/anthropics/skills) layout: each skill lives in `skills/<name>/SKILL.md`.

## Bundled skills

| Skill | What it does |
|---|---|
| `trawl` | Use the `trawl` CLI to manage scraps (auth, list, run, watch, debug) |

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
npx @trawlme/skills install trawl
```

### Option 2 — via the Trawl CLI

If you already have `@trawlme/cli` installed:

```bash
npm install -g @trawlme/cli
trawl skills install
```

The CLI bundles the skills and keeps them in sync with the CLI version.

## Usage

Once installed, restart Claude Code. Skills auto-trigger when you ask Claude about Trawl, scraps, scheduling jobs, or use the `trawl` CLI.

Example prompts:
- "list my failed scraps from last week"
- "create a scrap that scrapes example.com daily at 9am"
- "why did scrap 64a... fail?"
- "show me the data from my latest run"

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

The `trawl` skill assumes `@trawlme/cli` is installed and the user is authenticated:

```bash
npm install -g @trawlme/cli
trawl login
```

## Editing the skills

Each skill lives in [`skills/<name>/SKILL.md`](./skills/). PRs to improve invocation accuracy or coverage are welcome.

## License

MIT — see [LICENSE](./LICENSE).
