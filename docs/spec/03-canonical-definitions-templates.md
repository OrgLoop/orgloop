## 3. Canonical Definitions & Templates

### Schema Format: YAML

**Decision:** YAML for configuration files, with JSON Schema for validation.

**Rationale:**
- DESIGN.md already uses YAML for all examples — no switching cost.
- Supports comments (critical for config-as-code — people need to annotate routing decisions).
- Human-readable and writable. OaC files are meant to be read by the team; readability wins.
- JSON Schema provides programmatic validation; the CLI runs it on `orgloop validate`.
- HCL was considered but adds a learning curve and tooling dependency that isn't justified at our scale.
- TOML was considered but is awkward for deeply nested structures (routes with transforms with configs).

**File extension:** `.yaml` (not `.yml` — be explicit).

**File layout:** An OrgLoop project is a directory containing `.yaml` files organized by convention:

```
my-org/
├── orgloop.yaml          # Project manifest (required)
├── connectors/           # Connector definitions
│   ├── github.yaml
│   ├── linear.yaml
│   └── openclaw.yaml
├── routes/               # Route definitions
│   └── engineering.yaml
├── transforms/           # Transform definitions (or inline scripts)
│   ├── drop-bot-noise.sh
│   └── injection-scanner.sh
├── sops/                 # Launch prompt files (SOPs for actors)
│   ├── pr-review.md
│   ├── ci-failure.md
│   └── linear-ticket.md
└── loggers/              # Logger definitions
    └── default.yaml
```

### 3.1 Project Manifest

The root `orgloop.yaml` declares the project and its global settings.

```yaml
# orgloop.yaml — Project manifest
apiVersion: orgloop/v1alpha1
kind: Project
metadata:
  name: my-org
  description: "Engineering organization event routing"

# Global defaults
defaults:
  poll_interval: 5m
  event_retention: 7d
  log_level: info

# Which connector packages to load
connectors:
  - "@orgloop/connector-github"
  - "@orgloop/connector-linear"
  - "@orgloop/connector-openclaw"
  - "@orgloop/connector-claude-code"

# Which transform packages to load (in addition to inline scripts)
transforms:
  - "@orgloop/transform-filter"
  - "@orgloop/transform-dedup"
  - "@orgloop/transform-injection-scanner"

# Which logger packages to load
loggers:
  - "@orgloop/logger-file"
  - "@orgloop/logger-console"
```

### 3.2 Source Definition

```yaml
# connectors/github.yaml
apiVersion: orgloop/v1alpha1
kind: Source
metadata:
  name: github
  description: "GitHub PR activity on my-org/my-repo"
  labels:
    team: engineering
    platform: github

spec:
  connector: "@orgloop/connector-github"

  # Connector-specific configuration
  config:
    repo: "my-org/my-repo"
    # Only PRs by these authors
    authors:
      - "app/my-ci-bot"
      - "charlie"
    events:
      - "pull_request.review_submitted"
      - "pull_request_review_comment"
      - "issue_comment"
      - "pull_request.closed"
      - "pull_request.merged"
      - "workflow_run.completed"  # CI status

  # How this source is polled (managed internally by the OrgLoop daemon —
  # no external scheduler/LaunchAgent/cron needed)
  poll:
    interval: 5m
    # Or: webhook: true (for push-based sources — OrgLoop exposes the endpoint)

  # What event types this source emits
  emits:
    - resource.changed
    - actor.error       # CI failures map to this
```

### 3.3 Actor (Target) Definition

```yaml
# connectors/openclaw.yaml
apiVersion: orgloop/v1alpha1
kind: Actor
metadata:
  name: engineering-agent
  description: "Engineering OpenClaw agent"
  labels:
    team: engineering
    runtime: openclaw

spec:
  connector: "@orgloop/connector-openclaw"

  config:
    base_url: "http://127.0.0.1:18789"
    auth_token_env: OPENCLAW_WEBHOOK_TOKEN  # Read from environment
    agent_id: engineering
    default_channel: slack
    default_to: "user:U12345EXAMPLE"
```

