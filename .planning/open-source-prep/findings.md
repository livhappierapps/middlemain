# Findings

- Branch `main` is three commits ahead of `origin/main`; no push was performed.
- The repository has no license. Tracked `attached_assets/` files are not referenced by tracked source, and `.agents/` contains workspace support material that must be reviewed before public release.
- Latest dependency scan: 0 critical, 4 high (braces 3.0.3, image-size 1.2.1 with two advisories, node-forge 1.4.0).
- Latest SAST scan: 0 findings. Latest HoundDog privacy/dataflow scan failed with `HOUNDDOG_SCHEMA_MISMATCH`, so privacy status is unverified.
- A tracked-text pattern sweep found no `.env`/keystore files and no complete valid PEM private-key block; it did not inspect binary attachments or Git history.
- Added a developer index, refreshed README/security status, documented Human Hands in the canonical user guide, and regenerated the bundled guide.
- Verification passed: typecheck; 49 Middlemain regression tests; 11 API/Human Hands tests; API build; local web/iOS/Android Expo export.
- Middlemain is one artifact in a multi-artifact pnpm workspace; broad file flattening would make independent products and security boundaries harder to understand.
- No EAS build, store submission, repo visibility change, or GitHub push was performed.
