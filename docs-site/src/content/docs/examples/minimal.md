---
title: "Example: Minimal"
description: The simplest possible OrgLoop setup — one source, one logger.
---

The simplest possible OrgLoop setup. One webhook source, one console logger, no environment variables. Use this to understand the config format before building anything real.

## What this example shows

- The `orgloop.yaml` project file and how it references external config files
- Connector and logger configuration in separate YAML files
- How to send a test event and see it logged

## Prerequisites

- Node.js >= 22
- OrgLoop CLI installed (`npm install -g @orgloop/cli`)

## Setup

Copy the example and run it:

```bash
cp -r examples/minimal my-project
cd my-project
orgloop validate
orgloop apply
```

Or scaffold from scratch:

```bash
orgloop init --name my-project --connectors webhook --no-interactive --dir my-project
cd my-project
orgloop validate
orgloop apply
```

## Configuration

The example uses three files. No environment variables are required.

### `orgloop.yaml`

The project root. References connectors and loggers by path.

```yaml
# orgloop.yaml — Minimal example
# The simplest possible OrgLoop setup: one source, one actor, one route.

apiVersion: orgloop/v1alpha1
kind: Project
metadata:
  name: minimal-org
  description: "Minimal OrgLoop example"

defaults:
  poll_interval: 5m
  log_level: info

connectors:
  - connectors/webhook.yaml

loggers:
  - loggers/default.yaml
```

### `connectors/webhook.yaml`

A generic webhook source that listens for inbound HTTP POST requests.

```yaml
apiVersion: orgloop/v1alpha1
kind: ConnectorGroup

sources:
  - id: webhook
    description: Generic webhook receiver
    connector: "@orgloop/connector-webhook"
    config:
      path: "/webhook"
    emits:
      - resource.changed
      - message.received
```

### `loggers/default.yaml`

Console logger with color output.

```yaml
apiVersion: orgloop/v1alpha1
kind: LoggerGroup

loggers:
  - name: console-log
    type: "@orgloop/logger-console"
    config:
      level: info
      color: true
```

## Testing

Send a test event with curl:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"type": "test", "message": "hello from orgloop"}'
```

## What you will see

The console logger prints each event as it flows through the system:

```
[info] event.ingested   webhook  resource.changed  evt_abc123
[info] event.routed     webhook  resource.changed  (no matching routes)
```

Since this example has no routes or actors, events are ingested and logged but not delivered anywhere. That is the point -- it shows the config format and event lifecycle without any external dependencies.

## Next steps

Ready for something real? See the [GitHub to Slack](/examples/github-to-slack/) example for a single source-to-actor pipeline, or the [Engineering Org](/examples/engineering-org/) example for a full multi-source setup.
