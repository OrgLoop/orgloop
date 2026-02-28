---
title: "Lifecycle Event Contract"
description: "Normalized lifecycle event contract for coding harness connectors — phases, outcomes, session identity, and conformance requirements."
---

All coding harness connectors (claude-code, codex, opencode, pi, pi-rust, and any connector polling via agent-ctl) **MUST** include the normalized lifecycle payload in their events. This enables harness-agnostic routing, supervision, and automation.

## Design Rationale

Without normalization, downstream routes and SOPs must be harness-specific — different event types, different payload shapes, different terminal semantics. The lifecycle contract solves this by requiring a shared payload shape alongside any connector-specific fields.

**Key principles:**
- **Additive.** The lifecycle payload lives inside `event.payload.lifecycle` and `event.payload.session`, alongside existing fields. Backward compatibility preserved.
- **Type-consistent.** Non-terminal phases emit `resource.changed`. Terminal phases emit `actor.stopped`. This preserves OrgLoop's 3-type event model.
- **Neutral.** Like `actor.stopped` itself, the contract observes state — it doesn't interpret intent. The `outcome` field records what happened, not what should happen next.

## Lifecycle Phases

| Phase | Terminal | Event Type | Description |
|-------|----------|------------|-------------|
| `started` | No | `resource.changed` | Session launched, harness process running |
| `active` | No | `resource.changed` | Session actively processing (tool calls, edits) |
| `completed` | Yes | `actor.stopped` | Session ended normally (work finished) |
| `failed` | Yes | `actor.stopped` | Session ended with error (crash, non-zero exit) |
| `stopped` | Yes | `actor.stopped` | Session ended by external action (cancel, signal) |

## Terminal Outcomes

Required when `lifecycle.terminal` is `true`:

| Outcome | Meaning |
|---------|---------|
| `success` | Work completed as intended (exit 0, task done) |
| `failure` | Work failed (non-zero exit, crash, timeout) |
| `cancelled` | Session stopped by user or system before completion |
| `unknown` | Terminal state reached but cause is unclear |

## Payload Shape

```yaml
payload:
  lifecycle:
    phase: started|active|completed|failed|stopped
    terminal: true|false
    outcome: success|failure|cancelled|unknown   # required when terminal
    reason: string                               # optional machine reason
    dedupe_key: string                           # stable per transition
  session:
    id: string                                   # session identifier
    adapter: string                              # adapter/harness adapter name
    harness: claude-code|codex|opencode|pi|pi-rust|other
    cwd: string                                  # working directory (optional)
    started_at: string                           # ISO 8601 (optional)
    ended_at: string                             # ISO 8601, terminal only
    exit_status: number                          # process exit code, terminal only
  # ... connector-specific fields preserved alongside
```

## Provenance Requirements

All lifecycle events MUST include:
- `provenance.platform` — connector platform (e.g., `"claude-code"`, `"agent-ctl"`)
- `provenance.platform_event` — `session.<phase>` (e.g., `"session.started"`, `"session.completed"`)

## Dedupe Key

The `dedupe_key` prevents duplicate delivery of the same lifecycle transition. Format: `<harness>:<session_id>:<phase>`.

Examples:
- `claude-code:sess-123:started`
- `claude-code:sess-123:completed`
- `codex:sess-456:failed`

## Exit Status Mapping (Claude Code)

| Exit Status | Phase | Outcome | Reason |
|-------------|-------|---------|--------|
| 0 | `completed` | `success` | `exit_code_0` |
| 1-127 | `failed` | `failure` | `exit_code_<N>` |
| 130 (SIGINT) | `stopped` | `cancelled` | `sigint` |
| 137 (SIGKILL) | `stopped` | `cancelled` | `sigkill` |
| 143 (SIGTERM) | `stopped` | `cancelled` | `sigterm` |
| 128+N (other) | `stopped` | `cancelled` | `signal_<N>` |

## Agent-Ctl Status Mapping

| agent-ctl Status | Phase | Outcome | Reason |
|------------------|-------|---------|--------|
| `running` (new) | `started` | — | — |
| `idle` (from running) | `active` | — | `idle` |
| `running` (from idle) | `active` | — | `running` |
| `stopped` | `stopped` | `unknown` | `session_stopped` |
| `error` | `failed` | `failure` | `session_error` |
| (disappeared) | `stopped` | `unknown` | `session_stopped` |

## Harness Type Resolution

Known harness identifiers: `claude-code`, `codex`, `opencode`, `pi`, `pi-rust`, `other`.

For agent-ctl, the harness is resolved from the adapter name. Unknown adapters map to `other`.

## SDK Types

The contract is defined in `@orgloop/sdk`:

```typescript
import type {
  LifecyclePayload,
  LifecyclePhase,
  LifecycleOutcome,
  LifecycleState,
  SessionInfo,
  HarnessType,
} from '@orgloop/sdk';

import {
  validateLifecycleEvent,
  validateLifecyclePayload,
  assertLifecycleConformance,  // test helper — throws on invalid
  createLifecycleEvent,        // test factory
  eventTypeForPhase,
  buildDedupeKey,
  TERMINAL_PHASES,
  NON_TERMINAL_PHASES,
} from '@orgloop/sdk';
```

## Conformance Testing

All lifecycle connectors MUST pass the conformance assertion for every event they emit:

```typescript
import { assertLifecycleConformance } from '@orgloop/sdk';

// In your connector tests:
const events = await source.poll(null);
for (const event of events.events) {
  assertLifecycleConformance(event);
}
```

The assertion validates:
1. `payload.lifecycle` shape (phase, terminal, outcome, dedupe_key)
2. `payload.session` shape (id, adapter, harness)
3. Phase/terminal consistency (terminal phases must have `terminal: true`)
4. Outcome requirement (terminal events must have an outcome)
5. Event type consistency (terminal → `actor.stopped`, non-terminal → `resource.changed`)

## Harness-Agnostic Route Example

```yaml
routes:
  # Route any harness completion to a review agent
  - name: harness-session-review
    when:
      source: my-agents
      events:
        - actor.stopped
    transforms:
      - ref: filter-lifecycle
        config:
          match:
            payload.lifecycle.phase: completed
    then:
      actor: review-agent

  # Route any harness failure to an escalation agent
  - name: harness-failure-escalate
    when:
      source: my-agents
      events:
        - actor.stopped
    transforms:
      - ref: filter-lifecycle
        config:
          match:
            payload.lifecycle.outcome: failure
    then:
      actor: escalation-agent
```

## Connector Coverage Matrix

| Connector | started | active | completed | failed | stopped | Conformance |
|-----------|---------|--------|-----------|--------|---------|-------------|
| claude-code | Yes | — | Yes | Yes | Yes | Tested |
| agent-ctl | Yes | Yes | — | Yes | Yes | Tested |
| codex | — | — | — | — | — | Planned (#69) |
| opencode | — | — | — | — | — | Planned (#70) |
| pi | — | — | — | — | — | Planned (#71) |
| pi-rust | — | — | — | — | — | Planned (#72) |
