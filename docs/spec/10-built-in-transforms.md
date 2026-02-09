## 10. Built-in Transforms

### 10.1 Transform Interface: Dual-Mode

OrgLoop supports two transform modes:

1. **Script transforms** — shell scripts following the stdin/stdout contract from DESIGN.md. This is the primary mode. It's simple, language-agnostic, and debuggable.

2. **Package transforms** — TypeScript classes implementing the `Transform` interface from `@orgloop/sdk`. For performance-sensitive or complex transforms that benefit from in-process execution.

Script transforms are the default. Package transforms are an optimization path.

### 10.2 Script Transform Contract (Canonical)

```
┌────────────────────────────────────────────────────────────┐
│                  Script Transform                           │
│                                                            │
│  Environment variables:                                    │
│    $ORGLOOP_SOURCE      — source ID                        │
│    $ORGLOOP_TARGET      — target actor ID                  │
│    $ORGLOOP_EVENT_TYPE  — event type string                 │
│    $ORGLOOP_EVENT_ID    — event ID                          │
│    $ORGLOOP_ROUTE       — route name                        │
│                                                            │
│  stdin:  Full event JSON                                   │
│  stdout: Modified event JSON → event continues              │
│          Empty → event is dropped                           │
│  exit 0: Success (check stdout for pass/drop)               │
│  exit 1: Event is dropped (explicit filter)                 │
│  exit 2+: Transform error (event is NOT dropped,            │
│           logged as error, event continues)                  │
│                                                            │
│  Timeout: 30s default (configurable per-transform)          │
└────────────────────────────────────────────────────────────┘
```

**Important design decision:** Exit code ≥ 2 means a transform *error*, not a filter. This prevents a buggy transform from silently dropping events. If the injection scanner crashes, the event should continue (fail-open for availability) and the error should be loudly logged.

### 10.3 Proposed Built-in Transforms

#### Security

**`@orgloop/transform-injection-scanner`**

Scans event payloads for prompt injection patterns. Lightweight heuristic-based (not LLM-based — transforms should be fast and deterministic).

```yaml
transforms:
  - ref: injection-scanner
    config:
      action: tag           # "tag" (add warning) or "drop" (filter event)
      patterns: default     # Use built-in pattern set
      # custom_patterns:    # Additional patterns
      #   - "ignore previous instructions"
      #   - "system prompt"
```

Detection patterns:
- Known injection prefixes ("ignore previous", "system:", "you are now")
- Unicode obfuscation (homoglyphs, invisible characters)
- Excessive special characters in text fields
- Base64-encoded suspicious content

On detection: adds `provenance.security.injection_risk: true` to the event (tag mode) or drops it (drop mode).

**`@orgloop/transform-sanitizer`**

Strips or redacts sensitive data from event payloads before delivery.

```yaml
transforms:
  - ref: sanitizer
    config:
      redact:
        - "payload.**.password"
        - "payload.**.secret"
        - "payload.**.token"
      strip_html: true
      max_payload_size: 100KB
```

#### Filtering

**`@orgloop/transform-filter`**

General-purpose jq-based filter. The workhorse transform.

```yaml
transforms:
  - ref: filter
    config:
      # jq expression — must return truthy for event to pass
      jq: '.provenance.author_type == "team_member"'

  - ref: filter
    config:
      # Or use simple field matching
      match:
        provenance.author_type: team_member
        type: resource.changed

  - ref: filter
    config:
      # Exclude patterns
      exclude:
        provenance.author:
          - "dependabot[bot]"
          - "renovate[bot]"
```

Depends on `jq` being available on the system (it's everywhere). For the `match`/`exclude` syntax, the filter is implemented in TypeScript (no jq dependency).

**`@orgloop/transform-dedup`**

Deduplicates events within a configurable window.

```yaml
transforms:
  - ref: dedup
    config:
      # Deduplicate on these fields
      key:
        - source
        - type
        - payload.pr_number
      window: 5m             # Time window for dedup
      store: memory          # "memory" or "file" (for persistence across restarts)
```

**`@orgloop/transform-rate-limit`**

Rate-limits events per source, per route, or per custom key.

```yaml
transforms:
  - ref: rate-limit
    config:
      max: 10
      window: 1m
      key: source            # Rate limit per source
      # key: "payload.pr_number"  # Rate limit per PR
      action: drop           # "drop" or "delay" (queue and release later)
```

#### Enrichment

**`@orgloop/transform-timestamp`**

Normalizes timestamps across sources to a canonical format and adds processing metadata.

```yaml
transforms:
  - ref: timestamp
    config:
      normalize_to: UTC
      add_fields:
        processed_at: now
        processing_delay_ms: auto   # Time between event timestamp and processing
```

This transform is lightweight but valuable — it ensures all events have consistent timestamp formats regardless of source platform.

**`@orgloop/transform-metadata`**

Injects additional metadata into events.

```yaml
transforms:
  - ref: metadata
    config:
      add:
        environment: production
        orgloop_version: auto
        hostname: auto
```

#### Domain-Specific

**GitHub Event Normalizer** (built into `@orgloop/connector-github`)

Not a standalone transform — event normalization is the connector's responsibility. The GitHub connector maps:

```
pull_request.review_submitted    → resource.changed
pull_request_review_comment      → resource.changed
issue_comment (on PR)            → resource.changed
pull_request.closed/merged       → resource.changed
workflow_run.completed (failure)  → actor.error
```

And populates:
```json
{
  "provenance": {
    "platform": "github",
    "platform_event": "pull_request.review_submitted",
    "author": "brandonchoe",
    "author_type": "team_member",
    "repo": "my-org/my-repo",
    "pr_number": 1234,
    "url": "https://github.com/..."
  }
}
```

**Linear Event Normalizer** (built into `@orgloop/connector-linear`)

Maps Linear GraphQL responses:
```
issue.updated (state change)     → resource.changed
issue.updated (comment added)    → resource.changed
issue.created                    → resource.changed
```

And populates:
```json
{
  "provenance": {
    "platform": "linear",
    "platform_event": "issue.updated",
    "author": "Charlie Hulcher",
    "author_type": "team_member",
    "issue_id": "ENG-123",
    "state": "In Review",
    "url": "https://linear.app/..."
  }
}
```

---

