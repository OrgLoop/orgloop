## 8. CLI Design

### 8.1 Command Reference

```
orgloop — Organization as Code runtime

USAGE:
  orgloop <command> [options]

COMMANDS:
  init              Scaffold a new OrgLoop project
  validate          Validate configuration files
  plan              Show what would change (dry run)
  apply             Start/update the runtime with current config
  serve             Start the HTTP API server
  stop              Stop the running runtime
  status            Show runtime status, sources, actors, recent events
  logs              Tail or query the event log
  test              Inject a test event and trace its path
  add               Scaffold a new connector, transform, or logger
  inspect           Deep-dive into a specific source, actor, or route
  install-service   Generate platform service file (launchd/systemd/Docker)
  service           Manage the installed service (start/stop/status/logs)
  version           Print version info

FLAGS:
  --config, -c      Path to orgloop.yaml (default: ./orgloop.yaml)
  --workspace, -w   Workspace name (default: "default")
  --verbose, -v     Verbose output
  --json            Output as JSON (for scripting)
  --help, -h        Show help
```

### 8.2 Command Details

#### `orgloop init`

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

Non-interactive mode:
```bash
orgloop init --name my-org --connectors github,linear,openclaw --no-interactive
```

Template mode (scaffold from a pre-built template):
```bash
# Scaffold from a built-in template
orgloop init --template engineering

# Available templates:
#   minimal              — Simplest possible setup (1 source, 1 actor, 1 route)
#   engineering          — Full engineering org (GitHub, Linear, Claude Code, OpenClaw)
#   enterprise-example   — Fortune 50 scale with modules and workspaces
```

Templates are static scaffolds — they generate a starting project that you customize. See [Modules (v1.1+)](#12-modules-v11) for composable, parameterized bundles.

#### `orgloop validate`

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

Validates:
- YAML syntax
- Schema conformance (against JSON Schema)
- Reference integrity (routes reference existing sources, actors, transforms)
- Connector config completeness (required fields present)
- Transform script existence and permissions (executable bit)
- Launch prompt file existence (routes with `with.prompt_file`)

#### `orgloop plan`

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

#### `orgloop apply`

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

`orgloop apply` starts the runtime as a **long-running daemon process**. It manages all source polling internally — poll intervals are declared in the YAML spec, not in external schedulers. This single process replaces N separate pollers/LaunchAgents/cron jobs.

```bash
# Foreground (development, debugging)
orgloop apply

# Daemon mode (production)
orgloop apply --daemon
# PID written to ~/.orgloop/orgloop.pid
```

#### `orgloop serve`

```bash
$ orgloop serve

Starting OrgLoop API server...

  ✓ Engine loaded (3 sources, 1 actor, 3 routes)
  ✓ HTTP API listening on http://127.0.0.1:8420
  ✓ Event ingestion: POST /api/v1/events
  ✓ Health check: GET /api/v1/health
  ✓ Management API: /api/v1/*

OrgLoop server is running. PID: 42892
API docs: http://127.0.0.1:8420/docs
```

See [API/SDK Runtime Modes](#9-apisdk-runtime-modes) for details on server mode.

#### `orgloop stop`

```bash
$ orgloop stop

Stopping OrgLoop (PID 42891)...
  ✓ Flushing loggers...
  ✓ Saving checkpoints...
  ✓ Shutting down sources...
  ✓ Stopped.
```

Graceful shutdown: flush log buffers, persist current checkpoints, wait for in-flight deliveries (with timeout), then exit.

#### `orgloop status`

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
  NAME            STATUS    DELIVERIES (24h)  ERRORS
  engineering-agent  healthy  62                0

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

#### `orgloop logs`

```bash
# Tail all logs
$ orgloop logs

# Tail logs for a specific source
$ orgloop logs --source github

# Tail logs for a specific route
$ orgloop logs --route github-to-engineering

# Query historical logs
$ orgloop logs --since 2h --event-type resource.changed --format json

# Show only drops (filtered events)
$ orgloop logs --result drop

# Show a specific event's full trace
$ orgloop logs --event evt_abc123
```

#### `orgloop test`

```bash
# Inject a test event from a file
$ orgloop test event.json

Injecting test event: resource.changed (source: github)

  ✓ Transform: drop-bot-noise — PASS (2ms)
  ✓ Transform: injection-scanner — PASS (15ms)
  ✓ Route match: github-to-engineering
  ✓ Delivery: engineering-agent — 200 OK (89ms)

Event evt_test_001 traced successfully through 1 route.

# Inject with dry-run (no actual delivery)
$ orgloop test event.json --dry-run

# Generate a sample event for a connector
$ orgloop test --generate github
# Writes a sample event to stdout that you can pipe back in

# Inject from stdin
$ echo '{"type":"resource.changed","source":"github",...}' | orgloop test -
```

#### `orgloop add`

```bash
# Add a connector
$ orgloop add connector jira
$ orgloop add connector my-custom --type source

# Add a transform
$ orgloop add transform my-filter --type script
$ orgloop add transform my-enricher --type package

# Add a logger
$ orgloop add logger datadog

# Add a route
$ orgloop add route my-route --source github --actor engineering-agent
```

#### `orgloop install-service`

```bash
# Auto-detect platform and generate service file
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

# Explicit platform
$ orgloop install-service --systemd    # Linux: generates ~/.config/systemd/user/orgloop.service
$ orgloop install-service --launchd    # macOS: generates LaunchAgent plist
$ orgloop install-service --docker     # Generates Dockerfile + docker-compose.yaml

# Service lifecycle (thin wrappers around platform tools)
$ orgloop service start
$ orgloop service stop  
$ orgloop service status
$ orgloop service logs
```

The generated service file keeps OrgLoop alive across reboots and restarts on crash. This single service replaces all per-source pollers (e.g., `com.openclaw.github-activity.plist`, `com.openclaw.linear-activity.plist`).

#### `orgloop inspect`

```bash
# Inspect a source
$ orgloop inspect source github
Name:       github
Type:       poll (every 5m)
Connector:  @orgloop/connector-github
Config:     repo=my-org/my-repo, authors=[app/my-ci-bot, charlie]
Emits:      resource.changed, actor.error
Checkpoint: 2026-02-08T20:47:00Z
Routes:     github-to-engineering
Events:     47 (24h), 312 (7d)

# Inspect a route
$ orgloop inspect route github-pr-review
Name:       github-pr-review
Source:     github → [drop-bot-noise, injection-scanner] → engineering-agent
Prompt:     ./sops/pr-review.md
Matched:    45 (24h)
Dropped:    2 (24h) — all by drop-bot-noise
Errors:     0
Last event: 3 min ago (evt_abc123)
```

### 8.3 CLI Framework

**Library:** [Commander.js](https://github.com/tj/commander.js/) (mature, well-documented, TypeScript support).

**Output formatting:** Custom output module supporting:
- Human-readable (default): colored, tabular, with emoji indicators
- JSON (`--json`): machine-parseable for scripting
- Quiet (`--quiet`): errors only

**Configuration resolution:**
1. CLI flags (highest priority)
2. Environment variables (`ORGLOOP_*`)
3. `orgloop.yaml` in current directory
4. `~/.orgloop/config.yaml` (user defaults)

---

