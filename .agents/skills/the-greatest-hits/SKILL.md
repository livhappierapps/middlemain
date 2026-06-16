---
name: the-greatest-hits
description: Full maintenance sweep for the Middlemain app. Run when the user says "greatest hits", "run the greatest hits", "do a maintenance pass", "clean up the app", or "quality sweep". Executes four steps in order: (1) security scan, (2) test/fix loop until passing, (3) file/folder cleanup and declutter, (4) update replit.md and MEMORY.md.
---

# The Greatest Hits

A full maintenance and quality sweep for the Middlemain mobile app. Run this end-to-end whenever the user asks for it. Don't skip steps — each one builds on the last.

## When to Use

- User says "greatest hits", "run the greatest hits", "do a maintenance pass", "clean up", "quality sweep", or similar.
- After a big feature push or before a store submission.

## Steps

### Step 1 — Security Scan

Load and run the `security_scan` skill (`.local/skills/security_scan/SKILL.md`).

- Run `runDependencyAudit`, `runSastScan`, and `runHoundDogScan`.
- Triage output: fix any **critical** or **high** findings immediately.
- Log a summary of what was found and what was fixed.
- Re-run the scan after fixes to confirm clean.

### Step 2 — Test, Fix, Retest Loop

Load and run the `testing` skill (`.local/skills/testing/SKILL.md`).

- Run end-to-end tests against the Middlemain app using `runTest()`.
- For every failing test: identify root cause → fix the code → retest.
- Keep looping until **all tests pass**.
- If a test cannot pass due to a missing environment or external dependency (e.g. real Apple credentials, store API), document the skip reason clearly instead of leaving it silently broken.

### Step 3 — Clean, Declutter, Organize

Audit the Middlemain artifact (`artifacts/middlemain/`) for:

- **Dead files**: unused components, old test files, leftover assets, duplicate images. Delete them.
- **Dead code**: commented-out blocks, unused imports, unreachable branches. Remove them.
- **Folder structure**: ensure it follows Expo Router conventions — `app/`, `context/`, `components/`, `assets/images/`, `constants/`. Move misplaced files.
- **Console logs**: remove `console.log` debug statements left in production code (keep intentional error logs).
- **Naming**: rename any files that don't match the project's camelCase/kebab-case conventions.

After cleaning, run `pnpm --filter @workspace/middlemain run typecheck` (if available) to confirm nothing broke.

### Step 4 — Update the Docs

Update two files to reflect the current state of the project:

**`replit.md`** — Update the project overview section:
- Current version and build number from `app.json`
- List of active features (tabs, AI providers, vision, themes, etc.)
- Any known limitations or TODOs

**`.agents/memory/MEMORY.md`** — Add or update entries for:
- Any non-obvious fix discovered during the security scan
- Any structural decision made during cleanup
- Anything a future agent would need to know that isn't obvious from reading the code

## Output Format

After completing all four steps, give the user a summary like this:

---
**Greatest Hits Complete ✅**

**Security:** [X critical / X high found → fixed / none found]
**Tests:** [X passing, X skipped (reason)]
**Cleanup:** [X files deleted, X imports removed, X files moved]
**Docs:** replit.md updated, MEMORY.md updated

**Next recommended action:** [e.g. "Push to GitHub and retry EAS build"]
---

## Project-Specific Notes

- App lives at `artifacts/middlemain/` inside a pnpm monorepo.
- Bundle ID: `app.middlemain.bridge`
- The Expo workflow is named `artifacts/middlemain: expo` — restart it after any dependency or config changes.
- `pnpm install --frozen-lockfile` must pass before pushing to GitHub (EAS build requirement).
- Shadow/textShadow deprecation warnings are web-only noise — safe to ignore, do not treat as errors.
- XAI_API_KEY is stored as a Replit secret — never log or expose it.
