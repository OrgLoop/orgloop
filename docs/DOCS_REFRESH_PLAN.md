# Docs Refresh Plan

Addressing feedback from Brandon and Nick (2025-02-11).

---

## 1. Manifesto Tone: Visionary but Grounded

**Problem:** Two engineers gave feedback: one didn't like the LinkedIn speak, another found it hard to understand the actual problem until digging deeper. But the manifesto is a stake-in-the-ground document meant to reach a wide audience — VCs, execs, and engineers. We can't optimize solely for skeptical engineers at the cost of losing the vision.

**The real claim:** Just as infrastructure-as-code caused a massive shift in how we manage systems, LLMs now make it possible to define entire autonomous organizations of intelligence in repeatable, deployable, declarative ways. That IS a big deal, and we should say it clearly — even if it sounds ambitious. The goal is to be explicit and clear about this statement without wrapping it in marketing fluff.

**Approach — bridge both audiences:**
1. **Lead with the concrete problem** — engineers need to recognize their pain immediately. Don't make them dig to find it.
2. **Then go big on the vision** — once the problem is established, VCs and execs should see the paradigm shift clearly.
3. **Ground the vision in specifics** — every big claim should be followed by "here's what that actually looks like" with YAML, architecture, or concrete examples.

**Voice reference:** https://charlie.engineer/posts/task-master/
- Conversational and technically grounded
- Thinks through tradeoffs openly
- References real experience
- Not afraid of big claims, but earns them with specifics

**What to CUT:**
- Repetitive second-person drama ("You're the one who..." x3) — one instance is fine, three is a LinkedIn pattern
- Rhetorical filler ("here's what people miss", "and here's what makes it click")
- "That's **OrgLoop**" dramatic reveals
- The biographical footer
- The Autonomy Ladder as a numbered pitch-deck list (the concept is fine, the format reads like a slide deck)

**What to KEEP:**
- 🧬 emoji — it's brand. OrgLoop owns 🧬 like OpenClaw owns 🦞. Keep it.
- The core vision and big claims — just make sure they land clearly, not as hype
- Second person where it creates recognition ("if you're running agents, you've seen this")
- Marketing energy in the manifesto specifically — this document is *supposed* to inspire
- The content quality is high. This is a tuning pass, not a rewrite.

**The needle to thread:** Engineers should think "okay, this person gets my problem and has a real solution" within the first 2 paragraphs. Execs should think "this is infrastructure-as-code for AI organizations" by the end. Neither audience should feel like the other audience is being pandered to.

**Before/after examples:**

### The Wall section (opening)

**Before:**
> You're running AI agents. OpenClaw, Claude Code, Codex, Deep Research, Gas Town, maybe all of them. Each one is genuinely capable. And yet you're still the glue.
>
> You're the one who remembers that Claude Code finished at 3am and nobody picked up the output. The one who notices CI failed three hours ago and no agent caught it.

**After:**
> You're running AI agents. Claude Code, Codex, Deep Research, maybe all of them. Each one is genuinely capable. And yet you're still the glue.
>
> Claude Code finishes at 3am and nobody picks up the output. CI fails and no agent notices. You're context-switching between tools, checking dashboards, remembering what finished and what didn't. The agents have capability — what's missing is the coordination layer between them.

*Changes: Cut the triple "You're the one who..." repetition down to one. Added "coordination layer" — names the problem precisely so engineers see where this is going. Kept the opening recognition moment.*

### "The Insight" section

**Before:**
> **You don't need reliable actors if you have a reliable system around them.**
>
> Human organizations figured this out centuries ago. No individual is reliable across every dimension. People forget, get sick, make mistakes. So we built processes, handoff protocols, escalation paths.

**After:** Keep as-is. This is the manifesto's strongest section. The insight is clear, the analogy to human orgs is earned, and "centuries ago" is fine — it's true and it lands.

### "What This Gets You" section

Keep as-is. "Nothing gets dropped" is punchy and correct.

### "Installable Autonomous Organizations" subsection

**Before:**
> Now scale that idea. Someone builds a killer customer support flow... These aren't templates. They're running organizations you can clone... The app store for autonomous organizations.

**After:**
> Scale that idea. Someone builds a customer support flow — Zendesk + Intercom + triage routes + escalation SOPs — and publishes it as a module. You install it, configure your credentials, and the organization runs. These aren't templates. They're complete operational topologies with declared dependencies — installable autonomous organizations.

