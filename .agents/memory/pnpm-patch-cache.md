---
name: pnpm patched-package cache
description: Recover an installed patched dependency whose files do not contain the committed safety patch.
---

A patched directory name and matching lockfile hash do not prove that the installed package contains the patch. Also verify patched dependency upgrades through the complete application bundler, not only isolated parser tests.

**Why:** An installed image-size patch once had the expected hash but lacked its safety guard until a forced frozen install. Separately, image-size 2.0.4 passed isolated malformed-input tests but failed Expo export because Metro 0.83.3 did not receive a callable default export.

**How to apply:** Confirm the guard in the installed package, run its focused test and a full Expo export, and only remove the 1.2.1 patch after a Metro-compatible upstream upgrade is verified. If a committed guard is absent, repair with `pnpm install --frozen-lockfile --force`. Do not weaken the safety test or spend EAS credits while it fails.
