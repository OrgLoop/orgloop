# @orgloop/transform-dedup

Deduplicates events within a configurable time window. Events with the same key hash seen within the window are dropped; the first occurrence passes through.

## Install

```bash
npm install @orgloop/transform-dedup
```

## Configuration

```yaml
transforms:
  - name: dedup-5m
    type: package
    package: "@orgloop/transform-dedup"
    config:
      key:                                # fields used to build the dedup hash
        - source
        - type
        - provenance.platform_event
        - payload.pr_number
      window: "5m"                        # time window for dedup (default: 5m)
      store: "memory"                     # storage backend (only "memory" for now)
```

### Config options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `key` | `string[]` | yes | `["source", "type", "id"]` | Dot-path fields used to build the dedup hash. Values are concatenated and SHA-256 hashed |
| `window` | `string` | yes | `"5m"` | Duration window. Supported units: `ms`, `s`, `m`, `h`, `d` |
| `store` | `string` | no | `"memory"` | Storage backend. Only `"memory"` is supported in the current version |

### How it works

1. For each incoming event, the transform extracts values at the configured `key` field paths.
2. The values are concatenated (null-separated) and hashed with SHA-256.
3. If the hash has been seen within the `window` duration, the event is dropped (returns `null`).
4. If the hash is new or expired, the event passes through and the hash is recorded with the current timestamp.

A periodic cleanup timer evicts expired entries from the in-memory store.

## Example route

```yaml
routes:
  - name: deduped-pr-reviews
    when:
      source: github-eng
      events:
        - resource.changed
    transforms:
      - ref: dedup-5m
      - ref: humans-only
    then:
      actor: openclaw-agent
```

## Auth / prerequisites

None.

## Limitations / known issues

- **Memory-only store** -- Dedup state is held entirely in memory and is lost on engine restart. After a restart, previously seen events may be processed again until the window catches up.
- **No distributed dedup** -- The in-memory store does not support multiple engine instances. Running multiple instances results in each instance maintaining its own independent dedup state.
- **Hash collisions** -- SHA-256 collisions are theoretically possible but practically negligible.
- **Cleanup interval** -- Expired entries are cleaned up on a timer interval equal to the dedup window (minimum 10 seconds). Between cleanups, the memory footprint grows proportionally to event throughput.
- **Key field ordering matters** -- The hash is built from key fields in the order specified. Changing the `key` array order produces different hashes.
