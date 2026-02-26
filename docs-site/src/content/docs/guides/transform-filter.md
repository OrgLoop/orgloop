---
title: Transform Filter Deep Dive
description: Complete reference for the built-in transform-filter — match, match_any, exclude, jq, regex, CSV expansion, and dot-path notation.
---

The `@orgloop/transform-filter` is OrgLoop's built-in event filter. It handles the vast majority of filtering needs without writing code — from simple field matching to full jq expressions. Understanding its capabilities means you rarely need to build a custom filter.

## Two modes

The filter operates in one of two modes:

1. **Match/Exclude mode** — Declarative dot-path field matching. Fast, in-process, no dependencies.
2. **jq mode** — Full jq expression evaluation. Subprocess-based, requires `jq` installed. The escape hatch for anything match/exclude can't do.

If both are specified, **jq takes precedence** and match/exclude are ignored.

## Match/Exclude mode

Three operations, evaluated in this order:

| Operation | Logic | Effect |
|-----------|-------|--------|
| `exclude` | OR — any criterion matching drops the event | Runs first. If any exclusion matches, event is dropped immediately. |
| `match` | AND — all criteria must match | Runs second. All criteria must pass for the event to continue. |
| `match_any` | OR — any criterion matching keeps the event | Runs third. At least one criterion must pass. |

All three can be combined in a single filter. The evaluation order is always exclude → match → match_any, regardless of YAML field order.

### Basic match (AND)

All criteria must match. Use this for "keep only events that look like X."

```yaml
transforms:
  - name: human-pr-reviews
    type: package
    package: "@orgloop/transform-filter"
    config:
      match:
        type: "resource.changed"
        provenance.platform_event: "pull_request.review_submitted"
        provenance.author_type: "team_member"
```

This passes events that are `resource.changed` AND are PR review submissions AND are from a team member. All three must be true.

### Match any (OR)

At least one criterion must match. Use this for "keep events matching any of these."

```yaml
config:
  match_any:
    provenance.pr_author: "alice"
    provenance.reviewer: "bob"
```

This passes events where the PR author is alice OR the reviewer is bob.

### Exclude (OR)

Any criterion matching drops the event. Use this for "drop events matching any of these."

```yaml
config:
  exclude:
    provenance.author:
      - "dependabot[bot]"
      - "renovate[bot]"
    provenance.author_type: "bot"
```

This drops events where the author is dependabot OR renovate OR the author type is bot. Any single match drops the event.

### Combining all three

```yaml
config:
  exclude:
    provenance.author_type: "bot"
  match:
    type: "resource.changed"
  match_any:
    provenance.pr_author: "alice,bob"
    provenance.reviewer: "charlie"
```

Evaluation: First, if the author type is bot → dropped. Then, event must be `resource.changed`. Then, the PR author must be alice or bob, OR the reviewer must be charlie.

## Dot-path notation

All field references use dot-separated paths to traverse nested objects.

| Path | Resolves to |
|------|-------------|
| `type` | `event.type` |
| `source` | `event.source` |
| `provenance.author` | `event.provenance.author` |
| `provenance.author_type` | `event.provenance.author_type` |
| `payload.pr_number` | `event.payload.pr_number` |
| `payload.labels` | `event.payload.labels` (array) |

If any segment in the path is missing or not an object, the value is treated as undefined and won't match any pattern (safe, no crash).

## Pattern types

The filter supports several pattern types for matching field values.

### Exact value

Strings, numbers, and booleans use strict equality.

```yaml
match:
  type: "resource.changed"          # String
  payload.count: 42                  # Number
  payload.draft: false               # Boolean
```

### Array patterns (any-match)

An array in a pattern means "match if the field equals any element."

```yaml
exclude:
  provenance.author:
    - "dependabot[bot]"
    - "renovate[bot]"
    - "github-actions[bot]"
```

This drops the event if `provenance.author` equals any of those three values.

### Comma-separated values (CSV expansion)

String values containing commas are automatically expanded to arrays during initialization. This is especially useful with environment variable substitution.

```yaml
match_any:
  provenance.pr_author: "alice,bob,charlie"
```

Is equivalent to:

```yaml
match_any:
  provenance.pr_author:
    - "alice"
    - "bob"
    - "charlie"
```

Whitespace around commas is trimmed. Combined with env vars:

```yaml
match_any:
  provenance.pr_author: "${TEAM_MEMBERS}"   # TEAM_MEMBERS=alice,bob,charlie
exclude:
  provenance.author: "${EXCLUDED_BOTS}"      # EXCLUDED_BOTS=dependabot[bot],renovate[bot]
```

### Regex patterns

Wrap a pattern in forward slashes for regular expression matching.

```yaml
match:
  payload.cwd: '/^\/Users\/alice\/work\//'       # Path starts with /Users/alice/work/
  payload.title: '/fix|bug/i'                     # Case-insensitive match for "fix" or "bug"
  payload.branch: '/^feature\//'                  # Branch starts with feature/
```

