## 13. Maturity Roadmap

### The Goal

🧬 OrgLoop's aspirational launch story: *"You can install my engineering organization. Here's the YAML. Run this CLI."*

The manifesto ends with that promise. Everything below is the path to making it real.

### Phase 1: Bootstrap Project

**Scaffolding, core runtime, CLI.**

- Monorepo setup (pnpm workspaces, Turborepo, Biome)
- `@orgloop/core` — event bus (in-memory + file WAL), router, transform pipeline, logger fan-out
- `@orgloop/sdk` — plugin interfaces, base classes, test harnesses for connectors, transforms, loggers
- `@orgloop/cli` — `init`, `validate`, `plan`, `apply`, `stop`, `status`, `logs`, `test`
- YAML schema + JSON Schema validation
- Checkpoint persistence (file-based)
- Built-in transforms: `filter` (jq-based), `dedup`, shell script executor
- Built-in loggers: `file` (JSONL), `console`

**Exit criteria:** `orgloop init && orgloop validate && orgloop apply` works end-to-end with a mock connector.

### Phase 2: Migrate Bespoke Scripts

**Build GitHub, Linear, Claude Code, OpenClaw connectors.**

- `@orgloop/connector-github` — poll-based, PR activity, CI status
- `@orgloop/connector-linear` — poll-based, ticket state changes
- `@orgloop/connector-claude-code` — hook-based, exit notifications
- `@orgloop/connector-openclaw` — webhook target, agent wake
- `@orgloop/connector-webhook` — generic inbound/outbound
- Migrate each script one at a time: build → test → hard cut over → clean up
- Launch prompt delivery (`with.prompt_file`) working end-to-end

**Exit criteria:** Every existing bespoke script has been replaced by an OrgLoop connector. The old LaunchAgent plists are deleted.

### Phase 3: Operate on 🧬 OrgLoop

**Run Charlie's actual org on it. Validate.**

- Dog-food the system: run your actual engineering org entirely on OrgLoop
- Harden based on real-world failure modes (crash recovery, checkpoint drift, delivery retries)
- Tune transforms, refine SOPs, iterate on the route configuration
- Validate the success criteria: parity, latency, reliability, recovery, developer experience
- Build observability: `orgloop status` tells the full story of the org's operational health
- Publish `@orgloop/cli` to npm — the first public release

**Exit criteria:** 30 days of stable, unattended operation. Zero dropped events. Recovery from process crashes without manual intervention.

### Phase 4: Implement Modules

**Package the proven org as a publishable module.**

- Implement `kind: Module` and the parameterized template system
- Implement `orgloop add module <name>` → npm install + wire up
- Implement module composition rules (namespacing, dependency validation)
- Extract your proven engineering org into `@orgloop/module-engineering` — the reference module
- Publish first-party modules: `@orgloop/module-code-review`, `@orgloop/module-supervised-dev`
- Template parameter syntax refined from real-world usage in Phase 3

**Exit criteria:** `npm install @orgloop/module-engineering && orgloop add module engineering` scaffolds a working engineering org.

### Phase 5: Launch

**"Install my engineering organization right now."**

The killer demo: the manifesto ends with a live demonstration. You read the manifesto. You're convinced. Then:

```bash
npm install -g @orgloop/cli
orgloop init --template engineering
# Edit orgloop.yaml: your repo, your agent, your credentials
orgloop apply
```

Your engineering organization is running. GitHub events route to your agent. CI failures wake your supervisor. PR reviews trigger focused SOPs. Linear tickets flow through transforms. Everything is auditable, deterministic, and version-controlled.

That's the launch. That's what we're racing toward.

**Launch artifacts:**
- Published npm packages: `@orgloop/cli`, `@orgloop/core`, `@orgloop/sdk`, all first-party connectors and transforms
- Published modules: `@orgloop/module-engineering`, `@orgloop/module-code-review`
- Documentation site at orgloop.dev
- The manifesto, updated with the live demo
- Content series: blog posts, social, community launch

---

