# @orgloop/connector-claude-code

Captures Claude Code session lifecycle events via a webhook handler. Instead of polling an external API, this connector exposes an HTTP endpoint that receives POST requests from Claude Code hook scripts (start + stop).

## Install

```bash
npm install @orgloop/connector-claude-code
```

## Configuration

```yaml
sources:
  - id: claude-code
    connector: "@orgloop/connector-claude-code"
    config:
      secret: "${CLAUDE_CODE_WEBHOOK_SECRET}"  # optional — HMAC-SHA256 validation
      buffer_dir: "/tmp/orgloop-claude-code"   # optional — persist events to disk
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
| `session.started` | Claude Code session starts | Session launched (start hook) |
| `session.completed` | Claude Code session ends with exit 0 | Session completed successfully |
| `session.failed` | Claude Code session ends with non-zero exit | Session failed |
| `session.stopped` | Claude Code session ends via signal | Session stopped/cancelled |

### Example event payload

```json
{
  "id": "evt_a1b2c3d4e5f67890",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "source": "claude-code",
  "type": "actor.stopped",
  "provenance": {
    "platform": "claude-code",
    "platform_event": "session.completed",
    "author": "claude-code",
    "author_type": "bot",
    "session_id": "sess-abc123",
    "working_directory": "/home/user/my-project"
  },
  "payload": {
    "lifecycle": {
      "phase": "completed",
      "terminal": true,
      "outcome": "success",
      "reason": "exit_code_0",
      "dedupe_key": "claude-code:sess-abc123:completed"
    },
    "session": {
      "id": "sess-abc123",
      "adapter": "claude-code",
      "harness": "claude-code",
      "cwd": "/home/user/my-project",
      "started_at": "2025-01-15T10:28:00.000Z",
      "ended_at": "2025-01-15T10:30:00.000Z",
      "exit_status": 0
    },
    "session_id": "sess-abc123",
    "working_directory": "/home/user/my-project",
    "duration_seconds": 120,
    "exit_status": 0,
    "summary": "Implemented auth module and added tests"
  }
}
```

### Webhook request format

POST a JSON body to the connector's webhook endpoint. The same format is used for start and stop hooks.

```json
{
  "session_id": "sess-abc123",
  "working_directory": "/home/user/my-project",
  "duration_seconds": 120,
  "exit_status": 0,
  "summary": "Implemented auth module and added tests"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | `string` | yes | Claude Code session identifier |
| `working_directory` | `string` | no | Working directory of the session |
| `cwd` | `string` | no | Alias for `working_directory` |
| `duration_seconds` | `number` | no | Session duration in seconds |
| `exit_status` | `number` | no | Process exit code (0 = success) |
| `summary` | `string` | no | Optional session summary text |
| `hook_type` | `string` | no | `start` or `stop` (defaults to `stop`) |
| `timestamp` | `string` | no | Optional ISO 8601 timestamp |

## Example route

```yaml
routes:
  - name: claude-code-exit-review
    when:
      source: claude-code
      events:
        - actor.stopped
    then:
      actor: openclaw-agent
      config:
        session_key: "orgloop:claude-code:session-review"
    with:
      prompt_file: sops/review-claude-session.md
```

## Auth / prerequisites

- **No API tokens needed** -- this connector receives events via HTTP webhook.
- A Claude Code **Stop hook** must be configured to POST session data to the OrgLoop webhook endpoint when a session exits.
- An optional **Start hook** can emit `session.started` events on session launch.
- The connector registration includes setup metadata for both hooks. You can install them with:
  ```bash
  orgloop hook claude-code-stop
  orgloop hook claude-code-start
  ```
  This registers hooks in Claude Code's settings that send session data to OrgLoop.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_WEBHOOK_SECRET` | No | HMAC-SHA256 secret for validating incoming webhook signatures |

## Limitations / known issues

- **Push-based, not polling** -- Unlike the GitHub and Linear connectors, this connector does not poll an external API. It waits for inbound webhook requests. If the hook is not installed or fails silently, no events will be generated.
- **HMAC validation optional** -- If `secret` is configured, signatures are validated via `X-Hub-Signature-256` or `X-Signature` headers. Without it, any POST is accepted.
- **Event buffer** -- By default, events are held in memory until the next `poll()` drains them. Configure `buffer_dir` to persist events to disk and survive engine restarts.
- **Only POST accepted** -- Non-POST requests receive a 405 response.
