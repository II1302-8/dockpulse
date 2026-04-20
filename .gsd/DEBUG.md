# Debug Session: pre-commit-missing

## Symptom
`git commit` fails with error: `` `pre-commit` not found. Did you forget to activate your virtualenv? ``

**When:** During `git commit` or `git merge --continue`.
**Expected:** Pre-commit hooks should execute successfully.
**Actual:** Shell cannot find the `pre-commit` executable.

## Evidence
- Terminal: PowerShell
- OS: Windows
- Git hooks are likely configured to call `pre-commit` directly.
