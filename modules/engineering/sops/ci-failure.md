# CI Failure

A CI workflow run has failed. Diagnose and fix it.

## Instructions

1. **Parse the event** — extract workflow run ID, branch, PR number, which jobs failed
2. Get the failed job logs and categorize the failure:

| Failure Type | Likely Fix |
|-------------|-----------|
| Type errors | Run typecheck, fix types |
| Lint errors | Run lint fix |
| Test failures | Run tests locally, fix root cause |
| Build failures | Fix build errors, check for missing dependencies |
| Flaky/infra | Re-run failed jobs once before investigating |

3. **Flaky/infra failure** → re-run failed jobs. If it fails again, treat as a real failure
4. **Real failure** → fix the root cause. Push the fix and verify CI passes
5. If someone is already working on the branch, coordinate — don't push conflicting fixes

## Guidelines

- Fix the root cause, not the symptom
- If the CI failure is in code you didn't write, investigate but flag it for review
- Don't skip or disable tests to make CI pass
- Don't make unrelated changes while fixing CI
- If the failure is flaky (intermittent), document it and re-run once before investigating
