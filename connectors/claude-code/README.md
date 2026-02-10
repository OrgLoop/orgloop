# @orgloop/connector-claude-code

Captures Claude Code session exit events via a webhook handler. Instead of polling an external API, this connector exposes an HTTP endpoint that receives POST requests from a Claude Code post-exit hook script.

## Install

```bash
npm install @orgloop/connector-claude-code
```

## Configuration

```yaml
sources:
  - id: claude-code
    connector: "@orgloop/connector-claude-code"
    config: {}
    poll:
      interval: "30s"    # how often to drain received webhook events
```

This connector has no required config fields. The `poll.interval` controls how frequently accumulated webhook events are drained into the event pipeline.

## Events emitted

Events are emitted as OrgLoop `actor.stopped` type.

### Event kind

| Platform event | Trigger | Description |
|---|---|---|
| `session.exited` | Claude Code session ends | A Claude Code session has exited, delivered via webhook |

### Example event payload

```json
{
  "id": "evt_a1b2c3d4e5f67890",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "source": "claude-code",
  "type": "actor.stopped",
  "provenance": {
    "platform": "claude-code",
    "platform_event": "session.exited",
    "author": "claude-code",
    "author_type": "bot",
    "session_id": "sess-abc123",
    "working_directory": "/home/user/my-project"
  },
  "payload": {
    "session_id": "sess-abc123",
    "working_directory": "/home/user/my-project",
    "duration_seconds": 120,
    "exit_status": 0,
    "summary": "Implemented auth module and added tests"
  }
}
```

### Webhook request format

POST a JSON body to the connector's webhook endpoint:

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
| `working_directory` | `string` | yes | Working directory of the session |
| `duration_seconds` | `number` | yes | Session duration in seconds |
| `exit_status` | `number` | yes | Process exit code (0 = success) |
| `summary` | `string` | no | Optional session summary text |
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
- The connector registration includes setup metadata for the hook. You can install it with:
  ```bash
  orgloop hook claude-code-stop
  ```
  This registers a post-exit hook in Claude Code's settings that sends session data to OrgLoop.

## Limitations / known issues

- **Push-based, not polling** -- Unlike the GitHub and Linear connectors, this connector does not poll an external API. It waits for inbound webhook requests. If the hook is not installed or fails silently, no events will be generated.
- **No HMAC validation** -- The webhook endpoint does not validate request signatures. Protect it behind a firewall or reverse proxy if exposed to untrusted networks.
- **In-memory event buffer** -- Received webhook events are held in memory until the next `poll()` drains them. If the engine crashes between webhook receipt and poll, those events are lost.
- **Only POST accepted** -- Non-POST requests receive a 405 response.
