---
title: "Built-in Loggers"
description: "Universal log entry schema, file logger, console logger, and proposed OpenTelemetry, syslog, and webhook loggers."
---

### 11.1 Universal Log Entry Schema

Every log entry carries this metadata, regardless of logger implementation:

```typescript
interface LogEntry {
  // Identity
  timestamp: string;          // ISO 8601, UTC
  event_id: string;           // Unique event ID (evt_*)
  trace_id: string;           // Groups all entries for one event's journey

  // Pipeline position
  phase: 'source.emit'        // Source emitted an event
       | 'transform.start'    // Transform began processing
       | 'transform.pass'     // Transform passed the event through
       | 'transform.drop'     // Transform filtered/dropped the event
       | 'transform.error'    // Transform errored
       | 'route.match'        // Event matched a route
       | 'route.no_match'     // Event matched no routes
       | 'deliver.attempt'    // Delivery to actor attempted
       | 'deliver.success'    // Delivery succeeded
       | 'deliver.failure'    // Delivery failed
       | 'deliver.retry'      // Delivery will be retried
       | 'system.start'       // Runtime started
       | 'system.stop'        // Runtime stopped
       | 'system.error';      // Runtime error

  // Context
  source?: string;            // Source ID
  target?: string;            // Actor ID
  route?: string;             // Route name
  transform?: string;         // Transform name
  event_type?: string;        // OaC event type

  // Metrics
  duration_ms?: number;       // Phase duration
  queue_depth?: number;       // Current queue depth (for backpressure visibility)

  // Details
  result?: string;            // Phase-specific result
  error?: string;             // Error message if applicable
  metadata?: Record<string, unknown>;  // Additional context

  // Provenance (optional — populated when available)
  orgloop_version?: string;   // Runtime version
  hostname?: string;          // Machine hostname
  workspace?: string;         // Active workspace name
}
```

### 11.2 Proposed Built-in Loggers

#### File Logger (`@orgloop/logger-file`)

JSONL format, rotatable, the default production logger.

```yaml
loggers:
  - name: file-log
    type: "@orgloop/logger-file"
    config:
      path: ~/.orgloop/logs/orgloop.log
      format: jsonl
      rotation:
        max_size: 100MB       # Rotate when file exceeds this
        max_age: 7d           # Delete rotated files after this
        max_files: 10         # Keep at most N rotated files
        compress: true        # gzip rotated files
      buffer:
        size: 100             # Buffer N entries before flushing
        flush_interval: 1s    # Flush at least every N seconds
      filter:
        min_phase: transform.pass  # Skip source.emit (too noisy)
        # Or: phases: [deliver.success, deliver.failure, transform.drop]
```

**Implementation:** Uses a streaming write with fsync on flush. Rotation is handled by the logger itself (no external logrotate dependency).

#### Console Logger (`@orgloop/logger-console`)

Human-readable, colored output for development and debugging.

```yaml
loggers:
  - name: console-log
    type: "@orgloop/logger-console"
    config:
      level: info             # debug, info, warn, error
      color: true             # ANSI colors
      compact: false          # true = one line per entry; false = expanded
      show_payload: false     # true = include event payload (verbose)
```

Example output:
```
20:47:12 ● source.emit       github         resource.changed   evt_abc123
20:47:12 ◆ transform.pass    drop-bot-noise                    evt_abc123  2ms
20:47:12 ◆ transform.pass    injection-scan                    evt_abc123  15ms
20:47:12 ► route.match       github→eng     github-to-eng      evt_abc123
20:47:12 ✓ deliver.success   openclaw-engineering-agent                  evt_abc123  89ms

20:47:12 ● source.emit       github         resource.changed   evt_abc124
20:47:12 ✗ transform.drop    drop-bot-noise  (bot author)      evt_abc124  1ms
```

#### OpenTelemetry Logger (`@orgloop/logger-otlp`)

Exports traces, metrics, and logs via the OpenTelemetry Protocol (OTLP).

```yaml
loggers:
  - name: otel
    type: "@orgloop/logger-otlp"
    config:
      endpoint: "http://localhost:4318"   # OTLP HTTP endpoint
      # endpoint: "grpc://localhost:4317" # OTLP gRPC endpoint
      protocol: http                       # http or grpc
      service_name: orgloop
      resource_attributes:
        deployment.environment: production
        service.namespace: orgloop
      export:
        traces: true          # Each event journey = one trace
        metrics: true          # Event counts, delivery latency, queue depth
        logs: true             # Log entries as OTLP log records
```

**Trace model:** Each event's journey through the pipeline is one trace. Spans:
- Root span: `event.pipeline` (source -> delivery)
- Child spans: `transform.{name}`, `route.match`, `deliver.{actor}`

**Metrics exported:**
- `orgloop.events.total` (counter, by source, type)
- `orgloop.events.dropped` (counter, by transform, source)
- `orgloop.delivery.total` (counter, by actor, status)
- `orgloop.delivery.latency` (histogram, by actor)
- `orgloop.pipeline.latency` (histogram, source-to-delivery)
- `orgloop.queue.depth` (gauge, by actor)

This is a **v1.1 logger** — not MVP, but designed from the start.

#### Syslog Logger (`@orgloop/logger-syslog`)

Standard syslog protocol for integration with enterprise log aggregation.

```yaml
loggers:
  - name: syslog
    type: "@orgloop/logger-syslog"
    config:
      host: "syslog.internal.corp"
      port: 514
      protocol: udp           # udp, tcp, or tls
      facility: local0
      app_name: orgloop
      format: rfc5424          # rfc3164 or rfc5424
```

This is a **v1.1 logger** — enterprise deployments need it, but not MVP.

#### Webhook Logger (`@orgloop/logger-webhook`)

POST log entries to an arbitrary HTTP endpoint.

```yaml
loggers:
  - name: webhook-log
    type: "@orgloop/logger-webhook"
    config:
      url: "https://hooks.example.com/orgloop"
      method: POST
      headers:
        Authorization: "Bearer ${WEBHOOK_TOKEN}"
      batch:
        size: 50              # Batch N entries per request
        interval: 5s          # Send at least every N seconds
      filter:
        phases:
          - deliver.success
          - deliver.failure
          - system.error
      retry:
        max_attempts: 3
        backoff: exponential
```

Useful for: sending delivery events to a Slack channel, feeding a dashboard, alerting on errors.

### 11.3 Logger Priority for MVP

| Logger | MVP | v1.0 | v1.1 |
|--------|-----|------|------|
| File (JSONL) | Yes | Yes | Yes |
| Console (colored) | Yes | Yes | Yes |
| Webhook | No | Yes | Yes |
| OpenTelemetry | No | No | Yes |
| Syslog | No | No | Yes |
