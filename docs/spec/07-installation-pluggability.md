## 7. Installation & Pluggability

### 7.1 Installation Methods

**Primary: npm (global install)**
```bash
npm install -g @orgloop/cli
# or
pnpm add -g @orgloop/cli
```

This installs the `orgloop` binary. Requires Node.js ≥ 22.

**Secondary: Homebrew (macOS/Linux)**
```bash
brew install orgloop
```

The Homebrew formula bundles Node.js via Single Executable Application (SEA) — no external Node dependency.

**Tertiary: Docker**
```bash
docker run -v $(pwd):/config ghcr.io/orgloop/orgloop apply
```

For server deployments where OrgLoop runs as a daemon.

**Future: curl installer**
```bash
curl -fsSL https://get.orgloop.dev | bash
```

Downloads the SEA binary for the detected platform. Yes, `curl | bash` is ironic given our security posture — but it's what developers expect. The script is auditable and checksummed.

### 7.2 Connector Installation

**Bundled connectors (first-party):**

The `@orgloop/cli` package includes a "batteries-included" set of common connectors:
- `@orgloop/connector-github`
- `@orgloop/connector-webhook`

Additional first-party connectors are installed separately:
```bash
npm install @orgloop/connector-linear
npm install @orgloop/connector-openclaw
npm install @orgloop/connector-claude-code
```

Or via the CLI:
```bash
orgloop add connector linear
# → runs: npm install @orgloop/connector-linear
# → adds to orgloop.yaml connectors list
```

**Community connectors:**
```bash
npm install orgloop-connector-jira
orgloop add connector jira --package orgloop-connector-jira
```

No approval needed. If it implements the interface, it works. See [Zero Bottleneck to Adoption](#24-design-principle-zero-bottleneck-to-adoption).

### 7.3 Plugin Discovery & Loading

**Runtime plugin loading** (not compile-time).

When `orgloop apply` starts:
1. Read `orgloop.yaml` → get list of connector/transform/logger packages
2. For each package, `require()` / `import()` it at runtime
3. Each package exports a registration function:

```typescript
// connectors/github/src/index.ts
import { SourceConnector, ActorConnector, ConnectorRegistration } from '@orgloop/sdk';
import { GitHubSource } from './source';
import { GitHubTarget } from './target';

export default function register(): ConnectorRegistration {
  return {
    id: 'github',
    source: GitHubSource,
    target: GitHubTarget,
    configSchema: { /* JSON Schema for config validation */ },
  };
}
```

4. The runtime validates each plugin's config against its declared schema
5. Plugins are initialized in dependency order

**Plugin resolution order:**
1. Workspace `node_modules/` (local install)
2. Global `node_modules/` (global install)
3. Built-in (bundled with CLI)

### 7.4 Cross-Platform Support

| Platform | MVP | v1.0 |
|----------|-----|------|
| macOS (Apple Silicon) | ✅ | ✅ |
| macOS (Intel) | ✅ | ✅ |
| Linux (x64) | ✅ | ✅ |
| Linux (ARM64) | ✅ | ✅ |
| Windows | ❌ | ⚠️ Best-effort |

Windows is out of MVP scope because:
- Shell script transforms assume POSIX (`#!/bin/bash`, pipes, etc.)
- Our team and early users are macOS/Linux
- WSL2 is a viable escape hatch for Windows users

---

