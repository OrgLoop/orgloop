# OrgLoop CLI Walkthrough

A hands-on guide to running an Organization as Code system. From zero to a fully operational event routing pipeline.

---

## Contents

1. [Install](#install)
2. [Initialize a Project](#initialize-a-project)
3. [Configure Your Org](#configure-your-org)
4. [Validate](#validate)
5. [Plan](#plan)
6. [Apply](#apply)
7. [Monitor with Status](#monitor-with-status)
8. [Tail Logs](#tail-logs)
9. [Test Events](#test-events)
10. [Inspect Primitives](#inspect-primitives)
11. [Add Components](#add-components)
12. [Install as a Service](#install-as-a-service)
13. [A Day in the Life](#a-day-in-the-life)

---

## Install

```bash
npm install -g orgloop
```

Verify:

```bash
orgloop version
```

---

## Initialize a Project

OrgLoop scaffolds a complete project structure. Three modes:

### Interactive (default)

```bash
$ orgloop init

? Project name: my-org
? Description: Engineering organization event routing
? Which connectors? (space to select)
  ◉ GitHub
  ◉ Linear
  ◉ OpenClaw
  ◉ Claude Code
  ○ Webhook (generic)
  ○ Slack
  ○ PagerDuty

Created:
  orgloop.yaml
  connectors/github.yaml
  connectors/linear.yaml
  connectors/openclaw.yaml
  routes/example.yaml
  loggers/default.yaml
  transforms/
  sops/                          # Launch prompt files (SOPs)

Next: edit your connector configs, then run `orgloop validate`
```

### Non-interactive

```bash
orgloop init --name my-org --connectors github,linear,openclaw --no-interactive
```

### Template mode

Scaffold from a pre-built template — the fastest way to start:

```bash
# Full engineering org (GitHub, Linear, Claude Code, OpenClaw)
orgloop init --template engineering

# Simplest possible setup (1 source, 1 actor, 1 route)
orgloop init --template minimal

# Fortune 50 scale with modules and workspaces
orgloop init --template enterprise-example
```

Templates are static scaffolds — they generate a starting project that you customize.

---

## Configure Your Org

After init, you have a project structure. Edit the generated files to match your setup:

- **`orgloop.yaml`** — project manifest (name, description, references)
- **`connectors/*.yaml`** — source and actor definitions (repos, poll intervals, webhook URLs)
- **`routes/*.yaml`** — event routing rules (when X happens, wake Y)
- **`transforms/`** — filter/enrichment scripts
- **`loggers/*.yaml`** — where pipeline events are recorded
- **`sops/`** — launch prompt files for actors

The five primitives — Sources, Actors, Routes, Transforms, Loggers — describe your entire org topology.

---

## Validate

Check that everything is wired correctly before running:

```bash
$ orgloop validate

✓ orgloop.yaml — valid project manifest
✓ connectors/github.yaml — valid source definition
✓ connectors/openclaw.yaml — valid actor definition
✗ routes/engineering.yaml — error at routes[0].transforms[1]:
    Transform "injection-scanner" not found. Did you mean "injection-scan"?
✓ loggers/default.yaml — valid logger group

1 error, 0 warnings
```

What gets validated:
- YAML syntax
- Schema conformance (JSON Schema)
- Reference integrity — routes reference existing sources, actors, transforms
- Connector config completeness (required fields present)
- Transform script existence and permissions (executable bit)
- Launch prompt file existence (routes with `with.prompt_file`)

Fix the error and re-run until clean:

```bash
$ orgloop validate

✓ orgloop.yaml — valid project manifest
✓ connectors/github.yaml — valid source definition
✓ connectors/openclaw.yaml — valid actor definition
✓ routes/engineering.yaml — valid route group
✓ loggers/default.yaml — valid logger group

0 errors, 0 warnings ✓
```

---

## Plan

Preview what will happen before you commit — Terraform-style:

```bash
$ orgloop plan

OrgLoop Plan — my-org

  Sources:
    + github          (new — poll every 5m)
    + linear          (new — poll every 5m)
    ~ claude-code     (changed — hook_type: post-exit → exit)

  Actors:
    = engineering-agent  (unchanged)

  Routes:
    + github-to-engineering       (new)
    + linear-to-project           (new)
    + claude-code-to-supervisor   (new)

  Transforms:
    + drop-bot-noise              (new — script)
    + injection-scanner           (new — script)

  Loggers:
    = file-log                    (unchanged)
    + console-log                 (new)

Plan: 5 to add, 1 to change, 0 to remove.

Run `orgloop apply` to execute this plan.
```

Symbols: `+` new, `~` changed, `=` unchanged, `-` removed.

---

## Apply

Start the runtime. This is the moment events start flowing.

### Foreground (development)

```bash
$ orgloop apply

Applying plan...

  ✓ Source github — polling started (every 5m)
  ✓ Source linear — polling started (every 5m)
  ✓ Source claude-code — hook listener started
  ✓ Actor engineering-agent — ready
  ✓ Route github-to-engineering — active
  ✓ Route linear-to-project — active
  ✓ Route claude-code-to-supervisor — active
  ✓ Logger file-log — writing to ~/.orgloop/logs/orgloop.log
  ✓ Logger console-log — streaming to stdout

OrgLoop is running. PID: 42891
Logs: orgloop logs | Status: orgloop status | Stop: orgloop stop
```

### Daemon mode (production)

```bash
orgloop apply --daemon
# PID written to ~/.orgloop/orgloop.pid
```

One long-running process manages all source polling internally. Poll intervals are declared in YAML — no external schedulers, no separate LaunchAgents, no cron jobs.

### Stop

```bash
$ orgloop stop

Stopping OrgLoop (PID 42891)...
  ✓ Flushing loggers...
  ✓ Saving checkpoints...
  ✓ Shutting down sources...
  ✓ Stopped.
```

Graceful shutdown: flushes log buffers, persists checkpoints, waits for in-flight deliveries.

---

## Monitor with Status

See what's running and what's flowing:

```bash
$ orgloop status

OrgLoop — my-org
  Status: running (PID 42891, uptime 3h 22m)
  Workspace: default

Sources:
  NAME          TYPE     INTERVAL  LAST POLL           EVENTS (24h)
  github        poll     5m        2 min ago           47
  linear        poll     5m        3 min ago           12
  claude-code   hook     —         18 min ago          3

Actors:
  NAME                STATUS    DELIVERIES (24h)  ERRORS
  engineering-agent   healthy   62                0

Routes:
  NAME                        MATCHED (24h)  DROPPED  ERRORS
  github-to-engineering       45             2        0
  linear-to-project           12             0        0
  claude-code-to-supervisor   3              0        0

Recent Events (last 5):
  TIME          SOURCE    TYPE              ROUTE                      STATUS
  20:47:12      github    resource.changed  github-to-engineering      delivered
  20:47:12      github    resource.changed  github-to-engineering      dropped (bot)
  20:42:08      linear    resource.changed  linear-to-project          delivered
  20:18:33      cc        actor.idle        claude-code-to-supervisor  delivered
  20:15:01      github    resource.changed  github-to-engineering      delivered
```

Machine-readable output for scripting:

```bash
orgloop status --json
```

---

## Tail Logs

Full event tracing and log querying:

```bash
# Tail all logs
orgloop logs

# Filter by source
orgloop logs --source github

# Filter by route
orgloop logs --route github-to-engineering

# Historical query
orgloop logs --since 2h --event-type resource.changed --format json

# Show only dropped events
orgloop logs --result drop

# Trace a specific event end-to-end
orgloop logs --event evt_abc123
```

Log entries capture every phase of the pipeline:

```jsonl
{"ts":"...","phase":"source","source":"github","event_id":"evt_abc","event_type":"resource.changed"}
{"ts":"...","phase":"transform","transform":"drop-bot-noise.sh","event_id":"evt_abc","result":"pass"}
{"ts":"...","phase":"transform","transform":"injection-scanner.sh","event_id":"evt_abc","result":"pass"}
{"ts":"...","phase":"route","event_id":"evt_abc","matched":"github-to-engineering"}
{"ts":"...","phase":"deliver","event_id":"evt_abc","target":"openclaw","agent":"engineering","status":"delivered"}
```

---

## Test Events

Inject synthetic events to verify your routing without waiting for real activity:

```bash
# Inject a test event from a file
$ orgloop test event.json

Injecting test event: resource.changed (source: github)

  ✓ Transform: drop-bot-noise — PASS (2ms)
  ✓ Transform: injection-scanner — PASS (15ms)
  ✓ Route match: github-to-engineering
  ✓ Delivery: engineering-agent — 200 OK (89ms)

Event evt_test_001 traced successfully through 1 route.
```

### Dry run (no actual delivery)

```bash
orgloop test event.json --dry-run
```

### Generate sample events

```bash
# Generate a sample event for any connector
orgloop test --generate github
# Outputs a sample event JSON to stdout — pipe it back in:
orgloop test --generate github | orgloop test -
```

### Inject from stdin

```bash
echo '{"type":"resource.changed","source":"github","payload":{...}}' | orgloop test -
```

---

## Inspect Primitives

Deep-dive into any component of the system:

### Inspect a source

```bash
$ orgloop inspect source github

Name:       github
Type:       poll (every 5m)
Connector:  @orgloop/connector-github
Config:     repo=my-org/my-repo, authors=[app/my-ci-bot, charlie]
Emits:      resource.changed, actor.error
Checkpoint: 2026-02-08T20:47:00Z
Routes:     github-to-engineering
Events:     47 (24h), 312 (7d)
```

### Inspect a route

```bash
$ orgloop inspect route github-pr-review

Name:       github-pr-review
Source:     github → [drop-bot-noise, injection-scanner] → engineering-agent
Prompt:     ./sops/pr-review.md
Matched:    45 (24h)
Dropped:    2 (24h) — all by drop-bot-noise
Errors:     0
Last event: 3 min ago (evt_abc123)
```

---

## Add Components

Scaffold new primitives without editing YAML manually:

```bash
# Add a connector
orgloop add connector jira
orgloop add connector my-custom --type source

# Add a transform
orgloop add transform my-filter --type script
orgloop add transform my-enricher --type package

# Add a logger
orgloop add logger datadog

# Add a route
orgloop add route my-route --source github --actor engineering-agent
```

Each command scaffolds the appropriate YAML and script files with sensible defaults.

---

## Install as a Service

Run OrgLoop as a system service that survives reboots:

### Auto-detect platform

```bash
$ orgloop install-service

Detected platform: macOS (launchd)
Generated: ~/Library/LaunchAgents/com.orgloop.daemon.plist
  KeepAlive: true
  WorkingDirectory: ~/.orgloop
  Config: ~/.orgloop/orgloop.yaml

To activate:
  launchctl load ~/Library/LaunchAgents/com.orgloop.daemon.plist

To deactivate:
  launchctl unload ~/Library/LaunchAgents/com.orgloop.daemon.plist
```

### Explicit platform

```bash
orgloop install-service --systemd    # Linux
orgloop install-service --launchd    # macOS
orgloop install-service --docker     # Dockerfile + docker-compose.yaml
```

### Service management

Thin wrappers around platform tools:

```bash
orgloop service start
orgloop service stop
orgloop service status
orgloop service logs
```

One service replaces all per-source pollers — no more scattered LaunchAgents and cron jobs.

---

## A Day in the Life

Here's how events actually flow through a running OrgLoop system over the course of a morning:

### 9:00 AM — Brandon opens a PR

1. **GitHub** emits a `resource.changed` event (pull_request.opened)
2. OrgLoop's GitHub source connector picks it up on the next 5-minute poll
3. **Transform: `drop-bot-noise`** — checks author. Brandon is human → PASS
4. **Transform: `injection-scanner`** — scans PR body for prompt injection → PASS
5. **Route: `github-to-engineering`** matches → wakes the engineering agent
6. The engineering agent reviews the PR, leaves comments, and finishes
7. Agent completion emits `actor.idle` → flows back into OrgLoop

### 9:15 AM — Claude Code finishes a task

1. Claude Code exits after completing a refactor
2. The **post-exit hook** fires, emitting `actor.idle` to OrgLoop
3. **Route: `claude-code-to-supervisor`** matches → wakes the engineering agent
4. The agent checks Claude Code's work, updates the PR, notifies the team

### 9:30 AM — A bot pushes a commit

1. **GitHub** emits `resource.changed` (push by `app/renovate-bot`)
2. **Transform: `drop-bot-noise`** — detects bot author → DROP
3. Event never reaches any actor. Logged as `dropped (bot)`.

### 9:45 AM — Linear ticket moves to "In Progress"

1. **Linear** emits `resource.changed` (issue state change)
2. **Route: `linear-to-project`** matches → wakes the engineering agent
3. Agent picks up the ticket, spins up a Claude Code session
4. Claude Code starts working → when it finishes, its completion event loops back

**The loop continues.** Events trigger actors, actors produce events, the organization sustains itself. Nothing gets dropped. Nothing gets forgotten.

---

## Global Flags

Available on all commands:

| Flag | Description |
|------|-------------|
| `--config, -c` | Path to orgloop.yaml (default: `./orgloop.yaml`) |
| `--workspace, -w` | Workspace name (default: `"default"`) |
| `--verbose, -v` | Verbose output |
| `--json` | Machine-readable JSON output |
| `--help, -h` | Show help |

### Configuration resolution order

1. CLI flags (highest priority)
2. Environment variables (`ORGLOOP_*`)
3. `orgloop.yaml` in current directory
4. `~/.orgloop/config.yaml` (user defaults)

---

## Command Reference

| Command | Description |
|---------|-------------|
| `orgloop init` | Scaffold a new project |
| `orgloop validate` | Validate config files and references |
| `orgloop plan` | Preview changes (dry run) |
| `orgloop apply` | Start/update the runtime |
| `orgloop stop` | Stop the runtime gracefully |
| `orgloop status` | Show runtime status and recent events |
| `orgloop logs` | Tail or query the event log |
| `orgloop test` | Inject a test event and trace it |
| `orgloop inspect` | Deep-dive into any primitive |
| `orgloop add` | Scaffold new components |
| `orgloop install-service` | Generate platform service file |
| `orgloop service` | Manage the installed service |
| `orgloop serve` | Start the HTTP API server |
| `orgloop version` | Print version info |

---

*Back to [README](../README.md) · Full spec at [docs/spec/](spec/)*
