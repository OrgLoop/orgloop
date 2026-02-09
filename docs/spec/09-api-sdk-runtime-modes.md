## 9. API/SDK Runtime Modes

### Key Insight: Library-First Architecture

**The core is a library. Everything else is a thin wrapper.**

If `@orgloop/core` is designed as a library first, all three runtime modes come naturally. The CLI is a wrapper that calls the library. The server is a wrapper that exposes the library over HTTP. Users embedding OrgLoop in their own applications import the library directly.

This is the most important architectural decision for long-term flexibility. Don't design a CLI that happens to have a library. Design a library that happens to have a CLI.

```typescript
// The core library — this is the foundation
import { OrgLoop, OrgLoopConfig } from '@orgloop/core';

const loop = new OrgLoop(config);
await loop.start();

// That's it. The engine is running.
// Everything below is a different way to invoke these same methods.
```

### Mode 1: CLI Mode (MVP)

**Command:** `orgloop apply`

For individual developers and small teams. The CLI manages the full lifecycle: load config, start the engine as a long-running daemon, handle signals, manage the PID file. The daemon manages all source polling internally — poll intervals declared in YAML replace external schedulers (LaunchAgents, systemd timers, cron). One OrgLoop process replaces N poller scripts.

Use `orgloop install-service` to generate platform-appropriate service files (LaunchAgent on macOS, systemd unit on Linux, Dockerfile for containers) that keep the daemon alive across reboots.

```bash
# Foreground (development)
orgloop apply

# Daemonized (production)
orgloop apply --daemon

# System service (production, managed restart)
orgloop service install  # Generates launchd/systemd unit
```

**Who uses this:** Individual developers, small teams, anyone running OrgLoop on a single machine. This is the MVP and the default path.

**Under the hood:**

```typescript
// cli/src/commands/apply.ts — simplified
import { OrgLoop } from '@orgloop/core';
import { loadConfig } from '../config';

const config = await loadConfig(flags.config);
const loop = new OrgLoop(config);

process.on('SIGTERM', () => loop.stop());
process.on('SIGINT', () => loop.stop());

await loop.start();
// Engine runs until stopped
```

The CLI is ~100 lines of wrapper code around the library. All the logic lives in `@orgloop/core`.

### Mode 2: Library/SDK Mode

**Import:** `import { OrgLoop } from '@orgloop/core'`

For teams building custom tooling or integrating OrgLoop into existing systems. The core is a library — embed it in your own application, hook into its events, extend its behavior programmatically.

```typescript
import { OrgLoop, OrgLoopConfig } from '@orgloop/core';

// Programmatic configuration (not just YAML)
const config: OrgLoopConfig = {
  sources: [{
    id: 'github',
    connector: '@orgloop/connector-github',
    config: { repo: 'my-org/my-repo' },
    poll: { interval: '5m' },
  }],
  actors: [{
    id: 'my-actor',
    connector: '@orgloop/connector-webhook',
    config: { url: 'https://my-service.com/hook' },
  }],
  routes: [{
    name: 'github-to-actor',
    when: { source: 'github', events: ['resource.changed'] },
    then: { actor: 'my-actor' },
  }],
};

const loop = new OrgLoop(config);

// Hook into engine events
loop.on('event', (event) => {
  console.log('Event received:', event.id);
});

loop.on('delivery', (result) => {
  myMetricsSystem.record('orgloop.delivery', result);
});

// Inject events programmatically
loop.inject({
  source: 'custom',
  type: 'resource.changed',
  payload: { /* ... */ },
});

await loop.start();
```

**Who uses this:** Platform teams embedding OrgLoop in a larger system. Internal tools that need event routing as a component, not a standalone daemon. Teams that want programmatic config (not YAML) or custom event sources.

**This mode exists by default** if we design library-first. No additional work needed — just export clean public APIs from `@orgloop/core`.

### Mode 3: Server/API Mode

**Command:** `orgloop serve`

Exposes a REST API for programmatic control, event ingestion, and status monitoring. For production deployments, web dashboards, and enterprise integrations.

```bash
$ orgloop serve --port 8420

# Or with config
$ orgloop serve --config orgloop.yaml --port 8420 --host 0.0.0.0
```

#### API Surface

