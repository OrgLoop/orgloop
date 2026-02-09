## Appendix B: Glossary

| Term | Definition |
|------|-----------|
| **OaC** | Organization as Code — the paradigm of declaring organizational topology in version-controlled config |
| **Source** | An external system that emits events (GitHub, Linear, Claude Code, etc.) |
| **Actor** | An entity that can be woken to do work (OpenClaw agent, human, webhook) |
| **Route** | Declarative wiring: source event → actor delivery |
| **Transform** | A pipeline step that modifies, filters, or enriches events |
| **Logger** | A passive observer that records pipeline activity |
| **Connector** | A plugin that bridges OrgLoop to an external system (can be source, target, or both) |
| **Checkpoint** | An opaque cursor tracking a source's last-processed position |
| **WAL** | Write-Ahead Log — append-only file ensuring at-least-once delivery |
| **Event Bus** | Internal message-passing abstraction (in-memory, file, NATS, Kafka) |