### 3.4 Route Definition

Routes declare `when` (trigger), `then` (target), and optionally `with` (launch context). The `with` property provides **launch prompts** — focused, situational instructions delivered alongside the event to tell the actor how to approach this specific event type.

This is the same architectural pattern as OpenClaw Skills: focused, situational loading beats a grab-bag of instructions. The actor's identity and capabilities live with the actor (HEARTBEAT.md, skills). The event-specific SOPs live with the route.

```yaml
# routes/engineering.yaml
apiVersion: orgloop/v1alpha1
kind: RouteGroup
metadata:
  name: engineering-routes
  description: "Engineering event routing"

routes:
  - name: github-pr-review
    description: "PR review submitted → Engineering agent"

    when:
      source: github
      events:
        - resource.changed
      filter:
        provenance.platform_event: pull_request.review_submitted

    transforms:
      - ref: drop-bot-noise
      - ref: injection-scanner

    then:
      actor: engineering-agent
      config:
        session_key: "hook:github:pr-review:engineering"
        wake_mode: now
        deliver: true

    # Launch prompt — situational instructions for this specific event type
    with:
      prompt_file: "./sops/pr-review.md"

  - name: github-ci-failure
    description: "CI failure → Engineering agent"

    when:
      source: github
      events:
        - actor.error
      filter:
        provenance.platform_event: workflow_run.completed

    transforms:
      - ref: injection-scanner

    then:
      actor: engineering-agent
      config:
        session_key: "hook:github:ci-failure:engineering"
        wake_mode: now

    with:
      prompt_file: "./sops/ci-failure.md"

  - name: claude-code-to-supervisor
    description: "Claude Code completion → Supervisor"

    when:
      source: claude-code
      events:
        - actor.idle

    then:
      actor: engineering-agent
      config:
        session_key: "hook:claude-code:engineering"
        wake_mode: now

  - name: linear-to-project
    description: "Linear state change → Project agent"

    when:
      source: linear
      events:
        - resource.changed

    then:
      actor: engineering-agent
      config:
        session_key: "hook:linear:activity:engineering"
        wake_mode: now
        deliver: true

    with:
      prompt_file: "./sops/linear-ticket.md"
```

#### The `with` Property

`with` is an **optional** route property. Routes without `with` work exactly as before — the event is delivered without additional context.

```yaml
# Route schema with `with`
routes:
  - name: string              # Required
    description: string        # Optional

    when:                      # Required — trigger
      source: string
      events: [string]
      filter: object           # Optional

    transforms: [...]          # Optional — pipeline steps

    then:                      # Required — target
      actor: string
      config: object

    with:                      # Optional — launch context
      prompt_file: string      # Path to a Markdown SOP file (relative to route YAML)
```

**Only `prompt_file` is supported.** Launch prompts are Markdown files, not inline YAML strings. This enforces clean separation: route logic (when/then) lives in YAML, operational content (the SOP) lives in Markdown files that work with every editor and preview tool.

**File resolution:** `prompt_file` paths are resolved relative to the route YAML file's directory. `orgloop validate` checks that all referenced prompt files exist.

**Delivery:** When OrgLoop delivers an event with a launch prompt, the resolved prompt text is included in the delivery payload:

```json
{
  "event": { "id": "evt_abc123", "type": "resource.changed", "..." : "..." },
  "launch_prompt": "# PR Review Received\n\nA team member submitted a review on your PR.\n\n1. Read every review comment carefully\n..."
}
```

**Same actor, different prompts.** Multiple routes can target the same actor with different launch prompts. The routing layer decides which SOP is relevant — the actor doesn't need to figure it out.

**Reusability.** Multiple routes can reference the same SOP file with different event filters.

**Inspection:** `orgloop inspect route <name>` shows the associated prompt file and its contents.

### 3.5 Transform Definition

