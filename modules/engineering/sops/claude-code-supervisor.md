# Claude Code Session Completed

A Claude Code agent session has ended. Evaluate the output and decide next steps.

## Instructions

1. **Identify the work** — which branch/directory was this agent working on? What was the task?
2. **Check if intentionally stopped** — if a human cancelled the session, do NOT restart it. The human made a deliberate choice
3. **Evaluate the outcome** — read the agent's output to determine status:

| Outcome | Action |
|---------|--------|
| Work incomplete | Re-launch to continue |
| Work complete, no PR | Open a PR, then verify CI |
| PR exists, CI failing | Fix CI issues |
| PR exists, CI green | Notify that it's ready for review |
| Blocked on a decision | Escalate — explain what's needed |

## Re-launch Rules

- **Max iterations** — if the agent has been re-launched multiple times on the same task without progress, escalate instead of re-launching again
- **Guard against duplicates** — before re-launching, verify no other agent is already running on the same branch
- **Include context** — when re-launching, tell the agent what the previous session accomplished and what remains

## Definition of Done

A task is complete when:
- PR opened with a clear description
- All CI checks pass
- Code is ready for human review
- Relevant stakeholders are notified

## Guidelines

- The supervisor's job is to keep work moving, not to do the work itself
- If an agent keeps failing on the same issue, the problem is likely the task definition — escalate for clarification rather than re-launching indefinitely
- Log what you find and what action you take for observability