```
# Event ingestion (push-based sources)
POST   /api/v1/events              Ingest an event
GET    /api/v1/events              Query recent events (with filters)
GET    /api/v1/events/:id          Get a specific event's full trace

# Runtime management
GET    /api/v1/status              Runtime status (uptime, counts)
GET    /api/v1/health              Health check (for load balancers)

# Observability
GET    /api/v1/sources             List sources and their status
GET    /api/v1/sources/:id         Source detail (checkpoint, stats)
GET    /api/v1/actors              List actors and their status
GET    /api/v1/actors/:id          Actor detail (delivery stats)
GET    /api/v1/routes              List routes and their stats
GET    /api/v1/routes/:id          Route detail (match/drop counts)

# Configuration management
POST   /api/v1/config/validate     Validate a config payload
POST   /api/v1/config/plan         Compute a plan
POST   /api/v1/config/apply        Apply a config change

# Logs
GET    /api/v1/logs                Stream logs (SSE)
GET    /api/v1/logs/query          Query historical logs

# Webhook receiver (for push-based sources)
POST   /api/v1/webhooks/:source    Receive webhook from a source platform
```

#### Event Ingestion

```bash
# External system pushes an event to OrgLoop
curl -X POST http://localhost:8420/api/v1/events \
  -H "Authorization: Bearer $ORGLOOP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "custom-sensor",
    "type": "resource.changed",
    "payload": { "temperature": 42.5 }
  }'
```

The API normalizes the event (adds `id`, `timestamp`, `provenance`) and feeds it into the pipeline just like a polled event.

#### Authentication

For the MVP, the API uses bearer token authentication (a shared secret configured in `orgloop.yaml`):

```yaml
api:
  listen: "127.0.0.1:8420"   # Localhost only by default
  auth:
    token_env: ORGLOOP_API_TOKEN
```

Future: OAuth2, mTLS for production deployments.

**Who uses this:** Production deployments behind a load balancer. Web dashboards that show OrgLoop status. Enterprise integrations that need programmatic event ingestion. Teams that want an API-first interface instead of (or in addition to) CLI.

#### Under the hood

```typescript
// cli/src/commands/serve.ts — simplified
import { OrgLoop } from '@orgloop/core';
import { createServer } from '@orgloop/server';
import { loadConfig } from '../config';

const config = await loadConfig(flags.config);
const loop = new OrgLoop(config);
const server = createServer(loop, { port: flags.port });

await loop.start();
await server.listen();
// Engine + API server running
```

Again: thin wrapper. The server package is ~500 lines of HTTP routing that delegates to the same `OrgLoop` library instance.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        @orgloop/core                             │
│                     (THE library — all logic lives here)         │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────────────────┐ │
│  │ EventBus │  │ Router   │  │ Xforms │  │ Logger Fan-out    │ │
│  │ (WAL)    │  │          │  │        │  │                   │ │
│  └──────────┘  └──────────┘  └────────┘  └───────────────────┘ │
│                                                                  │
│  Public API:                                                     │
│    new OrgLoop(config)                                           │
│    loop.start() / loop.stop()                                    │
│    loop.inject(event)                                            │
│    loop.on('event' | 'delivery' | 'error', handler)              │
│    loop.status() / loop.inspect(id)                              │
└───────────┬──────────────────────┬───────────────────┬──────────┘
            │                      │                   │
   ┌────────▼────────┐   ┌────────▼────────┐  ┌───────▼────────┐
   │  @orgloop/cli   │   │ @orgloop/server │  │  Your app      │
   │                 │   │                 │  │                │
   │  orgloop apply  │   │  orgloop serve  │  │  import {      │
   │  orgloop status │   │  REST API       │  │    OrgLoop     │
   │  orgloop logs   │   │  SSE logs       │  │  } from core   │
   │  orgloop test   │   │  Webhook recv   │  │                │
   └─────────────────┘   └─────────────────┘  └────────────────┘
        CLI mode              Server mode         Library mode
```

### Priority

| Mode | Priority | Notes |
|------|----------|-------|
| CLI mode (`orgloop apply`) | **MVP** | Ship first. This proves the core works. |
| Library mode (`import { OrgLoop }`) | **MVP** | Comes free with library-first design. The CLI already uses it. |
| Server mode (`orgloop serve`) | **v1.1** | After CLI is proven, add the HTTP layer. The library API is already there; server is just HTTP routing on top. |

---

