# Engineering Org Example

A full engineering organization setup: GitHub, Linear, and Claude Code sources route events through transforms to an OpenClaw agent.

## What it does

- **GitHub** polls for PR reviews, comments, CI failures, and merges
- **Linear** polls for ticket state changes and comments
- **Claude Code** receives session completion events via webhook hook
- **Transforms** drop bot noise and deduplicate events
- **OpenClaw** agent receives filtered events with launch prompts (SOPs)

This replaces a collection of bespoke cron jobs and shell scripts with a single declarative config.

## Setup

```bash
orgloop init --name my-org --connectors github,linear,openclaw,claude-code --no-interactive --dir my-org
cd my-org
orgloop add module engineering
```

### Environment variables

| Variable | Source | Description |
|----------|--------|-------------|
| `GITHUB_REPO` | GitHub | Repository in `owner/repo` format |
| `GITHUB_TOKEN` | GitHub | Personal access token with repo read access |
| `LINEAR_TEAM_KEY` | Linear | Team key (e.g., `ENG`) |
| `LINEAR_API_KEY` | Linear | Linear API key |
| `OPENCLAW_WEBHOOK_TOKEN` | OpenClaw | Bearer token for OpenClaw API |
| `OPENCLAW_DEFAULT_TO` | OpenClaw | Default message recipient |

### Install Claude Code hook

```bash
orgloop hook claude-code-stop
```

This registers a post-exit hook so Claude Code sessions emit `actor.stopped` events.

### Validate and run

```bash
orgloop validate
orgloop plan        # preview what will happen
orgloop apply       # start the engine
```

## Files

```
orgloop.yaml                    # Project root config
connectors/
  github.yaml                   # GitHub PR/CI source
  linear.yaml                   # Linear ticket source
  claude-code.yaml              # Claude Code session source
  openclaw.yaml                 # OpenClaw delivery target
routes/
  engineering.yaml              # All event routing rules
transforms/
  transforms.yaml               # Bot filter + dedup pipeline
loggers/
  default.yaml                  # File + console logging
sops/
  pr-review.md                  # Launch prompt: PR review received
  ci-failure.md                 # Launch prompt: CI failure
  linear-ticket.md              # Launch prompt: Linear ticket update
```

## Routes

| Route | Trigger | Actor | SOP |
|-------|---------|-------|-----|
| `github-pr-review` | PR review submitted | openclaw-engineering-agent | `sops/pr-review.md` |
| `github-pr-comment` | PR review comment | openclaw-engineering-agent | `sops/pr-review.md` |
| `github-ci-failure` | CI workflow failed | openclaw-engineering-agent | `sops/ci-failure.md` |
| `claude-code-to-supervisor` | Claude Code session ended | openclaw-engineering-agent | -- |
| `linear-to-engineering` | Linear ticket changed | openclaw-engineering-agent | `sops/linear-ticket.md` |

## Customization

- Add more GitHub event types in `connectors/github.yaml` under `config.events`
- Add routes for specific Linear states by adding `filter` clauses
- Create additional SOPs in `sops/` and reference them from routes
- Adjust poll intervals per-source in each connector's `poll.interval`
