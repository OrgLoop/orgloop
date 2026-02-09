## 1. Repo Organization

### Decision: Monorepo with Workspace Packages

OrgLoop uses a single monorepo with workspace-scoped packages. This is the right choice at this stage for three reasons:

1. **Atomic changes.** A connector interface change + connector update + CLI update ships as one commit.
2. **Shared tooling.** One CI pipeline, one lint config, one test harness.
3. **Low overhead.** We're a small team. Multi-repo coordination costs dominate at our scale.

When the community grows and third-party connectors proliferate, community connectors live in their own repos (like Terraform providers). First-party connectors stay in the monorepo.

### Directory Structure

```
orgloop/
├── DESIGN.md                    # Architecture and philosophy (exists)
├── SPEC.md                      # This document
├── README.md                    # 🧬 Project overview + quickstart
├── LICENSE                      # Apache 2.0
├── package.json                 # Workspace root (pnpm workspaces)
├── pnpm-workspace.yaml
├── tsconfig.base.json           # Shared TypeScript config
├── turbo.json                   # Turborepo build orchestration
│
├── packages/
│   ├── core/                    # @orgloop/core — runtime engine
│   │   ├── src/
│   │   │   ├── engine.ts        # Main event loop + pipeline orchestrator
│   │   │   ├── router.ts        # Route matching + dispatch
│   │   │   ├── transform.ts     # Transform pipeline executor
│   │   │   ├── logger.ts        # Logger fan-out manager
│   │   │   ├── store.ts         # Event store / WAL interface
│   │   │   ├── scheduler.ts     # Poll scheduling + cron
│   │   │   ├── types.ts         # Core type definitions
│   │   │   ├── schema.ts        # YAML schema validation (JSON Schema)
│   │   │   └── errors.ts        # Error taxonomy
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── cli/                     # @orgloop/cli — command-line interface
│   │   ├── src/
│   │   │   ├── index.ts         # Entry point
│   │   │   ├── commands/        # One file per command
│   │   │   │   ├── init.ts
│   │   │   │   ├── validate.ts
│   │   │   │   ├── plan.ts
│   │   │   │   ├── apply.ts
│   │   │   │   ├── serve.ts     # Server/API mode
│   │   │   │   ├── stop.ts
│   │   │   │   ├── status.ts
│   │   │   │   ├── logs.ts
│   │   │   │   ├── test.ts
│   │   │   │   └── add.ts
│   │   │   └── output.ts        # Formatting, colors, tables
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── sdk/                     # @orgloop/sdk — plugin development kit
│   │   ├── src/
│   │   │   ├── connector.ts     # Base connector class + interfaces
│   │   │   ├── transform.ts     # Transform interface + helpers
│   │   │   ├── logger.ts        # Logger interface + helpers
│   │   │   ├── event.ts         # Event builder + validators
│   │   │   └── testing.ts       # Test harness for plugin authors
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── server/                  # @orgloop/server — HTTP API server
│       ├── src/
│       │   ├── index.ts
│       │   ├── routes/          # API route handlers
│       │   └── middleware/
│       ├── package.json
│       └── tsconfig.json
│
├── connectors/                  # First-party connectors
│   ├── github/                  # @orgloop/connector-github
│   │   ├── src/
│   │   │   ├── index.ts         # Connector registration
│   │   │   ├── source.ts        # GitHub source (poll + webhook)
│   │   │   ├── target.ts        # GitHub target (create issue, comment, etc.)
│   │   │   └── normalizer.ts    # GitHub events → OaC event types
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── linear/                  # @orgloop/connector-linear
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── source.ts
│   │   │   ├── target.ts
│   │   │   └── normalizer.ts
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── openclaw/                # @orgloop/connector-openclaw
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── source.ts        # Listen for agent events
│   │   │   └── target.ts        # Wake agents via webhook API
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── claude-code/             # @orgloop/connector-claude-code
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── source.ts        # Exit hook listener
│   │   │   └── hook.sh          # Shell hook script (installed into Claude Code)
│   │   ├── package.json
│   │   └── README.md
│   │
│   └── webhook/                 # @orgloop/connector-webhook
│       ├── src/
│       │   ├── index.ts
│       │   ├── source.ts        # Generic inbound webhook receiver
│       │   └── target.ts        # Generic outbound webhook sender
│       ├── package.json
│       └── README.md
│
├── transforms/                  # First-party transforms
│   ├── filter/                  # @orgloop/transform-filter
│   ├── dedup/                   # @orgloop/transform-dedup
│   ├── rate-limit/              # @orgloop/transform-rate-limit
│   ├── injection-scanner/       # @orgloop/transform-injection-scanner
│   ├── sanitizer/               # @orgloop/transform-sanitizer
│   └── jq/                      # @orgloop/transform-jq
│
├── loggers/                     # First-party loggers
│   ├── file/                    # @orgloop/logger-file
│   ├── console/                 # @orgloop/logger-console
│   ├── otlp/                    # @orgloop/logger-otlp
│   ├── syslog/                  # @orgloop/logger-syslog
│   └── webhook/                 # @orgloop/logger-webhook
│
├── sops/                        # Launch prompt files (SOPs)
│   ├── pr-review.md             # SOP for PR review events
│   ├── ci-failure.md            # SOP for CI failure events
│   └── linear-ticket.md         # SOP for Linear ticket events
│
├── docs/                        # Documentation
│   ├── manifesto.md             # Vision document (exists)
│   ├── getting-started.md
│   ├── concepts.md              # The five primitives explained
│   ├── writing-connectors.md
│   ├── writing-transforms.md
│   ├── writing-loggers.md
│   ├── configuration.md         # Schema reference
│   ├── scaling.md
│   └── content-strategy/        # Launch content (exists)
│
└── examples/                    # Example configurations
    ├── minimal/                 # Simplest possible setup
    ├── production/              # Production config example (the MVP)
    └── enterprise/              # Fortune 50 scale example
```

### First-Party vs. Community Packages

| Aspect | First-Party | Community |
|--------|-------------|-----------|
| Location | Monorepo (`connectors/`, `transforms/`, `loggers/`) | Separate repos |
| npm scope | `@orgloop/connector-*`, `@orgloop/transform-*`, `@orgloop/logger-*` | `orgloop-connector-*`, `orgloop-transform-*`, `orgloop-logger-*` |
| Versioned with | Core runtime | Independently |
| CI | Monorepo CI | Connector author's CI |
| Compatibility | Guaranteed with current core | Declares `@orgloop/sdk` peer dependency |
| Approval required | N/A (we publish them) | **None** — anyone can publish at any time |

**Inspiration:** Terraform's provider model. `hashicorp/aws` is first-party; community providers follow a naming convention, implement a well-defined interface, and are discovered via registry/npm. See [Zero Bottleneck to Adoption](#24-design-principle-zero-bottleneck-to-adoption) for the full philosophy.

---

