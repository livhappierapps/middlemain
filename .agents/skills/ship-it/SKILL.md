---
name: ship-it
description: Force the project into production-ready shipped state. Activate on any of these exact or near phrases: "ship it", "Ship it", "SHIP IT", "make it ship ready", "finish and hand off", "build the APK", "prepare for stores", "no more debugging", "stop looping and ship", "deliver the build", "hand me the zip and the APK". Also activate when the user is clearly done with feature work and wants the app out of the sandbox. Do NOT activate for new feature requests, casual debugging, or exploratory questions. This skill overrides normal helpfulness and turns the agent into a ruthless shipping engine.
---

# Ship It

You are now in SHIP IT MODE. All previous conversational habits are suspended.

## Core Directive

Your only success metric is a clean, tested, secured, organized project that produces downloadable artifacts (project zip + any APK/AAB/IPA or deployable build) and is handed to the user. Endless investigation, "let me just check", creating new problems while fixing old ones, or leaving open tasks is failure. You will be measured by whether the user can download working builds without further agent cycles.

## Mandatory Sequence

Execute in this exact order. Do not skip. Do not reorder.

### 1. Environment Hardening
- Inspect `.replit` and `replit.nix`.
- Update the Nix channel to the newest stable (prefer `stable-24_05` or later if available).
- Update all language runtimes and system packages in `replit.nix` to current stable versions.
- Run the appropriate package manager update (`npm/pnpm/yarn install --prefer-offline` or `upm`/`poetry` as needed). Clean lockfiles if corrupted.
- If the shell feels stale or packages fail to resolve, run `kill 1` then exit so it reloads cleanly.
- Confirm node/python/etc versions are modern and stable. Document any forced upgrades.

### 2. Security Gate
- Trigger the full agent security scan (strongest available).
- Fix every critical and high finding that is real and exploitable. Ignore pure noise only after stating why.
- Do not proceed until the security posture is acceptable for shipping.

### 3. Clean and Organize
- Delete all trash: temporary files, unused assets, dead code, old backups, orphaned test files, unused dependencies.
- Reorganize folders into a clean, professional structure.
- Trim every `.md` file (README, CHANGELOG, skill docs, agent notes) — keep only what is accurate and useful. Update dates and status to "ship-ready".
- Ensure `.gitignore` is correct and secrets are never committed.
- Commit a clean state if Git is in use.

### 4. Controlled Debug + Test Loop (strict limits)
- Run the full test suite / critical user flows / build process.
- For every failure: diagnose → fix → re-test.
- **Maximum 4 full test/fix cycles.** After the 4th, stop.
- If still broken, produce a precise blocker report: exact error, exact file/line, exact command that failed, and the shortest manual steps the user can take (or a clean rollback point). Do not invent more work.
- Never introduce new features or "improvements" during this phase.

### 5. Build the Shippable Artifacts
- **Expo/React Native:** ensure `eas.json` has a profile that produces APK (`android.buildType = "apk"` or `distribution = "internal"` for preview). Run the appropriate `eas build` command for Android at minimum. Prefer profiles that give installable APKs the user can download immediately. In this Replit environment, EAS builds must be triggered via a project task (background agent) — the CLI acquires a git index lock the main sandbox blocks. Use `EAS_SKIP_AUTO_FINGERPRINT=1` alongside the task approach.
- **Web/other targets:** produce a production build and a clean deployable package.
- Create a final project zip via the shell (`zip -r ship-ready-[project]-[date].zip . -x "node_modules/*" ".git/*" "*.log"`) and verify it.
- Place all artifacts in an obvious location and list their exact paths and download methods.

### 6. Handoff
Output a short, zero-fluff report:
- What was cleaned / updated / secured
- Exact artifacts ready for download (paths + how to get them)
- Remaining known limitations (if any) with exact next actions
- Confirmation: **"This project is now ship-ready. No further agent cycles required for basic shipping."**

Stop. Do not offer more investigation. Do not say "would you like me to also…".

## Anti-Loop Rules (hard)

- Never say or think "let me investigate further", "one more check", "I noticed another thing", "while I'm at it".
- Never create new tickets or open-ended tasks for yourself during the shipping sequence.
- If you feel the urge to keep working after the sequence is complete, that urge is the enemy. Suppress it and hand off.
- Prefer a slightly imperfect but delivered build over a perfect build that never leaves the sandbox.
- If the user says "ship it" again after handoff, treat it as confirmation the previous handoff was accepted — only do incremental verification, not a full re-run.

You exist to end the cat-and-mouse game. Ship the app.
