# @orgloop/connector-github-webhook

Receives GitHub webhook POST deliveries for real-time event processing. Uses the same normalizer functions as the polling `@orgloop/connector-github` to produce identical OrgLoop events — but with zero latency instead of polling intervals.

## Install

```bash
npm install @orgloop/connector-github-webhook
```

## Configuration

```yaml
sources:
  - id: github-webhook
    connector: "@orgloop/connector-github-webhook"
    config:
      secret: "${GITHUB_WEBHOOK_SECRET}"   # HMAC-SHA256 secret (must match GitHub config)
      path: /webhook/github                # optional — defaults to source ID
      events:                              # optional — filter which events to process
        - pull_request.opened
        - pull_request.closed
        - pull_request.merged
        - pull_request.ready_for_review
        - pull_request.review_submitted
        - pull_request_review_comment
        - issue_comment
        - workflow_run.completed
        - check_suite.completed
      buffer_dir: /tmp/orgloop-buffers     # optional — persist events across restarts
    poll:
      interval: "30s"                      # drain interval for buffered webhook events
```

### Config options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `secret` | `string` | recommended | HMAC-SHA256 secret for signature validation. Supports `${ENV_VAR}` syntax |
| `path` | `string` | no | URL path for the webhook handler (default: derived from source ID) |
| `events` | `string[]` | no | Event types to accept (accepts all if omitted) |
| `buffer_dir` | `string` | no | Directory for persisting buffered events across restarts |

## Events emitted

All events are emitted as OrgLoop `resource.changed` type. Produces identical event payloads and provenance to `@orgloop/connector-github`.

### Supported event types

| OrgLoop event string | GitHub webhook event | OrgLoop type |
|---|---|---|
| `pull_request.review_submitted` | `pull_request_review` (submitted) | `resource.changed` |
| `pull_request_review_comment` | `pull_request_review_comment` | `resource.changed` |
| `issue_comment` | `issue_comment` | `resource.changed` |
| `pull_request.opened` | `pull_request` (opened) | `resource.changed` |
| `pull_request.closed` | `pull_request` (closed, not merged) | `resource.changed` |
| `pull_request.merged` | `pull_request` (closed, merged) | `resource.changed` |
| `pull_request.ready_for_review` | `pull_request` (ready_for_review) | `resource.changed` |
| `workflow_run.completed` | `workflow_run` (completed) | `resource.changed` |
| `check_suite.completed` | `check_suite` (completed) | `resource.changed` |

Unknown GitHub event types are emitted as raw `resource.changed` events with the full webhook payload.

## Coexistence with polling connector

Use both connectors for real-time delivery with polling as a fallback:

```yaml
sources:
  - id: github-webhook
    connector: "@orgloop/connector-github-webhook"
    config:
      secret: "${GITHUB_WEBHOOK_SECRET}"
    poll:
      interval: "30s"

  - id: github-poll
    connector: "@orgloop/connector-github"
    config:
      repo: "my-org/my-repo"
      token: "${GITHUB_TOKEN}"
      events:
        - pull_request.review_submitted
        - issue_comment
    poll:
      interval: "5m"
```

Use a dedup transform to avoid processing the same event twice.

## GitHub webhook setup

1. Go to your repository's **Settings → Webhooks → Add webhook**
2. Set **Payload URL** to your OrgLoop endpoint (e.g., `https://your-host:4800/webhook/github-webhook`)
3. Set **Content type** to `application/json`
4. Set **Secret** to your `GITHUB_WEBHOOK_SECRET` value
5. Select the events you want to receive (or choose "Send me everything")

## Signature validation

When `secret` is configured, the connector validates every incoming request using the `X-Hub-Signature-256` header (HMAC-SHA256). Requests with missing or invalid signatures are rejected with HTTP 401.

## Limitations

- **Requires inbound network access** — the OrgLoop HTTP server must be reachable from GitHub. For local development, use a tunnel service (ngrok, cloudflared, etc.).
- **No replay** — missed webhook deliveries while the server is down are not recovered. Pair with the polling connector for durability.