*Changes: Cut "killer" (marketing), reframed "app store" into the more precise "installable autonomous organizations" which is the actual concept. Kept the energy.*

### The Big Claim (NEW — add after "The Insight")

Add a clear, direct statement of the paradigm shift. Don't hide it or hedge it:

> 🧬 **Infrastructure as code reshaped how we manage systems. Organization as code reshapes how we manage intelligence.** LLMs make it possible to define entire autonomous organizations — with routing, escalation, handoffs, and recovery — in declarative, repeatable, deployable configurations. That's the bet OrgLoop is making.

### Remove entirely
- The biographical footer ("*Charlie Hulcher is a founding engineer at Kindo...*")
- "That's **OrgLoop**" dramatic reveals (let the reader connect the dots)
- The Autonomy Ladder as a numbered list (rework the concept into prose — the ideas are good, the format is a pitch deck)

### General rules for the rewrite
- First person is fine and encouraged ("I noticed", "I built this because")
- Second person is fine — it creates recognition. Just don't stack it ("You're the one who... You're the one who... You're the one who...")
- 🧬 is OrgLoop's brand emoji. Keep it. Use it intentionally, not as decoration.
- Remove filler lead-ins ("here's what people miss", "and here's what makes it click") — just say the thing
- Keep all technical content (YAML, architecture diagrams, code) unchanged
- Big claims are welcome — just earn them. Every vision statement should be followed within a paragraph or two by something concrete (a YAML snippet, an architecture detail, a real example)
- The manifesto should read like a founder explaining a paradigm shift to a smart audience that includes both builders and investors
- Litmus test: "Would an engineer roll their eyes at this?" If yes, ground it. "Would an exec understand the significance?" If no, make it clearer.

**File:** `docs-site/src/content/docs/vision/manifesto.md`

---

## 2. "Event-driven not cron-driven" Clarification

**Problem:** The README says "Event-driven, not cron-driven" but sources literally poll on cron intervals. This is confusing. The event-driven claim refers to the actor/routing model — actors wake on events, not on timers — but sources still use polling.

**Where it appears:**
- `README.md` → "Why OrgLoop" bullet: "Event-driven, not cron-driven -- actors wake when something happens, not on a timer"
- `docs-site/src/content/docs/index.mdx` → Card: "Event-Driven" / "Actors wake when something happens, not on a timer"

**Fix:** Clarify that sources may poll, but the routing/actor model is event-driven. Actors never poll — they are woken by matched events.

**Before (README):**
> - **Event-driven, not cron-driven** -- actors wake when something happens, not on a timer

**After:**
> - **Event-driven actor model** -- sources may poll, but actors never do. Actors wake only when a matched event arrives — no timers, no scanning, no idle loops.

**Before (docs index card):**
> **Event-Driven** / Actors wake when something happens, not on a timer. Every state change triggers a deterministic, focused response with a situational launch prompt.

**After:**
> **Event-Driven Actors** / Sources poll or listen; actors never do. Actors wake only when matched events arrive — each with a focused launch prompt for that specific situation.

**Files:** `README.md`, `docs-site/src/content/docs/index.mdx`

---

## 3. OpenClaw Connector Description — Directionality

**Problem:** The OpenClaw connector README says "it sends events outbound, it does not receive them." From whose perspective? From OrgLoop's perspective it sends outbound (to OpenClaw). But a reader might think "outbound" means OpenClaw is sending events out, which is backwards. The connector *delivers* events *to* OpenClaw.

**Before:**
> Delivers OrgLoop events to an OpenClaw agent via HTTP webhook. This is a **target-only** connector (actor) -- it sends events outbound, it does not receive them.

**After:**
> Delivers OrgLoop events to an OpenClaw agent via HTTP webhook. This is a **target-only** connector — it delivers events from OrgLoop to OpenClaw (via POST to the OpenClaw API). It does not act as a source.

**File:** `connectors/openclaw/README.md`

---

## 4. README First Line — Say What OrgLoop IS

**Problem:** The README's first meaningful line is the tagline "Organization as Code — declarative event routing for autonomous AI organizations." This tells you the paradigm and the buzzwords but not what the software actually does. The docs site has a better description buried in the "Why OrgLoop" section.

**Fix:** Add a one-paragraph "what it is" description immediately after the tagline, before the quote.

**Before:**
> **Organization as Code -- declarative event routing for autonomous AI organizations.**
>
> > You don't need reliable actors if you have a reliable system around them.
>
> AI agents forget, idle, rabbit-hole, drop context. OrgLoop doesn't fix the agents...

