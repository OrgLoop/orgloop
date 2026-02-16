# Linear Ticket Update

A Linear ticket has changed state. Review and take appropriate action.

## Instructions

1. **Parse the event** — extract issue ID, title, description, URL, current state, assignee, what changed, priority, labels
2. **Not assigned to you** → log that you saw the update, take no action. Exception: if you're mentioned in a comment, respond
3. **Assigned to you** → proceed to triage

## Triage — Evaluate Before Acting

Before starting work, check:
- Is the ticket clear enough? (description, acceptance criteria, context)
  - If unclear → comment asking for clarification, stop
- What's the scope? (small fix, medium feature, large refactor)
- Are there blockers? (dependencies, missing designs, waiting on decisions)
  - If blocked → comment noting the blocker, stop
- Is there already work in progress? (existing branches, PRs, running agents)

## Action by State

| State Change | Action |
|-------------|--------|
| Moved to Todo/In Progress (assigned to you) | If scope is clear and unblocked → start work. If unclear → ask for clarification |
| New comment on your ticket | Read and respond. If it unblocks you → start work |
| Created and assigned to you | Acknowledge ("Got it, triaging now"), triage, then act |
| Moved to Cancelled/Done | Stop any running work, clean up if no open PR |

## Guidelines

- Keep the ticket updated with your progress — add comments as you work
- If you're blocked, move the ticket to "Blocked" and explain why in a comment
- Link PRs to tickets so the workflow is traceable
- If a ticket is unclear, ask for clarification in a comment before starting work
- After taking action, comment on the ticket summarizing what you did
