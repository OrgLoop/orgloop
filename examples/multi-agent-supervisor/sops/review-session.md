# Review Claude Code Session

A Claude Code session has completed. Review what happened and decide next steps.

## Instructions

1. Read the session payload — check `exit_status`, `duration_seconds`, and `summary`
2. If a summary is provided, evaluate whether the described work sounds complete
3. Check the working directory for any uncommitted changes or failing tests
4. **Work looks complete** -> verify the PR is ready for review, move the ticket forward
5. **Work is partial** -> identify what remains and re-dispatch with specific instructions
6. **Session crashed (non-zero exit)** -> investigate the failure, retry with a simpler approach
7. **Session was very short (<30s)** -> likely hit an error early; check logs and retry with fixes

## Guidelines

- Don't trust the summary blindly — verify against actual repo state
- If re-dispatching, be specific about what needs to happen next
- Escalate to a human if the same task has failed multiple times
- Keep a running count of retries; stop after 3 attempts on the same task
