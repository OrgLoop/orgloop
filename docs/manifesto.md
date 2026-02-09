# 🧬 Organization as Code

*By Charlie Hulcher*

---

## The Wall

You're running AI agents. OpenClaw, Claude Code, Codex, Deep Research — maybe all of them. Each one is genuinely capable. And yet you're still the glue.

You're the one who remembers that Claude Code finished at 3am and nobody picked up the output. The one who notices CI failed three hours ago and no agent caught it. The one awake at 2am thinking "did that PR ever get reviewed?" The intelligence exists, but the scaffolding to scale it doesn't.

You've tried the obvious fixes:

- **Cron jobs and heartbeats.** The agent wakes every 15 minutes and rabbit-holes on one interesting thing while ignoring three urgent ones. Time-based polling is unfocused. It's lossy.
- **Better prompts.** Elaborate system prompts: "check GitHub, check Linear, check CI..." More instructions don't make a probabilistic system deterministic.
- **More agents.** A GitHub agent, a Linear agent, a CI agent. Now you have a coordination problem. You've moved the glue from human-to-agent to agent-to-agent.

None of this works because you're solving a systems problem with better actors. That's like making a company work by hiring smarter people without building processes.

## The Insight

**You don't need reliable actors if you have a reliable system around them.**

Human organizations figured this out centuries ago. No individual is reliable across every dimension — people forget, get sick, make mistakes. So we built processes, handoff protocols, escalation paths. The system ensures outcomes even when actors are imperfect.

AI agents are the same. They're probabilistic — not because the tech is bad, but because that's what actors *are*. This isn't a bug. It's a property to design around.

The breakthrough: **a deterministic layer that ensures every meaningful state change triggers an appropriate response, regardless of whether any individual actor remembers to check.**

> We don't implement the action. We automate the nudge — with direction.

An agent told to do a specific job at a specific point in time is pretty reliable. We just need to employ them at the right time, for the right job, with the right instructions.

## 🧬 Organization as Code

I call this paradigm **Organization as Code**.

Same shift that happened with servers — SSH'ing into machines and tweaking config files became Infrastructure as Code. Declarative. Version-controlled. Reproducible. Organization as Code applies that same shift to how organizations operate. Your event sources, your actors, your wiring — all declared in config. Auditable. No hidden state, no tribal knowledge, no human glue.

Here's what my engineering org looks like:

```yaml
# orgloop.yaml — my engineering org

sources:
  - id: github
    connector: github
    config: { repo: "my-org/my-repo", poll_interval: 5m }

  - id: linear
    connector: linear
    config: { team: engineering }

  - id: claude-code
    connector: claude-code
    config: { hook_type: post-exit }

actors:
  - id: engineering
    connector: openclaw
    config: { agent: engineering, session: isolated }

routes:
  - name: "PR review → Engineering"
    when: { source: github, event: resource.changed }
    transforms: [drop-bot-noise, injection-scanner]
    then: { actor: engineering }
    with: { prompt_file: "./sops/pr-review.md" }

  - name: "CI failure → Engineering"
    when: { source: github, event: actor.error }
    then: { actor: engineering }
    with: { prompt_file: "./sops/ci-failure.md" }

  - name: "Dev session done → Supervisor"
    when: { source: claude-code, event: actor.idle }
    then: { actor: engineering }

  - name: "Ticket moved → Engineering"
    when: { source: linear, event: resource.changed }
    then: { actor: engineering }
    with: { prompt_file: "./sops/linear-ticket.md" }
```

Read that and you see an organization's nervous system. Every event that matters, where it goes, what responds. If there's a gap — a lifecycle event with no route — it's visible. If something's firing too much or not enough — the logs tell you.

## The Five Primitives

**Sources** — things that emit events. A GitHub repo, a Linear project, a Claude Code session. Anything that changes state.

**Actors** — things that do work when woken. An OpenClaw agent, a Claude Code team, a human via notification.

**Routes** — declarative wiring. When source X emits event Y, wake actor Z with context C. Pure routing, no business logic.

**Transforms** — optional pipeline steps. Filter noise, scan for prompt injection, rate-limit. Mechanical — actors handle reasoning, transforms handle plumbing.

**Loggers** — passive observers. Every event, every transform, every delivery — captured for debugging and audit.

And here's what makes it click: **the org loops.** 🧬 When an actor finishes work, that completion is itself an event — routed back into the system to trigger the next actor. The supervisor evaluates, relaunches. The dev agent completes, the supervisor evaluates again. The organization sustains itself through continuous cycles of events triggering actors triggering events. That's **OrgLoop**.

## Launch Prompts: Focused Context Beats Overwhelming Context

Notice the `with` on those routes. That's a **launch prompt** — a focused SOP delivered alongside the event, telling the actor exactly how to approach this specific situation.

Without launch prompts, the actor's system prompt becomes a grab-bag: "if you get a PR review, do X; if CI fails, do Y; if a ticket moves, do Z..." Scale that to twenty event types and the agent drowns. This is the same problem that led OpenClaw from MCP tools (everything loaded always) to Skills (focused, loaded only when relevant). The agent performs dramatically better with one clear SOP than a menu of twenty.

