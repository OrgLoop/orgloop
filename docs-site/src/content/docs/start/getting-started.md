---
title: Getting Started
description: Install OrgLoop, scaffold a project, and start routing events in 5 minutes.
---

Get from zero to a running OrgLoop system in five minutes.

## Prerequisites

- Node.js >= 22

## Install

```bash
npm install -g @orgloop/cli
```

Verify:

```bash
orgloop version
```

## Initialize a project

Scaffold a new project with the connectors you need:

```bash
orgloop init --name my-org --connectors github,linear,openclaw,claude-code --no-interactive
cd my-org
```

This creates the project structure -- `orgloop.yaml`, connector configs, directories for routes, transforms, loggers, and SOPs.

## Add a module

Install a pre-built workflow module. The `engineering` module adds routes for PR review, CI failure triage, Linear tickets, and Claude Code supervision:

```bash
orgloop add module engineering
```

This scaffolds connector configs, transforms, SOP files, and registers 5 routes that expand at runtime.

For a simpler starting point, use `orgloop add module minimal` instead (1 source, 1 actor, 1 route).

## Configure environment variables

OrgLoop configs reference secrets via `${VAR_NAME}` syntax. Check what you need:

```bash
orgloop env
```

```
Environment Variables:

  ✗ GITHUB_REPO              connectors/github.yaml
  ✗ GITHUB_TOKEN             connectors/github.yaml
    → GitHub personal access token (repo scope)
    → https://github.com/settings/tokens/new?scopes=repo,read:org
  ✗ LINEAR_API_KEY           connectors/linear.yaml
  ✗ OPENCLAW_WEBHOOK_TOKEN   connectors/openclaw.yaml

0 of 4 variables set. 4 missing.
```

Set your variables:

```bash
export GITHUB_REPO="my-org/my-repo"
export GITHUB_TOKEN="ghp_..."
export LINEAR_TEAM_KEY="ENG"
export LINEAR_API_KEY="lin_api_..."
export OPENCLAW_WEBHOOK_TOKEN="..."
```

Or copy the generated `.env.example` to `.env` and fill it in. See the [User Guide](/start/user-guide/) for details on `orgloop env` and `orgloop doctor`.

## Validate

Check that everything is wired correctly:

```bash
orgloop validate
```

Validation checks YAML syntax, schema conformance, reference integrity (routes reference existing sources, actors, transforms), and that referenced files exist.

## Plan

Preview what will happen before starting:

```bash
orgloop plan
```

```
OrgLoop Plan — my-org

  Sources:
    + github                  (new — poll every 5m)
    + linear                  (new — poll every 5m)
    + claude-code             (new — hook)

  Actors:
    + openclaw-engineering-agent  (new)

  Routes:
    + github-pr-review        (new)
    + github-ci-failure       (new)
    + linear-to-engineering   (new)
    + claude-code-to-supervisor  (new)

Plan: 8 to add, 0 to change, 0 to remove.
```

## Apply

Start the engine:

```bash
orgloop apply
```

Events are now flowing. Sources poll on their configured intervals, routes match incoming events, transforms filter noise, and actors receive focused work with launch prompts.

## Check status

```bash
orgloop status
```

```
OrgLoop — my-org (running, PID 42831)

  NAME            TYPE    INTERVAL
  github          poll    5m
  linear          poll    5m
  claude-code     hook    —

  NAME                         SOURCE         ACTOR
  github-pr-review             github         openclaw-engineering-agent
  github-ci-failure            github         openclaw-engineering-agent
  linear-to-engineering        linear         openclaw-engineering-agent
  claude-code-to-supervisor    claude-code    openclaw-engineering-agent
```

## Next steps

- [User Guide](/start/user-guide/) -- comprehensive day-to-day operations (logs, testing, customization, modules)
- [What is OrgLoop?](/start/what-is-orgloop/) -- deeper introduction to Organization as Code
- [Five Primitives](/concepts/five-primitives/) -- understand the building blocks
- [Engineering Org example](/examples/engineering-org/) -- full production setup walkthrough
- [CLI Command Reference](/cli/command-reference/) -- all available commands
