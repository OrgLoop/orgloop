## 12. Modules (v1.1+)

> **Status: Post-MVP roadmap.** This section documents the module design for v1.1+. The MVP ships `orgloop init --template <name>` as a stepping stone. The full module system requires a stable, proven core to compose on top of.

### What Is a Module?

A **module** is a bundled workflow: connectors + routes + transforms + prompt files — a complete autonomous process installable as a single package. Think of it as "install this business process."

```bash
npm install @orgloop/module-code-review
orgloop add module code-review
```

This scaffolds: GitHub connector config, OpenClaw actor config, routes for PR review → agent supervision, recommended transforms (injection scanner, bot noise filter), and launch prompt SOPs — a working org spec that you configure with your repo, agent, and credentials.

### Module Structure

A module is an npm package that exports:

```
@orgloop/module-code-review/
├── package.json          # npm package metadata
├── orgloop-module.yaml   # Module manifest
├── templates/
│   ├── routes.yaml       # Route templates (parameterized)
│   └── transforms.yaml   # Transform recommendations
├── sops/                 # Launch prompt files bundled with the module
│   ├── pr-review.md
│   └── ci-failure.md
└── README.md
```

### Module Manifest

```yaml
# orgloop-module.yaml
apiVersion: orgloop/v1alpha1
kind: Module
metadata:
  name: code-review
  description: "Automated code review workflow"
  version: 1.0.0

# What this module requires (connectors the user must have configured)
requires:
  connectors:
    - type: source
      id: github
      connector: "@orgloop/connector-github"
    - type: actor
      id: agent
      connector: "@orgloop/connector-openclaw"

# Parameters the user must provide
parameters:
  - name: github_source
    description: "Name of your GitHub source"
    type: string
    required: true
  - name: agent_actor
    description: "Name of your agent actor"
    type: string
    required: true

# What this module provides
provides:
  routes: 2
  transforms: 0
  sops: 2
```

### Parameterized Templates

Route templates use parameter substitution, expanded at `orgloop plan` time:

```yaml
# templates/routes.yaml
routes:
  - name: "{{ module.name }}-pr-review"
    when:
      source: "{{ params.github_source }}"
      events: [resource.changed]
      filter:
        provenance.platform_event:
          - pull_request.review_submitted
          - pull_request_review_comment
    transforms:
      - ref: drop-bot-noise
      - ref: injection-scanner
    then:
      actor: "{{ params.agent_actor }}"
      config:
        session_key: "hook:github:pr-review:{{ params.agent_actor }}"
    with:
      prompt_file: "{{ module.path }}/sops/pr-review.md"

  - name: "{{ module.name }}-ci-failure"
    when:
      source: "{{ params.github_source }}"
      events: [actor.error]
      filter:
        provenance.platform_event: workflow_run.completed
    then:
      actor: "{{ params.agent_actor }}"
      config:
        session_key: "hook:github:ci-failure:{{ params.agent_actor }}"
    with:
      prompt_file: "{{ module.path }}/sops/ci-failure.md"
```

### Composition Model: Instantiation, Not Merging

**Modules don't create connectors. They reference them.** This is the critical insight from Terraform.

A module declares what connectors it needs, and the user wires them up via parameters. Two modules that both need a GitHub source can point to the same one — no conflict, because neither module owns the source.

```yaml
# orgloop.yaml — Two modules, one GitHub source
modules:
  - package: "@orgloop/module-code-review"
    params:
      github_source: github
      agent_actor: engineering

  - package: "@orgloop/module-ci-monitor"
    params:
      github_source: github        # Same source, no conflict
      agent_actor: engineering
```

Each module adds its own routes. Routes don't conflict because multi-route matching is already supported — one event can match multiple routes. The modules compose additively.

**Namespacing:** Module routes are namespaced with the module name as a prefix: `code-review-pr-review` vs `ci-monitor-ci-failure`.

**Credential isolation:** Modules don't touch credentials. They declare connector dependencies. The user configures the connectors (with credentials via env vars) independently.

### MVP Stepping Stone: Templates

For MVP, `orgloop init --template <name>` provides the "install a workflow" experience as static scaffolding:

```bash
orgloop init --template engineering
# Generates a complete orgloop.yaml with GitHub, Linear, OpenClaw, Claude Code
# connectors, standard routes, recommended transforms, and SOP files
```

Templates are one-time scaffolds (like `create-react-app`). They generate a starting point that you customize. The full module system in v1.1+ enables composable, parameterized, and updatable workflow bundles.

### Why Not Now

- Modules need a stable core to compose on top of. Ship the core first.
- The template parameter syntax needs real-world testing — we'll learn what variables people need from the first few manual org specs.
- Community modules require a community. Community requires a shipped, working product.
- The complexity budget (parameterization, composition rules, conflict resolution, dependency graphs) is better spent on proving the core routing engine.

---

