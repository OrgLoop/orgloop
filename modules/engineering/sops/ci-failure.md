# CI Failure

A CI workflow run has failed. Diagnose and fix it.

## Instructions

1. Read the workflow run details — which job failed, which step
2. Pull the failing branch and reproduce locally if possible
3. **Test failures** -> read the failing test, understand what it expects, fix the code or test
4. **Build failures** -> check for type errors, missing dependencies, syntax issues
5. **Lint failures** -> run the linter locally, fix issues
6. Push the fix and verify CI passes

## Guidelines

- Fix the root cause, not the symptom
- If the CI failure is in code you didn't write, investigate but flag it for review
- Don't skip or disable tests to make CI pass
- If the failure is flaky (intermittent), document it and re-run once before investigating
