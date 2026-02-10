# Multi-Agent Supervisor Example

Demonstrates the feedback loop pattern: Claude Code sessions emit `actor.stopped` events, which route to a supervisor actor that reviews work and can re-dispatch tasks.

## What it does

- **Claude Code** connector receives session exit events via webhook hook
- **GitHub** connector polls for PR activity (the work Claude Code produces)
- A **supervisor** actor receives both streams and decides what to do next
- The supervisor's own sessions feed back as `actor.stopped` events, creating the recursive loop

This is OrgLoop's core insight in action: actors complete sessions, the system observes the completion, and routes it to the next actor in the chain.

## The feedback loop

```
Claude Code session ends
       |
       v
  actor.stopped
       |
       v
  Route: session-review
       |
       v
  Supervisor agent (reviews work, may dispatch follow-ups)
       |
       v
  Supervisor session ends -> actor.stopped -> ... (loop)
```

## Setup

### 1. Environment variables

| Variable | Description |
|----------|-------------|
| `GITHUB_REPO` | Repository being worked on (`owner/repo`) |
| `GITHUB_TOKEN` | GitHub PAT with repo read access |
| `OPENCLAW_WEBHOOK_TOKEN` | Bearer token for OpenClaw API |
| `OPENCLAW_DEFAULT_TO` | Default message recipient |

### 2. Install Claude Code hook

```bash
orgloop hook claude-code-stop
```

### 3. Run

```bash
cd examples/multi-agent-supervisor
orgloop validate
orgloop apply
```

## Files

```
orgloop.yaml              # All config in one file
sops/
  review-session.md       # Launch prompt for session review
  review-pr.md            # Launch prompt for PR review
```

## Routes

| Route | Trigger | Actor | Purpose |
|-------|---------|-------|---------|
| `session-review` | Claude Code `actor.stopped` | supervisor | Review completed session |
| `pr-review` | GitHub `resource.changed` (PR review) | supervisor | Handle PR feedback |

## Key concept

`actor.stopped` is deliberately neutral. OrgLoop observes that a session ended -- it does not claim the work succeeded or failed. The supervisor actor reads the session payload and decides:

- Was the work completed? Move on.
- Did the agent get stuck? Re-dispatch with more context.
- Did something break? Escalate.

The system routes signals. Actors have opinions.
