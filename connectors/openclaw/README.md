# @orgloop/connector-openclaw

Delivers OrgLoop events to an OpenClaw agent via HTTP webhook. This is a **target-only** connector — it delivers events from OrgLoop to OpenClaw (via POST to the OpenClaw API). It does not act as a source.

## Install

```bash
npm install @orgloop/connector-openclaw
```

## Configuration

```yaml
actors:
  - id: openclaw-agent
    connector: "@orgloop/connector-openclaw"
    config:
      base_url: "http://127.0.0.1:18789"   # OpenClaw API base URL (default)
      agent_id: "my-agent"                   # optional — target agent identifier
      auth_token_env: "${OPENCLAW_TOKEN}"    # optional — bearer token (env var ref)
      default_channel: "engineering"          # optional — default delivery channel
      default_to: "team-lead"                # optional — default recipient
```

### Config options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `base_url` | `string` | no | `http://127.0.0.1:18789` | OpenClaw API base URL |
| `agent_id` | `string` | no | — | Target agent identifier |
| `auth_token_env` | `string` | no | — | Bearer token for auth. Supports `${ENV_VAR}` syntax |
| `default_channel` | `string` | no | — | Default channel for message delivery |
| `default_to` | `string` | no | — | Default recipient for message delivery |

## Events accepted

This connector accepts any OrgLoop event type and delivers it to the OpenClaw `/hooks/agent` endpoint.

### Delivery payload

The connector builds a message string from the event and sends it as:

```json
{
  "message": "[github:my-org/repo] resource.changed (pull_request.merged) by alice | action, pr_title, pr_number\n\nReview this PR",
  "sessionKey": "hook:github:pr-review:engineering",
  "agentId": "my-agent",
  "wakeMode": "now",
  "deliver": true,
  "channel": "engineering",
  "to": "team-lead"
}
```

### Route delivery config

These fields can be set in the route's `then.config`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `session_key` | `string` | `orgloop:<source>:<type>` | OpenClaw session key |
| `wake_mode` | `string` | `"now"` | When to wake the agent (`"now"`, etc.) |
| `deliver` | `boolean` | `false` | Whether to deliver the message to a channel |
| `launch_prompt` | `string` | — | Resolved from route's `with.prompt_file`; appended to the message |

## Example route

```yaml
routes:
  - name: pr-merged-wake-agent
    when:
      source: github-eng
      events:
        - resource.changed
      filter:
        provenance.platform_event: pull_request.merged
    then:
      actor: openclaw-agent
      config:
        session_key: "hook:github:pr-merged:engineering"
        wake_mode: "now"
        deliver: true
    with:
      prompt_file: sops/review-merged-pr.md
```

## Auth / prerequisites

- An **OpenClaw instance** running and reachable at the configured `base_url`.
- If auth is enabled on the OpenClaw instance, set a bearer token as an environment variable and reference it via `auth_token_env`.

## Limitations / known issues

- **Message format is fixed** -- The connector builds a single-string message from the event's source, type, provenance, and top-3 payload keys. It does not forward the full structured event.
- **No retry logic** -- The connector reports `error` status on 429/5xx responses and `rejected` on 4xx, but does not retry internally. Retries are handled by the OrgLoop delivery pipeline if configured on the route.
- **Local default** -- The default `base_url` points to `127.0.0.1:18789` which assumes OpenClaw is running locally.