Transforms can be defined as:
1. **Shell scripts** — stdin/stdout contract (as specified in DESIGN.md)
2. **Named transforms** — referencing a transform package
3. **Inline scripts** — embedded in route definitions

```yaml
# transforms/drop-bot-noise.yaml
apiVersion: orgloop/v1alpha1
kind: Transform
metadata:
  name: drop-bot-noise
  description: "Filter out events generated by bots"

spec:
  # Option A: Shell script (preferred for simplicity)
  type: script
  script: transforms/drop-bot-noise.sh

  # Option B: Package transform
  # type: package
  # package: "@orgloop/transform-filter"
  # config:
  #   exclude:
  #     provenance.author_type: bot
```

The shell script contract (unchanged from DESIGN.md):

```bash
#!/bin/bash
# transforms/drop-bot-noise.sh
#
# Contract:
#   stdin:  Event JSON
#   args:   $SOURCE, $TARGET, $EVENT_TYPE (set as env vars)
#   stdout: Modified event JSON → event continues
#   empty stdout or exit 1 → event is filtered (dropped)

EVENT=$(cat)
AUTHOR_TYPE=$(echo "$EVENT" | jq -r '.provenance.author_type // "unknown"')

if [[ "$AUTHOR_TYPE" == "bot" ]]; then
    # Drop bot events — empty output
    exit 0
fi

# Pass through
echo "$EVENT"
```

### 3.6 Logger Definition

```yaml
# loggers/default.yaml
apiVersion: orgloop/v1alpha1
kind: LoggerGroup
metadata:
  name: default-loggers

loggers:
  - name: file-log
    type: "@orgloop/logger-file"
    config:
      path: ~/.orgloop/logs/orgloop.log
      format: jsonl
      rotation:
        max_size: 100MB
        max_age: 7d
        compress: true

  - name: console-log
    type: "@orgloop/logger-console"
    config:
      level: info
      color: true
```

### 3.7 Plugin Interface Contracts (Installable Components)

OrgLoop has three types of **independently installable packages**: connectors, transforms, and loggers. All three follow the same ecosystem model — publishable to npm, discoverable by convention, loadable at runtime.

| Installable Type | Package Pattern (first-party) | Package Pattern (community) | Interface |
|---|---|---|---|
| **Connectors** | `@orgloop/connector-*` | `orgloop-connector-*` | `SourceConnector`, `ActorConnector` |
| **Transforms** | `@orgloop/transform-*` | `orgloop-transform-*` | `Transform` |
| **Loggers** | `@orgloop/logger-*` | `orgloop-logger-*` | `Logger` |

Sources, actors, and routes are **not** installable — they are declarative YAML config that references installed packages. A source is an *instance* of a connector with specific config. An actor is an *instance* of a target connector. Routes are pure wiring.

All four interfaces below follow the same lifecycle pattern: `init → work → shutdown`. The SDK (`@orgloop/sdk`) provides base classes, test harnesses, and scaffold generators for each.

**Package manifest convention:** Installable packages should declare their type in `package.json`:

```json
{
  "orgloop": {
    "type": "connector",
    "provides": ["source", "target"],
    "id": "github"
  }
}
```

This enables `orgloop search connector` to scan npm for compatible packages.

#### Connector Interface (Source)

```typescript
// @orgloop/sdk — SourceConnector interface

import { OrgLoopEvent, SourceConfig } from '@orgloop/core';

export interface SourceConnector {
  /** Unique connector ID */
  readonly id: string;

  /** Initialize with user-provided config */
  init(config: SourceConfig): Promise<void>;

  /**
   * Poll for new events since the last checkpoint.
   * The runtime calls this on the configured interval.
   * Return an array of normalized OrgLoop events.
   */
  poll(checkpoint: string | null): Promise<PollResult>;

  /**
   * Optional: Register a webhook handler.
   * Return a request handler the server will mount.
   * For push-based sources.
   */
  webhook?(): WebhookHandler;

  /** Clean shutdown */
  shutdown(): Promise<void>;
}

export interface PollResult {
  events: OrgLoopEvent[];
  /** Opaque checkpoint string for crash recovery */
  checkpoint: string;
}

export type WebhookHandler = (req: IncomingRequest) => Promise<OrgLoopEvent[]>;
```

