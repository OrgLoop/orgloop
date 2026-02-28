# @orgloop/connector-opencode

Captures OpenCode session lifecycle events via a webhook handler. This connector exposes an HTTP endpoint that receives POST requests from OpenCode hook scripts (start + stop).

## Install

```bash
npm install @orgloop/connector-opencode
```

## Configuration

```yaml
sources:
  - id: opencode
    connector: "@orgloop/connector-opencode"
    config:
      secret: "${OPENCODE_WEBHOOK_SECRET}"      # optional — HMAC-SHA256 validation
      buffer_dir: "/tmp/orgloop-opencode"       # optional — persist events to disk
    poll:
      interval: "30s"    # how often to drain received webhook events
```

### Config options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `secret` | `string` | no | HMAC-SHA256 secret for validating incoming webhook signatures. Supports `${ENV_VAR}` syntax |
| `buffer_dir` | `string` | no | Directory for buffering received events to disk (JSONL). If set, events survive engine restarts |

## Events emitted

Events follow the normalized lifecycle contract in `event.payload.lifecycle` and `event.payload.session`.

Non-terminal phases emit `resource.changed`. Terminal phases emit `actor.stopped`.

### Event kind

| Platform event | Trigger | Description |
|---|---|---|
| `session.started` | OpenCode session starts | Session launched (start hook) |
| `session.completed` | OpenCode session ends with exit 0 | Session completed successfully |
| `session.failed` | OpenCode session ends with non-zero exit | Session failed |
| `session.stopped` | OpenCode session ends via signal | Session stopped/cancelled |

### Exit status mapping

| Exit Status | Phase | Outcome | Reason |
|-------------|-------|---------|--------|
| 0 | `completed` | `success` | `exit_code_0` |
| 1-127 | `failed` | `failure` | `exit_code_<N>` |
| 130 (SIGINT) | `stopped` | `cancelled` | `sigint` |
| 137 (SIGKILL) | `stopped` | `cancelled` | `sigkill` |
| 143 (SIGTERM) | `stopped` | `cancelled` | `sigterm` |
| 128+N (other) | `stopped` | `cancelled` | `signal_<N>` |

### Example event payload

```json
{
  "id": "evt_a1b2c3d4e5f67890",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "source": "opencode",
  "type": "actor.stopped",
  "provenance": {
    "platform": "opencode",
    "platform_event": "session.completed",
    "author": "opencode",
    "author_type": "bot",
    "session_id": "oc-sess-abc123",
    "working_directory": "/home/user/my-project"
  },
  "payload": {
    "lifecycle": {
      "phase": "completed",
      "terminal": true,
      "outcome": "success",
      "reason": "exit_code_0",
      "dedupe_key": "opencode:oc-sess-abc123:completed"
    },
    "session": {
      "id": "oc-sess-abc123",
      "adapter": "opencode",
      "harness": "opencode",
      "cwd": "/home/user/my-project",
      "ended_at": "2025-01-15T10:30:00.000Z",
      "exit_status": 0
    },
    "session_id": "oc-sess-abc123",
    "cwd": "/home/user/my-project",
    "duration_seconds": 75,
    "exit_status": 0,
    "summary": "Refactored auth module"
  }
}
```

### Webhook request format

POST a JSON body to the connector's webhook endpoint.

```json
{
  "session_id": "oc-sess-abc123",
  "cwd": "/home/user/my-project",
  "duration_seconds": 75,
  "exit_status": 0,
  "summary": "Refactored auth module",
  "model": "claude-sonnet"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | `string` | yes | OpenCode session identifier |
| `cwd` | `string` | no | Working directory of the session |
| `duration_seconds` | `number` | no | Session duration in seconds |
| `exit_status` | `number` | no | Process exit code (0 = success) |
| `summary` | `string` | no | Optional session summary text |
| `model` | `string` | no | Model used in the session |
| `hook_type` | `string` | no | `start` or `stop` (defaults to `stop`) |
| `timestamp` | `string` | no | Optional ISO 8601 timestamp |

## Example route

```yaml
routes:
  - name: opencode-exit-review
    when:
      source: opencode
      events:
        - actor.stopped
    then:
      actor: openclaw-agent
      config:
        session_key: "orgloop:opencode:session-review"
    with:
      prompt_file: sops/review-opencode-session.md
```

## Auth / prerequisites

- **No API tokens needed** — this connector receives events via HTTP webhook.
- An OpenCode **Stop hook** must be configured to POST session data to the OrgLoop webhook endpoint when a session exits.
- An optional **Start hook** can emit `session.started` events on session launch.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENCODE_WEBHOOK_SECRET` | No | HMAC-SHA256 secret for validating incoming webhook signatures |

## Limitations / known issues

- **Push-based, not polling** — this connector waits for inbound webhook requests. If the hook is not installed or fails silently, no events will be generated.
- **HMAC validation optional** — if `secret` is configured, signatures are validated. Without it, any POST is accepted.
- **Event buffer** — by default, events are held in memory until the next `poll()`. Configure `buffer_dir` to persist events to disk.
- **Only POST accepted** — non-POST requests receive a 405 response.
