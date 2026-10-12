---
name: pnpm patched-package cache
description: Recover an installed patched dependency whose files do not contain the committed safety patch.
---

A patched directory name and matching lockfile hash do not prove that the installed package contains the patch.

**Why:** After merging dependency updates, the image-size malformed-input test hung even though the installed directory had the correct patch hash. Rebuilding the package did not repair it; a forced frozen-lockfile install restored the patch and the tests passed.

**How to apply:** If a committed patch's guard is absent from the installed files, repair the dependency installation with `pnpm install --frozen-lockfile --force`, then rerun its focused safety test. Do not weaken the test or spend EAS credits while the safety check fails.
