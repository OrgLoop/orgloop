# Minimal Example

The simplest possible OrgLoop setup: one source, one logger.

## What it does

- Receives events via a generic webhook
- Logs them to the console

This is the starting point for understanding OrgLoop's config format.

## Setup

```bash
orgloop init --name my-project --connectors webhook --no-interactive --dir my-project
cd my-project
orgloop add module minimal
orgloop validate
orgloop apply
```

Or copy this directory and run directly:

```bash
cp -r examples/minimal my-project
cd my-project
orgloop validate
orgloop apply
```

## Files

```
orgloop.yaml          # Project config — references connectors and loggers
connectors/
  webhook.yaml        # Generic webhook source
loggers/
  default.yaml        # Console logger
```

## Configuration

No environment variables required. The webhook source listens for inbound HTTP POST requests.

## Testing

Send a test event:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"type": "test", "message": "hello from orgloop"}'
```

You should see the event logged to the console.
