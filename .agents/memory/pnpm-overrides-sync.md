---
name: pnpm lockfile overrides sync
description: Root package.json must have pnpm.overrides matching pnpm-lock.yaml or EAS frozen install fails.
---

# pnpm Lockfile Overrides Sync

## The Rule
The root `package.json` must have a `"pnpm": { "overrides": {...} }` section that exactly matches the `overrides:` block in `pnpm-lock.yaml`. If they don't match, `pnpm install --frozen-lockfile` (which EAS Build runs) will error with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`.

**Why:** Replit's pnpm workspace template generates overrides in the lockfile (to exclude unnecessary platform binaries for esbuild, rollup, lightningcss, etc.) but does not always persist those overrides back to `package.json`. EAS Build uses `--frozen-lockfile` strictly, so any mismatch is a hard failure.

**How to apply:**
1. After any `pnpm update` or `pnpm install --no-frozen-lockfile`, run `pnpm install --frozen-lockfile` locally to verify it passes.
2. If it fails with `LOCKFILE_CONFIG_MISMATCH`, copy the `overrides:` block from `pnpm-lock.yaml` into `package.json` under `"pnpm": { "overrides": {...} }`.
3. Run `pnpm install --frozen-lockfile` again to confirm clean before pushing to GitHub.

## Native builder platforms
Do not exclude Darwin variants merely to reduce Linux workspace dependencies.

**Why:** EAS iOS workers use macOS; a Linux installation/typecheck cannot demonstrate those workers have their required native binaries.

**How to apply:** Preserve macOS variants for native build tooling. Let the package manager select by platform rather than applying Linux-only exclusions to a cross-platform lockfile.
