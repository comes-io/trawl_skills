# @trawlme/skills

[![npm version](https://img.shields.io/npm/v/@trawlme/skills.svg)](https://www.npmjs.com/package/@trawlme/skills)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Claude Code skills for [Trawl](https://trawl.me). Teaches Claude how to manage scraps via `@trawlme/cli` — listing, creating, running, watching, debugging.

## Install

### Option 1 — via npx (no global install)

```bash
npx @trawlme/skills install
```

This installs the skill into `~/.claude/skills/trawl/` (user-level, available across all projects).

For project-level install:

```bash
npx @trawlme/skills install --local
```

### Option 2 — via the Trawl CLI

If you already have `@trawlme/cli` installed:

```bash
npm install -g @trawlme/cli
trawl skills install
```

The CLI bundles the skills and keeps them in sync with the CLI version.

## Usage

Once installed, restart Claude Code. The skill auto-triggers when you ask Claude about Trawl, scraps, scheduling jobs, or use the `trawl` CLI.

Example prompts:
- "list my failed scraps from last week"
- "create a scrap that scrapes example.com daily at 9am"
- "why did scrap 64a... fail?"
- "show me the data from my latest run"

## Commands

```
trawlme-skills install [--local]      Install (default: user-level)
trawlme-skills uninstall [--local]    Remove
trawlme-skills update [--local]       Reinstall over existing
trawlme-skills version                Print version
trawlme-skills help                   Print usage
```

## Prerequisites

The skill assumes `@trawlme/cli` is installed and the user is authenticated:

```bash
npm install -g @trawlme/cli
trawl login
```

## Editing the skill

The skill content lives in [`SKILL.md`](./SKILL.md). PRs to improve invocation accuracy or coverage are welcome.

## License

MIT — see [LICENSE](./LICENSE).