Routes carry focused launch prompts — your actor gets situational SOPs per event, not every possible instruction at once. The actor owns its identity and capabilities. The route owns the situational instructions.

```markdown
<!-- sops/pr-review.md -->
# PR Review Received

A team member submitted a review on your PR.

1. Read every comment carefully
2. Code change requests → make the fix, push
3. Questions → respond with an explanation
4. Disagreements → explain your reasoning
5. After addressing all comments, re-request review
```

Same actor, different prompts per route. The routing layer decides which SOP is relevant — the actor doesn't have to figure it out.

## What This Gets You

**Nothing gets dropped.** Every state change triggers a deterministic, immediate, focused response. The right actor wakes with the right context for exactly what changed.

**Actors stay focused.** No more scanning broadly for anything that might need attention. Each wake is one job, one SOP, one lifetime. If it fails, the system catches the failure and routes that too.

**Humans become optional.** Not eliminated — optional. Where you trust the actors and the SOPs, the system runs autonomously. You observe via logs and intervene when needed. You're not the glue anymore.

**It scales declaratively.** New source? Add a connector. New actor? Add a connector. New wiring? Add a route.

**It's platform-agnostic.** Swap GitHub for GitLab — new connector, same routes. Swap OpenClaw for a custom framework — new connector, same routes.

## What This Unlocks

Infrastructure as Code didn't just make servers easier to manage — it created an entirely new category of tooling, visibility, and capability. Organization as Code does the same.

**A common pattern for your entire organization.** That engineering pipeline I showed? The same YAML structure works for sales follow-ups, customer support triage, content publishing, compliance monitoring — any process where events trigger work. One format. One place. Readable, auditable, iterable.

**A foundation for observability.** Every event flows through OrgLoop with a trace ID. What's in flight, what's stalled, what's completing, what's failing — across every business process. This is the foundation for the oversight layer that lets you manage at the level of objectives, not individual agent sessions.

**Launch prompts that scale.** Route-paired SOPs mean your actors get sharper as your org grows more complex, not duller. Twenty routes means twenty focused instructions, not one bloated system prompt. The MCP tools → Skills insight, applied to organizational wiring.

**Composability.** Connectors, transforms, and loggers are independently publishable packages. Anyone can build and share a connector for their platform — no approval needed, no registry gatekeeping. The ecosystem grows without bottlenecks.

**🧬 Modules.** This is where it gets interesting. OrgLoop modules let you package and share entire business processes. My engineering org — the sources, routes, transforms, SOPs — is a module you can install. `npm install @orgloop/module-engineering`, wire up your credentials, `orgloop apply`. A complete autonomous workflow, packaged and shareable.

**Security as a first-class concern.** Transforms give you a standardized place to implement security policy — prompt injection scanning, provenance-based filtering, rate limiting — declared in your org spec and auditable.

## The Autonomy Ladder

1. **Manual** — Human does everything, AI assists occasionally
2. **Copilot** — AI does work, human reviews everything
3. **Supervised** — AI works autonomously, human monitors and intervenes
4. **Autonomous** — System runs itself, human observes and steers

Most teams are stuck between 2 and 3. They have capable actors but no system to ensure work accumulates toward objectives over long time horizons. The human is still the glue — routing decisions and nudges through themselves, thinking this is what AI can do.

The real question: can I define an objective and have event sources acted on from input to output with no human in the loop?

Organization as Code is what enables level 4. Not by making actors smarter — by making the system around them deterministic, steerable, and debuggable.

## OrgLoop

I'm building this in the open. The reference implementation is called **OrgLoop** — because the defining feature is the loop.

It's already proven. My "ticket to human-caliber PR" pipeline runs autonomously: Linear ticket → feedback-addressed, CI-passing, QA-evidence-attached pull request — no human in the loop. When a PR gets a review comment at 2am, the poller catches it, wakes the agent with the PR review SOP, and feedback is addressed. When Claude Code finishes at 3am, the hook fires, the supervisor evaluates, and relaunches for QA. I have the confidence to scale the rest of the org without forgetting how the wiring works.

The agents aren't the problem. The system around them is.

---

**OrgLoop is open source under BSL 1.1** — community-friendly, source-available, with protections against corporate co-opting. Read the code, run it, contribute to it.

The demo I'm building toward:

```bash
npm install -g @orgloop/cli
npm install @orgloop/module-engineering
orgloop init --module engineering
# Edit: your repo, your agent, your credentials
orgloop apply
```

You just installed my engineering organization. The routes are running. Events are flowing. Your actors are waking with focused SOPs. The org loops. 🧬

---

*Charlie Hulcher is a founding engineer at Kindo, where he builds AI-powered enterprise software. He runs an autonomous engineering organization using OpenClaw, Claude Code, and a growing cast of AI actors — held together by Organization as Code.*
