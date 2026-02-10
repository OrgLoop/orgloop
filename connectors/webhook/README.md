# @orgloop/connector-webhook

Generic webhook connector providing both a **source** (inbound webhook receiver) and a **target** (outbound HTTP POST). Use it to integrate with any system that can send or receive HTTP webhooks.

## Install

```bash
npm install @orgloop/connector-webhook
```

## Source: Inbound Webhook Receiver

### Configuration

```yaml
sources:
  - id: webhook-inbound
    connector: "@orgloop/connector-webhook"
    config:
      secret: "${WEBHOOK_SECRET}"        # optional — HMAC-SHA256 secret for signature validation
      event_type_field: "type"           # optional — dot-path to extract event type from payload (default: "type")
    poll:
      interval: "30s"                    # how often to drain received webhook events
```

#### Source config options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `secret` | `string` | no | — | HMAC-SHA256 secret for validating signatures. Supports `${ENV_VAR}` syntax |
| `event_type_field` | `string` | no | `"type"` | Dot-notation path to extract a platform event type from the incoming JSON payload |

### Events emitted

Incoming webhooks are normalized to `resource.changed` events. The entire JSON body becomes the event `payload`.

```json
{
  "id": "evt_a1b2c3d4e5f67890",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "source": "webhook",
  "type": "resource.changed",
  "provenance": {
    "platform": "webhook",
    "platform_event": "deployment"
  },
  "payload": {
    "type": "deployment",
    "repo": "my-app",
    "status": "success"
  }
}
```

### Signature validation

If `secret` is configured, the connector validates incoming requests using HMAC-SHA256. It checks for signatures in these headers (in order):

1. `x-hub-signature-256` (GitHub-style)
2. `x-signature`

Expected format: `sha256=<hex-digest>`.

Requests with missing or invalid signatures receive a 401 response.

### Webhook endpoint

- **Method**: `POST` only (others get 405)
- **Content-Type**: `application/json`
- **Response**: `200 { "ok": true, "event_id": "evt_..." }` on success

---

## Target: Outbound HTTP Webhook

### Configuration

```yaml
actors:
  - id: webhook-notify
    connector: "@orgloop/connector-webhook"
    config:
      url: "https://example.com/hook"    # destination URL (required)
      method: "POST"                      # optional — POST or PUT (default: POST)
      headers:                            # optional — custom headers
        X-Custom-Header: "my-value"
      auth:                               # optional — authentication
        type: "bearer"                    # "bearer" or "basic"
        token: "${WEBHOOK_AUTH_TOKEN}"    # for bearer auth (env var ref)
```

#### Target config options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `url` | `string` | yes | — | Destination URL to POST/PUT events to |
| `method` | `string` | no | `"POST"` | HTTP method (`POST` or `PUT`) |
| `headers` | `object` | no | — | Custom HTTP headers to include |
| `auth.type` | `string` | no | — | Auth type: `"bearer"` or `"basic"` |
| `auth.token` | `string` | no | — | Bearer token (for `type: "bearer"`). Supports `${ENV_VAR}` |
| `auth.username` | `string` | no | — | Username (for `type: "basic"`). Supports `${ENV_VAR}` |
| `auth.password` | `string` | no | — | Password (for `type: "basic"`). Supports `${ENV_VAR}` |

### Delivery payload

The target sends a JSON body containing the full event and the resolved launch prompt:

```json
{
  "event": { "id": "evt_...", "type": "resource.changed", "..." : "..." },
  "launch_prompt": "Resolved prompt text from route's with.prompt_file"
}
```

### Delivery results

| HTTP Status | Result |
|-------------|--------|
| 2xx | `delivered` |
| 429 | `error` (rate limited, eligible for retry) |
| 4xx | `rejected` (client error, not retried) |
| 5xx | `error` (server error, eligible for retry) |
| Network error | `error` |

## Example route

```yaml
routes:
  - name: deploy-webhook-to-slack
    when:
      source: webhook-inbound
      events:
        - resource.changed
      filter:
        provenance.platform_event: deployment
    then:
      actor: webhook-notify
```

## Auth / prerequisites

- **Source**: No tokens needed. Optionally configure a shared secret for HMAC validation.
- **Target**: Depends on the destination. Configure `auth` if the endpoint requires it.

## Limitations / known issues

- **Source is push-based** -- Events are buffered in memory until the next `poll()` call drains them. A crash between receipt and poll loses events.
- **No batching** -- The target sends one HTTP request per event.
- **No custom body templates** -- The target always sends `{ event, launch_prompt }`. For custom payload shapes, use a transform before delivery.
- **Nested event type extraction** -- The `event_type_field` supports dot-notation (e.g., `"data.event_type"`) for extracting the platform event type from deeply nested payloads.