**After:**
> **Organization as Code -- declarative event routing for autonomous AI organizations.**
>
> 🧬 OrgLoop is a declarative runtime for autonomous AI organizations. You define event sources, actors, routes, and standard operating procedures in YAML. When something happens — a PR merges, a customer emails, CI fails — OrgLoop matches the event to a route and wakes the right actor with a focused prompt for exactly what to do.
>
> OrgLoop is open-ended and open source. Build your organization embracing all of your specialized agents: Claude Code Team implementers, OpenClaw supervisors, Deep Research lone wolves. Connect GitHub with Salesforce and Gmail. Whatever you want — use an existing connector or contribute one. Then see all your business processes — information flows, event handling prompts, transforms — in one place. Declarative and reproducible.
>
> > You don't need reliable actors if you have a reliable system around them.
>
> AI agents forget, idle, rabbit-hole, drop context...

Also apply the same fix to `docs-site/src/content/docs/index.mdx` — the opening paragraph is decent there already but should be tightened to lead with what the software *is* before why you need it.

**Files:** `README.md`, `docs-site/src/content/docs/index.mdx`

---

## 6. Manifesto Sharpening — Port README Clarity

Three concepts that emerged from the README rewrite should be explicitly ported into the manifesto:

### 6a. "Focused prompt for exactly what to do" (Skills for Events)
The manifesto talks about actors waking on events but never names the key differentiator: the actor doesn't just get *notified*, it gets a *scoped SOP*. This is the "skills for events" breakthrough — the same way a skill gives an agent capability, a route gives an agent situational purpose. Make this explicit in the manifesto's "how it works" section.

### 6b. "Declarative and reproducible"
The Installable Autonomous Organizations section dances around this but never says it cleanly. The IaC parallel is more powerful when stated simply: your org config is code — you can version it, diff it, clone it. Don't hedge or build up to it. Say it.

### 6c. "Open-ended"
The manifesto lists specific integrations which accidentally makes it feel bounded. Convey the platform play: "whatever you want — use an existing connector or contribute one." The system is open-ended by design, not limited to the connectors that exist today.

**File:** `docs-site/src/content/docs/vision/manifesto.md`

---

## 5. Logo / Mascot

**Problem:** Nick wants a cool logo/mascot.

**Action:** This is a design task, not a docs-text task. Recommend:
- Brainstorm concepts with Charlie (loop/infinity motif, circuit board, ouroboros, etc.)
- Commission or generate options
- Ship separately — don't block the text refresh on this

**No file changes for now.** Track as a follow-up.

---

## Summary of Files to Change

| File | Changes |
|------|---------|
| `docs-site/src/content/docs/vision/manifesto.md` | Full tone rewrite (#1) |
| `README.md` | Add "what it is" paragraph (#4), fix "event-driven" bullet (#2) |
| `docs-site/src/content/docs/index.mdx` | Fix event-driven card (#2), tighten opening (#4) |
| `connectors/openclaw/README.md` | Fix directionality description (#3) |

## Suggested Order of Operations

1. Manifesto rewrite (biggest, most impactful)
2. README "what it is" paragraph
3. Event-driven clarification (README + docs index)
4. OpenClaw connector directionality fix
5. Logo brainstorm (async/separate)

---

## Completion Status

All text changes implemented on 2026-02-11.

| Section | Status | Notes |
|---------|--------|-------|
| 1. Manifesto tone | **Done** | The Wall rewritten, filler cut, Autonomy Ladder reworked to prose, bio removed, dramatic reveals removed |
| 2. Event-driven clarification | **Done** | README bullet + docs index card both updated |
| 3. OpenClaw directionality | **Done** | Clarified delivery direction |
| 4. README opening paragraph | **Done** | Exact text from plan applied to README and docs index |
| 5. Logo/mascot | **Deferred** | Design task, tracked separately |
| 6a. Scoped SOP concept | **Done** | "Launch Prompts: Skills for Events" — made scoped SOP differentiator explicit |
| 6b. Declarative and reproducible | **Done** | Added "diffable, reproducible" + "version it, diff it, clone it, deploy it" |
| 6c. Open-ended platform play | **Done** | Renamed Composability → "Open-ended by design", strengthened Insight section |
| Big Claim paragraph | **Done** | Added after The Insight: "Infrastructure as code reshaped..." |
