# 🧬 OrgLoop

**Organization as Code — declarative event routing for autonomous AI organizations.**

> You don't need reliable actors if you have a reliable system around them.

AI agents forget, idle, rabbit-hole, drop context. OrgLoop doesn't fix the agents — it makes the *system* reliable. When a resource changes state, the right actor is woken with the right context. When that actor finishes, its completion is itself an event, routed to the next actor. **The org loops.**

```
Source → [Transform] → Route → Actor
   ↑                              |
   └──── actor.idle/complete ─────┘
```

---

## ⚡ Quick Demo

```bash
orgloop init --template engineering
orgloop validate           # Check config + references
orgloop plan               # Preview what will run
orgloop apply              # Start the runtime
orgloop status             # See everything flowing
```

```
OrgLoop — my-org (running, uptime 3h 22m)

Sources:
  github        poll/5m    47 events (24h)
  linear        poll/5m    12 events (24h)
  claude-code   hook        3 events (24h)

Routes:
  github-to-engineering       45 matched, 2 dropped, 0 errors
  linear-to-project           12 matched, 0 errors
  claude-code-to-supervisor    3 matched, 0 errors
```

---

## 📐 Five Primitives

Your entire org topology in one file:

```yaml
# orgloop.yaml
sources:
  - id: github
    connector: "@orgloop/connector-github"
    config: { repo: "my-org/my-repo", poll_interval: 5m }

  - id: claude-code
    connector: "@orgloop/connector-claude-code"
    config: { hook_type: post-exit }

actors:
  - id: engineering-agent
    connector: "@orgloop/connector-openclaw"
    config: { agent: engineering }

routes:
  - name: github-to-engineering
    when: { source: github, event: resource.changed }
    transforms:
      - transforms/drop-bot-noise.sh
      - transforms/injection-scanner.sh
    then: { target: engineering-agent }

  - name: claude-code-to-supervisor
    when: { source: claude-code, event: actor.idle }
    then: { target: engineering-agent }

loggers:
  - id: file-log
    type: file
    config: { path: ./logs/orgloop.log, format: jsonl }
```

**Sources** emit events. **Actors** do work. **Routes** wire them. **Transforms** filter/enrich. **Loggers** observe everything.

---

## ✨ Why OrgLoop

- **Event-driven, not cron-driven** — actors wake when something happens, not on a timer
- **Declarative topology** — your org's wiring lives in version control
- **Recursive loop** — actor completion feeds back as events, triggering the next cycle
- **Pluggable everything** — swap GitHub for GitLab, OpenClaw for a custom agent
- **Transforms for security** — injection scanning, bot noise filtering, rate limiting
- **Full observability** — every event, transform, delivery logged and traceable
- **One process replaces N pollers** — no more scattered LaunchAgents and cron jobs
- **`plan` before `apply`** — see exactly what will change (Terraform-style)

---

## 🚀 Getting Started

```bash
# Install
npm install -g orgloop

# Scaffold a project
orgloop init --template engineering

# Validate, plan, apply
orgloop validate
orgloop plan
orgloop apply

# Run as a system service
orgloop install-service
orgloop service start
```

📖 **[Full CLI Walkthrough →](docs/cli-walkthrough.md)**

---

## 🧪 Test & Debug

```bash
# Inject a test event and trace its path
orgloop test event.json

# Inspect any primitive
orgloop inspect source github
orgloop inspect route github-to-engineering

# Tail logs with filters
orgloop logs --source github --since 2h
```

---

## 📊 Status

**Pre-alpha.** The concepts behind OrgLoop have been running in production since January 2026 — managing a real engineering organization with GitHub, Linear, Claude Code, and OpenClaw. The framework is being extracted and formalized from that battle-tested system.

Not yet published. Star/watch for updates.

## 📄 License

[Business Source License 1.1](LICENSE.md) — converts to Apache 2.0 after 3 years.