Syntax: `/pattern/flags` where flags are optional. Supported flags include `i` (case-insensitive).

If the regex is invalid, the filter falls back to exact string matching (safe failure).

### Null matching

```yaml
match:
  provenance.reviewer: null     # Matches when reviewer is null or undefined
```

## jq mode — the escape hatch

When match/exclude can't express what you need, jq mode gives you the full power of jq expressions. This is the answer to "how do I filter on X?" for any X.

### Setup

jq mode requires `jq` installed on the system (`brew install jq`, `apt install jq`, etc.).

```yaml
transforms:
  - name: complex-filter
    type: package
    package: "@orgloop/transform-filter"
    config:
      jq: '<jq expression>'
```

### How it works

The filter pipes the entire event JSON to `jq -e '<expression>'` as a subprocess (5-second timeout).

| jq output | Result |
|-----------|--------|
| Exit 0, valid JSON object with `id` field | Event replaced with jq output |
| Exit 0, truthy non-JSON output | Event passes unchanged |
| Exit 0, `null` or `false` | Event dropped |
| Non-zero exit | Event dropped |
| Timeout (5s) | Event dropped |

### Boolean filter (most common)

The expression evaluates to true/false. True keeps the event unchanged, false drops it.

```yaml
# Filter by array contents
config:
  jq: '.payload.labels | any(.name == "needs-review")'
```

```yaml
# Filter by author with OR logic
config:
  jq: '.provenance.pr_author == "alice" or .provenance.pr_author == "bob"'
```

```yaml
# Complex: array contains + author check
config:
  jq: >
    (.payload.labels | any(.name == "urgent")) and
    .provenance.author_type == "team_member"
```

```yaml
# Negative: exclude events with "wip" label
config:
  jq: '(.payload.labels | any(.name == "wip")) | not'
```

### Computed filter (field transformations)

jq can also transform the event. If the output is a valid JSON object with an `id` field, it replaces the original event.

```yaml
# Add a computed field and pass through
config:
  jq: '. + {metadata: {label_count: (.payload.labels | length)}}'
```

### Real-world examples

**Only PR reviews from non-bot authors on non-draft PRs:**

```yaml
config:
  jq: >
    .provenance.author_type != "bot" and
    (.payload.draft | not) and
    .provenance.platform_event == "pull_request.review_submitted"
```

**Only events where the PR has specific labels:**

```yaml
config:
  jq: '.payload.labels | any(.name == "niko-authored")'
```

**Only events from specific authors:**

```yaml
config:
  jq: '.provenance.pr_author == "doink-kindo[bot]" or .provenance.pr_author == "c-h-"'
```

**Filter CI failures (exclude successes):**

```yaml
config:
  jq: '.payload.conclusion == "failure" or .payload.conclusion == "timed_out"'
```

**Array intersection (PR has any of these labels):**

```yaml
config:
  jq: '[.payload.labels[].name] | any(. == "bug" or . == "critical" or . == "security")'
```

## When to use which mode

| Need | Mode | Example |
|------|------|---------|
| Match a single field value | `match` | `provenance.author_type: team_member` |
| Match one of several values | `match` with array | `provenance.author: [alice, bob]` |
| Match any of several fields | `match_any` | Author OR reviewer matches |
| Exclude specific values | `exclude` | Drop bot authors |
| Match by regex pattern | `match` with regex | `payload.cwd: '/\/work\//'` |
| Parameterize with env vars | `match` + CSV expansion | `${TEAM_MEMBERS}` |
| Inspect array elements | `jq` | Labels contain "needs-review" |
| Complex boolean logic | `jq` | Author AND label AND NOT draft |
| Transform the event | `jq` | Add computed fields |

**Rule of thumb:** Start with match/exclude. If you find yourself needing to inspect array elements or combine complex boolean logic, switch to jq. jq is the escape hatch — it can express anything.

## No config = pass-all

If no match, exclude, match_any, or jq is configured, the filter passes all events unchanged. This means you can add the filter to a pipeline and configure it later.

## Error handling

The filter is designed to be safe:

- **Invalid regex** → falls back to exact string match
- **Missing jq binary** → event dropped (logged as error)
- **jq timeout (5s)** → event dropped (logged as error)
- **Missing dot-path segments** → treated as undefined (no match, no crash)

The filter follows OrgLoop's fail-open philosophy for match/exclude mode (missing fields just don't match). jq mode fails closed (errors drop events) because jq errors typically indicate a logic problem that should be fixed.

---

## See also

- [Patterns & Recipes](/guides/patterns/) — common filtering patterns with complete YAML examples
- [Building Transforms](/guides/transform-authoring/) — script and package transform authoring guide
- [Config Schema — Transform Definition](/reference/config-schema/#transform-definition) — YAML config reference
