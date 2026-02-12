# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).








## [0.1.6] - 2026-02-12

Released from version 0.1.5.

## [0.1.5] - 2026-02-11

Released from version 0.1.4.

## [0.1.4] - 2026-02-10

Released from version 0.1.3.

## [0.1.3] - 2026-02-09

Released from version 0.1.2.

## [0.1.2] - 2026-02-09

Released from version 0.1.1.

## [0.1.1] - 2026-02-09

Released from version 0.1.0.

## [0.1.0] - 2026-02-09

Released from version 0.1.0.

## [0.1.0] - 2026-02-09

### Added

- Core engine with event bus, router, scheduler, and transform pipeline
- Five primitives: Sources, Actors, Routes, Transforms, Loggers
- Three event types: resource.changed, actor.stopped, message.received
- WAL-based event bus for durability (FileWalBus)
- File-based checkpoint store for source deduplication
- Engine HTTP listener for webhook-based sources (localhost-only, port 4800)
- CLI commands: init, validate, env, doctor, plan, apply, stop, status, logs, hook, test, inspect, add, version, install-service, service
- Connectors: GitHub (poll), Linear (poll), Claude Code (webhook/hook), OpenClaw (target), Webhook (generic source+target), Cron (scheduled)
- Transforms: filter (match/exclude with dot-path patterns, regex, jq mode), dedup (SHA-256 hash, time window, periodic cleanup), enrich (add/copy/compute fields)
- Loggers: console (ANSI colors, phase icons, level filtering), file (buffered JSONL, rotation by size/age/count, gzip), OpenTelemetry (OTLP export), syslog (RFC 5424)
- Module system: parameterized templates, `orgloop add module`, manifest validation, composition with namespacing
- Modules: engineering (5 routes, 3 SOPs), minimal (1 source, 1 actor, 1 route)
- YAML config with AJV validation and `${ENV_VAR}` substitution
- Route graph validation: dead sources, unreachable actors, orphan transforms, event type mismatches
- Pre-flight env var checks in validate and apply with actionable error messages
- `orgloop doctor` health check command with `--json` output
- `orgloop env` command with per-var description and help URLs from connector metadata
- `orgloop hook claude-code-stop` for piping Claude Code post-exit hooks to the engine
- `.env.example` generation during `orgloop init` with connector-provided helper text
- Next-step suggestions in CLI output (init, env, validate, apply)
- Claude Code Stop hook installation during `orgloop init`
- `orgloop routes` ASCII topology visualization with `--json` output
- Release tooling: `pnpm release` / `pnpm release:dry` with 10-step publish pipeline
- E2E pipeline tests covering multi-source, multi-route, transforms, and webhook delivery
- Examples: minimal, engineering-org, github-to-slack, multi-agent-supervisor, beyond-engineering, org-to-org
- SDK test harness: MockSource, MockActor, MockTransform, MockLogger, createTestEvent, createTestContext
- Documentation site (Astro Starlight) with spec, guides, examples, and vision sections
