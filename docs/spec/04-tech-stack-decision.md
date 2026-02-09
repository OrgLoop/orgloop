## 4. Tech Stack Decision

### Evaluation Matrix

| Criterion | TypeScript | Go | Rust | Python |
|-----------|-----------|-----|------|--------|
| Contributor accessibility | ★★★★★ | ★★★★ | ★★ | ★★★★★ |
| Single binary distribution | ★★ (SEA) | ★★★★★ | ★★★★★ | ★ |
| npm ecosystem (connectors) | ★★★★★ | ★ | ★ | ★★ |
| Concurrency model | ★★★ (async) | ★★★★★ | ★★★★★ | ★★ (asyncio) |
| Startup time | ★★★ | ★★★★★ | ★★★★★ | ★★ |
| OpenClaw alignment | ★★★★★ | ★ | ★ | ★ |
| AI/ML ecosystem | ★★ | ★ | ★ | ★★★★★ |
| CLI tooling maturity | ★★★★ | ★★★★★ | ★★★★ | ★★★ |
| Time to MVP | ★★★★★ | ★★★ | ★★ | ★★★★ |

### Recommendation: TypeScript

**Primary language: TypeScript (Node.js runtime)**

The deciding factors:

1. **Transforms are shell scripts.** The runtime orchestrates — it spawns subprocesses, pipes JSON, collects results. It doesn't do heavy computation itself. This means raw throughput of the runtime language matters far less than it would for a data processing engine. The bottleneck is I/O (polling APIs, delivering webhooks, spawning transforms), and Node's async I/O model handles this well.

2. **Connector ecosystem.** Connectors need HTTP clients, API SDKs, webhook servers. The npm ecosystem has first-class SDKs for GitHub (Octokit), Linear, Slack, and virtually every SaaS platform. Go and Rust have these too, but with less breadth and more friction.

3. **Contributor profile.** The target contributor is a DevOps engineer, SRE, or platform engineer who writes scripts and config. TypeScript is the most accessible typed language for this audience. Go would be a close second — Rust would halve the contributor pool.

4. **OpenClaw ecosystem alignment.** OrgLoop is born from OpenClaw. OpenClaw is Node. The first connector (`@orgloop/connector-openclaw`) needs to interface with OpenClaw's webhook API. Shared language = shared types = fewer integration bugs.

5. **Time to MVP.** We need to prove this works by migrating our existing scripts. TypeScript has the fastest path from "design doc" to "running system" for our team.

**What we give up:**
- Single binary distribution. Mitigated by: Node SEA (Single Executable Applications, stable in Node 22+), `pkg`, or Docker.
- Startup time. Mitigated by: the daemon runs continuously; startup is a one-time cost.
- Raw concurrency. Mitigated by: the runtime is I/O-bound, not CPU-bound; transforms are child processes.

**What we gain:**
- Fastest path to MVP
- Largest connector ecosystem
- Most accessible to contributors
- Type safety without compilation ceremony (tsx for dev, tsc for prod)

**Package manager:** pnpm (workspace support, fast, disk-efficient).  
**Build orchestration:** Turborepo (caching, parallel builds across workspace packages).  
**Runtime:** Node.js ≥ 22 LTS (native fetch, SEA support, stable ESM).  
**Testing:** Vitest (fast, TypeScript-native, workspace-aware).  
**Linting:** Biome (fast, all-in-one formatter + linter, replaces ESLint + Prettier).

### TypeScript Performance & Scale Strategy

**The concern:** TypeScript is interpreted. It has startup cost and runtime overhead compared to Go or Rust. When does this matter for OrgLoop, and what do we do about it?

#### When We DON'T Care

OrgLoop is a **routing layer**, not a data processing pipeline. At the MVP scale (and likely for years), we're routing 100–1,000 events/day. Maybe 10,000/day for a busy team. Node.js handles this trivially — it's the same runtime that serves millions of HTTP requests/day for production web applications.

The real work happens in the connected systems (GitHub, Linear, OpenClaw). OrgLoop is the traffic cop, not the highway. A traffic cop doesn't need to be fast — it needs to be correct and reliable.

#### When We START Caring

- **Thousands of events per second** (not per day — per second). Think: Fortune 50 with 2,000 sources all firing simultaneously.
- **Sub-millisecond routing requirements.** If an event needs to be routed in <1ms, JavaScript's event loop overhead matters.
- **Memory pressure.** If we're holding 100K events in the WAL in memory, GC pauses become visible.

This is Tier 3 scale. Most users will never reach it. But we should design for it now so it's not a rewrite later.

#### What We Do Then

The **EventBus interface** is the abstraction boundary. This is the key architectural decision that makes TypeScript viable long-term:

1. **Swap the event bus implementation.** File WAL → NATS → Kafka — without changing any connector, transform, or route logic. The EventBus interface isolates the hot path.

2. **Native modules for the hot path.** Use Rust via [napi-rs](https://napi.rs/) for:
   - Event matching / routing table lookup
   - Transform pipeline orchestration
   - WAL read/write operations
   
   This is the same pattern used by Turbopack, SWC, and other tools that pair a Rust core with a JavaScript interface. The hot inner loop runs native; the ecosystem-facing layer (connectors, transforms, config) stays TypeScript for accessibility.

3. **Plugin layer stays TypeScript.** Connectors, transforms, and loggers are written by the community. TypeScript is the right choice for ecosystem accessibility. The performance-sensitive code is in the core, not in plugins.

4. **Alternative: full Rust core.** If the native module approach becomes unwieldy, rewrite `@orgloop/core` in Rust entirely. Keep the TypeScript SDK, CLI, and connector ecosystem. This is the Turbopack model: Turbopack (Rust) replaced Webpack (JS) but kept the JS config interface and plugin ecosystem.

#### Does It Impact Current Design?

**No.** As long as we keep the EventBus interface clean, the core routing engine is swappable. We're designing for this boundary now. The MVP implementation is pure TypeScript. A future native implementation drops in behind the same interface.

#### Scale Milestone

**Milestone:** When sustained event throughput exceeds **100 events/second** (not burst — sustained), evaluate native routing engine options. Below this threshold, pure TypeScript is more than sufficient, and optimization is premature.

This milestone is conservative. Node.js can likely handle 1,000+ events/second for OrgLoop's workload (it's mostly I/O). But 100/sec is a good trigger to start measuring rather than assuming.

### Future Consideration: Go CLI Wrapper

If distribution friction becomes a real problem (users don't want Node installed), we can build a thin Go binary that embeds the Node runtime or shells out to it — similar to how Terraform's plugin model works (Go binary orchestrating Go plugin binaries). But this is a v2 concern. Ship the Node version first.

---

