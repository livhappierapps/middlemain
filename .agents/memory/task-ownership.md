---
name: Task ownership before implementation
description: Avoid duplicating previously started work that can merge while the main agent is active.
---

Check ownership of an existing task before implementing the same feature in the main workspace. If earlier work is already running separately or merging, review its result rather than building a competing version. Keep any simultaneous main-workspace edits limited to independent scope.

**Why:** Previously started help-and-guide work reached the merge queue while the main agent was working on the same surfaces. Duplicate implementation wastes time and creates avoidable merge risk.

**How to apply:** Treat task-state updates as current evidence, not stale conversational assignments. Do not assume an in-progress task belongs to the main agent merely because the user names it; use the explicit assignment and available ownership information.

Apply isolated task changes to the main Replit version before asking the user to republish them. Pushing the task's changes to GitHub is not the same as updating the main Replit version.

**Why:** A task-preview API worked while a successful user republish still served the old configuration; publishing used the unchanged main-version snapshot.

**How to apply:** Finish and validate the task, have its changes applied to main, then request publishing. Distinguish task-preview verification from production verification in release reports.