#### Connector Interface (Actor/Target)

```typescript
// @orgloop/sdk — ActorConnector interface

export interface ActorConnector {
  readonly id: string;

  init(config: ActorConfig): Promise<void>;

  /**
   * Deliver an event to this actor.
   * The runtime calls this when a route matches.
   * routeConfig includes actor-specific config from `then.config`
   * plus the resolved launch prompt (if the route has `with`).
   * Return delivery status.
   */
  deliver(event: OrgLoopEvent, routeConfig: RouteDeliveryConfig): Promise<DeliveryResult>;

  shutdown(): Promise<void>;
}

export interface RouteDeliveryConfig {
  /** Actor-specific config from route's `then.config` */
  [key: string]: unknown;
  /** Resolved launch prompt text (from route's `with.prompt_file`) */
  launch_prompt?: string;
  /** Original prompt file path (for reference/logging) */
  launch_prompt_file?: string;
}

export interface DeliveryResult {
  status: 'delivered' | 'rejected' | 'error';
  /** If the actor produces a response event, return it */
  responseEvent?: OrgLoopEvent;
  error?: Error;
}
```

#### Transform Interface (Programmatic)

```typescript
// @orgloop/sdk — Transform interface

export interface Transform {
  readonly id: string;

  init(config: Record<string, unknown>): Promise<void>;

  /**
   * Process an event. Return the (optionally modified) event,
   * or return null to filter/drop the event.
   */
  execute(event: OrgLoopEvent, context: TransformContext): Promise<OrgLoopEvent | null>;

  shutdown(): Promise<void>;
}

export interface TransformContext {
  source: string;
  target: string;
  eventType: string;
  routeName: string;
}
```

#### Logger Interface

```typescript
// @orgloop/sdk — Logger interface

export interface Logger {
  readonly id: string;

  init(config: Record<string, unknown>): Promise<void>;

  /**
   * Called for every pipeline event: source emit, transform result,
   * route match, delivery attempt, delivery result.
   */
  log(entry: LogEntry): Promise<void>;

  /** Flush any buffered entries */
  flush(): Promise<void>;

  shutdown(): Promise<void>;
}

export interface LogEntry {
  timestamp: string;
  event_id: string;
  phase: 'source' | 'transform' | 'route' | 'deliver' | 'error';
  source?: string;
  target?: string;
  transform?: string;
  route?: string;
  event_type?: string;
  result?: 'pass' | 'drop' | 'match' | 'delivered' | 'rejected' | 'error';
  duration_ms?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}
```

### 3.8 Developer Experience

#### Creating a New Connector

```bash
# Scaffold a new connector
$ orgloop add connector my-jira

Created:
  connectors/my-jira/
  ├── src/
  │   ├── index.ts      # Registration + exports
  │   ├── source.ts     # SourceConnector stub
  │   ├── target.ts     # ActorConnector stub (optional)
  │   └── normalizer.ts # Event normalizer stub
  ├── package.json
  ├── tsconfig.json
  └── README.md

Next steps:
  1. Edit connectors/my-jira/src/source.ts to implement polling
  2. Edit connectors/my-jira/src/normalizer.ts to map Jira events → OaC events
  3. Run: orgloop validate
  4. Run: orgloop test --connector my-jira
```

#### Creating a New Transform

```bash
# Shell script transform (simplest)
$ orgloop add transform my-filter --type script

Created: transforms/my-filter.sh

# Package transform (for complex/reusable transforms)
$ orgloop add transform my-enricher --type package

Created:
  transforms/my-enricher/
  ├── src/index.ts
  ├── package.json
  └── README.md
```

#### Creating a New Logger

```bash
$ orgloop add logger my-datadog

Created:
  loggers/my-datadog/
  ├── src/index.ts
  ├── package.json
  └── README.md
```

---

