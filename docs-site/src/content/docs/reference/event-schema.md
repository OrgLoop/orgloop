---
title: Event Schema
description: Complete JSON Schema reference for OrgLoop events.
---

All events in OrgLoop share a common **envelope format**. The envelope is generic — it carries metadata about where an event came from, what kind of event it is, and who caused it. The payload is connector-specific freeform JSON.

## Event Envelope Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique event identifier. Always prefixed with `evt_` followed by alphanumeric characters. |
| `timestamp` | string | Yes | ISO 8601 timestamp in UTC indicating when the event was created. |
| `source` | string | Yes | The ID of the source connector that emitted this event. Matches the `id` field in your source definition YAML. |
| `type` | string | Yes | One of three event types: `resource.changed`, `actor.stopped`, `message.received`. |
| `provenance` | object | Yes | Origin metadata — connector-specific details about who caused the event and on what platform. |
| `payload` | object | No | Connector-specific event data. Freeform JSON. Each connector defines its own payload shape. |
| `trace_id` | string | No | Trace identifier for end-to-end pipeline tracing. Prefixed with `trc_`. Added by the engine at ingestion time. |

### ID Formats

OrgLoop uses two prefixed identifier formats:

- **Event IDs** — `evt_` prefix followed by alphanumeric characters (e.g., `evt_a1b2c3d4`). Every event gets a unique ID at creation time.
- **Trace IDs** — `trc_` prefix followed by alphanumeric characters (e.g., `trc_x9y8z7w6`). Groups all pipeline log entries for a single event's journey through the system.

Use `orgloop logs --event <id>` to trace a specific event through the pipeline.

## Event Types

OrgLoop defines exactly three event types. This is minimal by design and always additive — new types may be added in future versions, but existing types will not change meaning.

### `resource.changed`

Something changed in an external system. A PR was reviewed, a ticket moved, CI completed, a deploy finished. This is the most common event type — it represents any meaningful state change in a source system that should trigger a response.

### `actor.stopped`

An actor's session ended. This type is **deliberately neutral** — OrgLoop observes that a session ended, but makes no claim about whether work was completed successfully, the agent crashed, got stuck, or produced incorrect output. The payload carries whatever details the source connector provides (exit status, duration, summary), and the *receiving* actor decides what it means.

This neutrality is a design choice. OrgLoop routes signals; actors have opinions.

### `message.received`

A human or system sent a message. This covers direct messages, chat commands, manual triggers, and system notifications that don't represent a state change but do represent intent.

## Provenance Object

The `provenance` object carries origin metadata. The `platform` field is required; all others are optional but strongly recommended.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `platform` | string | Yes | The external platform that originated the event (e.g., `github`, `linear`, `claude-code`). |
| `platform_event` | string | No | The original event type on that platform (e.g., `pull_request.review_submitted`, `issue.state_change`). |
| `author` | string | No | Who caused the event (username, bot name, or system identifier). |
| `author_type` | string | No | Classification of the author: `team_member`, `external`, `bot`, `system`, or `unknown`. |

The provenance object allows `additionalProperties`, so connectors can include extra context-specific fields (e.g., `session_id`, `working_directory` for Claude Code events).

## Payload

The `payload` is connector-specific freeform JSON. Each connector defines its own payload shape, and consumers should not assume payload shapes from other connectors.

Examples of payload content by connector:
- **GitHub:** `pr_number`, `action`, `review_state`, `repo`, `comment_body`
- **Linear:** `issue_id`, `identifier`, `title`, `state`, `previous_state`
- **Claude Code:** `session_id`, `working_directory`, `duration_seconds`, `exit_status`, `summary`

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://orgloop.dev/schemas/event/v1alpha1",
  "title": "OrgLoop Event",
  "type": "object",
  "required": ["id", "timestamp", "source", "type", "provenance"],
  "properties": {
    "id": {
      "type": "string",
      "pattern": "^evt_[a-zA-Z0-9]+$",
      "description": "Unique event identifier"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp (UTC)"
    },
    "source": {
      "type": "string",
      "description": "Source connector ID"
    },
    "type": {
      "type": "string",
      "enum": ["resource.changed", "actor.stopped", "message.received"],
      "description": "OaC event type"
    },
    "provenance": {
      "type": "object",
      "required": ["platform"],
      "properties": {
        "platform": { "type": "string" },
        "platform_event": { "type": "string" },
        "author": { "type": "string" },
        "author_type": {
          "type": "string",
          "enum": ["team_member", "external", "bot", "system", "unknown"]
        }
      },
      "additionalProperties": true
    },
    "payload": {
      "type": "object",
      "description": "Source-specific event data",
      "additionalProperties": true
    },
    "trace_id": {
      "type": "string",
      "pattern": "^trc_[a-zA-Z0-9]+$",
      "description": "Trace ID grouping all pipeline entries for this event"
    }
  }
}
```

## Example Events

### `resource.changed` — GitHub PR Review

```json
{
  "id": "evt_a1b2c3d4",
  "timestamp": "2026-02-08T20:47:00.000Z",
  "source": "github",
  "type": "resource.changed",
  "trace_id": "trc_x9y8z7w6",
  "provenance": {
    "platform": "github",
    "platform_event": "pull_request.review_submitted",
    "author": "alice",
    "author_type": "team_member"
  },
  "payload": {
    "pr_number": 42,
    "action": "review_submitted",
    "review_state": "changes_requested",
    "repo": "my-org/my-repo"
  }
}
```

### `actor.stopped` — Claude Code Session Exited

```json
{
  "id": "evt_e5f6g7h8",
  "timestamp": "2026-02-08T23:12:00.000Z",
  "source": "claude-code",
  "type": "actor.stopped",
  "trace_id": "trc_m4n5o6p7",
  "provenance": {
    "platform": "claude-code",
    "platform_event": "session.exited",
    "author": "claude-code",
    "author_type": "bot",
    "session_id": "sess_abc123",
    "working_directory": "/home/user/my-repo"
  },
  "payload": {
    "session_id": "sess_abc123",
    "working_directory": "/home/user/my-repo",
    "duration_seconds": 847,
    "exit_status": 0,
    "summary": "Addressed PR review comments and pushed fixes"
  }
}
```

### `message.received` — Manual Trigger

```json
{
  "id": "evt_i9j0k1l2",
  "timestamp": "2026-02-09T10:30:00.000Z",
  "source": "webhook",
  "type": "message.received",
  "trace_id": "trc_q8r9s0t1",
  "provenance": {
    "platform": "slack",
    "platform_event": "message",
    "author": "charlie",
    "author_type": "team_member"
  },
  "payload": {
    "channel": "#engineering",
    "text": "deploy staging",
    "thread_ts": "1707472200.000100"
  }
}
```

## Event Pipeline Flow

Every event follows the same path through the system:

```
Source.poll() / webhook()
       |
       v
   EventBus          (event ingested, trace_id assigned)
       |
       v
  matchRoutes()      (dot-path filtering, multi-route matching)
       |
       v
  Transform Pipeline (sequential: filter, dedup, custom scripts)
       |
       v
  Actor.deliver()    (event + route config + launch prompt)
       |
       v
  actor.stopped      (completion event fed back into EventBus)
```

The final step is what makes the system recursive: when an actor finishes work, its completion is itself an `actor.stopped` event that flows back through the bus and can trigger other routes. This is the defining loop in OrgLoop.
