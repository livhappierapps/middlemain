# Middlemain open-source and release readiness

## Goal
Prepare the current workspace for a maintainable developer-facing release without leaking private data, changing repository visibility, or triggering paid builds.

## Phases
1. Inventory the repository, documentation, assets, build state, and current worktree — complete.
2. Run the project security scanners and baseline free checks; triage findings — complete, with one privacy scan failure and four high dependency findings documented.
3. Add a clear developer index and consolidate only genuinely duplicated documentation or code — complete; source modules stayed separated because they have distinct responsibilities.
4. Update the README, user guide, generated guide, and security status — complete.
5. Rerun checks and report remaining decisions and release gates — complete.

## Constraints
- Do not publish or push code publicly until the user confirms repository visibility and chooses a license.
- Do not start EAS builds, store submissions, paid provider calls, or credential rotation without fresh approval.
- Never print, commit, or copy secrets into documentation.
- Do not delete or flatten code/assets without proving they are unused and safe to remove.
- Do not claim physical-device behavior or store approval without evidence.
- Do not implement or alter queued project tasks from this Build request; task assignment and task-list management remain separate.

## Errors and blockers
- A previous preview emitted an unexplained HTTP 415; the screen rendered, but the resource was not identified.
- Store builds and app-store approvals may require account-owner actions and fresh cost approval.
- The repository has no license and is not ready to publish publicly: tracked workspace material and attachments need review, and the current dependency/privacy scan gates are not clear.
- No EAS build or GitHub push was performed.
