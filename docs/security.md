# Security

OrgLoop is the nervous system of your organization. Every event, every routing decision, every actor invocation flows through it. Security isn't a feature we bolted on — it's architectural. The defaults are secure. You opt *into* exposure, never out of it.

---

## Polling over Webhooks

Sources use **outbound polling** by default. OrgLoop reaches out to external systems on a schedule — nothing reaches in.

This means:
- **Zero inbound attack surface.** No open ports, no public endpoints.
- **No webhook secrets to rotate** or signature validation to get wrong.
- **No auth tokens exposed** on your infrastructure.
- **Works behind NAT, firewalls, VPNs** with zero configuration.

Your org reaches out. Nothing reaches in.

```yaml
# connectors/github.yaml — outbound polling, no inbound surface
id: github
type: source
config:
  repo: "my-org/my-repo"
  poll_interval: 5m
  token: "${GITHUB_TOKEN}"
```

---

## Transform-based Prompt Injection Defense

Events from external sources can contain adversarial content — a GitHub comment with "ignore previous instructions," a Linear ticket with embedded authority claims. OrgLoop's answer: **Transforms intercept events before they ever reach an actor.**

The `injection-scanner` transform inspects event payloads for known injection patterns and drops or sanitizes them in the pipeline:

```yaml
# routes/engineering.yaml
routes:
  - name: "GitHub activity → Engineering agent"
    when:
      source: github
      event: resource.changed
    transforms:
      - drop-bot-noise
      - injection-scanner      # ← catches injection attempts
    then:
      target: engineering-agent
```

If the scanner detects an injection attempt, the event is **dropped** — it never reaches the LLM. The drop is logged with full context for audit.

This is defense-in-depth: actors should still handle adversarial input (ACIP, trust levels), but the transport layer filters the obvious attacks before they arrive.

---

## Input Validation & Schema Enforcement

Connectors declare the event schemas they emit. `orgloop validate` enforces them **before runtime**:

```bash
$ orgloop validate

✓ connectors/github.yaml — valid source definition
✓ connectors/openclaw.yaml — valid actor definition
✗ routes/engineering.yaml — error at routes[0].transforms[1]:
    Transform "injection-scanner" not found. Did you mean "injection-scan"?

1 error, 0 warnings
```

At runtime, malformed events are rejected at ingestion — not when they reach an actor. Schema enforcement catches:

- Missing required fields
- Unexpected event types
- Malformed payloads
- Reference integrity violations (routes pointing to nonexistent sources or actors)

---

## Least-Privilege Actor Isolation

Actors only see events their routes explicitly match. There is no broadcast bus, no "subscribe to everything." Routes are **allow-lists**, not deny-lists.

- The engineering agent sees GitHub and Linear events — nothing else.
- The on-call actor sees PagerDuty alerts — not your code reviews.
- A compromised actor can't eavesdrop on events it was never routed.

Every route is a deliberate, auditable decision about who sees what.

---

## Secrets Management

Connector configs support `${ENV_VAR}` substitution. Secrets never live in YAML:

```yaml
# connectors/github.yaml
config:
  token: "${GITHUB_TOKEN}"      # resolved from environment at runtime

# connectors/slack.yaml
config:
  bot_token: "${SLACK_BOT_TOKEN}"
```

In practice:
- Local development: `.env` file (git-ignored)
- Production: platform secret stores (1Password CLI, AWS Secrets Manager, Vault)
- CI: injected via environment

OrgLoop never logs resolved secret values. `orgloop validate` checks that referenced environment variables exist without printing them.

---

## Audit Trail by Default

Loggers are **first-class primitives** in OrgLoop, not optional add-ons. Every event, every routing decision, every transform result, every delivery is logged:

```jsonl
{"ts":"...","phase":"source","source":"github","event_id":"evt_abc","event_type":"resource.changed"}
{"ts":"...","phase":"transform","transform":"injection-scanner","event_id":"evt_abc","result":"pass"}
{"ts":"...","phase":"route","event_id":"evt_abc","matched":"github-to-engineering"}
{"ts":"...","phase":"deliver","event_id":"evt_abc","target":"engineering-agent","status":"delivered"}
```

You get a complete, queryable trail of **what happened, why it was routed that way, and what the system did about it.** Dropped events are logged with the reason. Transform mutations are logged with before/after.

```bash
# Trace a specific event end-to-end
$ orgloop logs --event evt_abc123

# Show all dropped events in the last hour
$ orgloop logs --result drop --since 1h
```

---

## Supply Chain Security (Connectors)

Connectors are **npm packages** — auditable source code, not opaque marketplace plugins.

- `@orgloop/*` — first-party connectors, maintained by the OrgLoop team
- Community connectors — published openly on npm, standard review applies

This gives you:
- `npm audit` for vulnerability scanning
- `package-lock.json` for deterministic installs
- Full source code inspection before you trust a connector with your event stream
- No walled-garden marketplace, no binary blobs

---

## Plan Before Apply

`orgloop plan` shows exactly what will change before any config is applied:

```bash
$ orgloop plan

  Sources:
    + github          (new — poll every 5m)
    ~ claude-code     (changed — hook_type: post-exit → exit)

  Transforms:
    + injection-scanner  (new — script)

  Routes:
    + github-to-engineering  (new)

Plan: 3 to add, 1 to change, 0 to remove.
Run `orgloop apply` to execute this plan.
```

No surprise mutations. You review the diff, then apply. Infrastructure-as-code discipline applied to your organization's operational topology.

---

## Network Posture

OrgLoop's default network posture is **zero inbound connections:**

- Sources poll outbound — no listening ports
- `orgloop apply` runs as a local daemon with no network exposure
- `orgloop serve` (HTTP API) is **opt-in** and binds to `127.0.0.1` by default

For production deployments:
- Run behind Tailscale, WireGuard, or your VPN of choice
- If `orgloop serve` is needed, bind explicitly: `--host 0.0.0.0` requires a conscious decision
- Webhook ingestion (for push sources) should sit behind a reverse proxy with TLS

---

## Security Roadmap

Planned security features for future releases:

- **Signed connectors** — cryptographic verification that a connector package hasn't been tampered with
- **SBOM generation** — software bill of materials for your entire OrgLoop deployment
- **Event encryption at rest** — encrypt logged events and checkpoints at rest
- **Connector permissions model** — declare what system access a connector requires (network, filesystem, secrets) and enforce it
- **Rate limiting primitives** — built-in rate-limit transforms with per-source and per-route granularity
