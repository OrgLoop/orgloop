# @orgloop/transform-filter

Filters events by field matching or jq expressions. Events that pass the filter continue through the pipeline; events that fail are dropped.

## Install

```bash
npm install @orgloop/transform-filter
```

## Configuration

The filter supports two modes: **match/exclude** (built-in) and **jq** (subprocess).

### Mode 1: Match / Exclude

```yaml
transforms:
  - name: humans-only
    type: package
    package: "@orgloop/transform-filter"
    config:
      match:                                    # all criteria must match to pass
        type: "resource.changed"
        "provenance.author_type": "team_member"
      exclude:                                  # any match here drops the event
        "provenance.author":
          - "dependabot[bot]"
          - "renovate[bot]"
```

### Mode 2: jq expression

```yaml
transforms:
  - name: high-priority
    type: package
    package: "@orgloop/transform-filter"
    config:
      jq: '.payload.priority == "high"'        # truthy result = pass, falsy = drop
```

### Config options

| Field | Type | Description |
|-------|------|-------------|
| `match` | `object` | Dot-path field to value map. **All** criteria must match for the event to pass |
| `exclude` | `object` | Dot-path field to value map. **Any** match drops the event |
| `jq` | `string` | jq expression evaluated against the full event. Truthy = pass, falsy/error = drop |

If both `match` and `exclude` are set, `exclude` is checked first.

If `jq` is set, it takes precedence over `match`/`exclude`.

### Value matching

The `match` and `exclude` fields support several value types:

| Pattern type | Example | Behavior |
|---|---|---|
| String | `"team_member"` | Exact match |
| Number | `42` | Strict equality |
| Boolean | `true` | Strict equality |
| Array | `["bot", "system"]` | Matches if actual value equals any element |
| Regex string | `"/fix\\|bug/i"` | Regex test against stringified value |
| `null` | `null` | Matches `null` or `undefined` |

### Dot-path field access

Fields are accessed via dot-notation paths into the event object:

- `type` -- top-level event type
- `provenance.author` -- nested provenance field
- `payload.pr_number` -- payload field

## Examples

### Filter by event type and author

```yaml
routes:
  - name: human-pr-reviews
    when:
      source: github-eng
      events:
        - resource.changed
    transforms:
      - ref: humans-only
    then:
      actor: openclaw-agent
```

### CWD-based routing with regex

Route Claude Code stop events to different agents based on the working directory:

```yaml
transforms:
  - name: work-repos
    type: package
    package: "@orgloop/transform-filter"
    config:
      match:
        "payload.cwd": "/\\/code\\/mono/"           # regex: matches ~/code/mono*
  - name: personal-repos
    type: package
    package: "@orgloop/transform-filter"
    config:
      match:
        "payload.cwd": "/\\/personal\\//"            # regex: matches ~/personal/*

routes:
  - name: work-tasks
    when:
      source: claude-code
      events: [actor.stopped]
    transforms: [{ ref: work-repos }]
    then:
      actor: work-agent
  - name: personal-tasks
    when:
      source: claude-code
      events: [actor.stopped]
    transforms: [{ ref: personal-repos }]
    then:
      actor: personal-agent
```

## Auth / prerequisites

- None for match/exclude mode.
- **jq mode** requires the `jq` binary to be installed and available on `PATH`. The subprocess runs with a 5-second timeout.

## Limitations / known issues

- **jq mode spawns a subprocess** per event. This is convenient but not suitable for high-throughput pipelines.
- **jq errors drop the event** -- If the jq expression fails to parse or returns an error exit code, the event is silently dropped (not passed through).
- **jq can modify events** -- If the jq expression returns a valid JSON object with an `id` field, that object replaces the original event. Otherwise, the original event passes through unchanged.
- **No OR logic for match** -- All `match` criteria use AND logic. For OR, use an array value within a single field or use jq mode.
- **Regex patterns** -- Must start and end with `/` (e.g., `"/pattern/flags"`). Invalid regex falls back to exact string comparison.
