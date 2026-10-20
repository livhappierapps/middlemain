# Security status and release gates

## Current workspace scan — October 20, 2026

- Latest pnpm audit: **0 critical, 4 high, 0 moderate, 0 low**. It reports `braces` 3.0.3, `image-size` 1.2.1 (two advisories), and `node-forge` 1.4.0. Although upstream `image-size` 2.0.4 is listed as fixed, Expo's Metro 0.83.3 asset bundler fails with that release's default export; the app retains tested malformed-input guards on 1.2.1 instead. `node-forge` remains in Expo/EAS tooling with no fixed registry release, and `braces` remains locally guarded because no fixed upstream version is available.
- Static-code scan: **0 findings**.
- Privacy/dataflow scan: **not verified**. The latest HoundDog run failed with `HOUNDDOG_SCHEMA_MISMATCH`; treat this as a scanner failure, not a clean scan.
- The workspace runs as the unprivileged `runner` account (UID 1000); no world-writable tracked files were found. `sudo` is not needed or used.
- A narrow secret-pattern sweep found matches only in reference documentation, signing-marker scripts, and tests; matched values were not printed. It is not a complete secret scan and did not inspect images or full Git history.
- Git/deployment ignore rules now exclude common signing files, local environment files, release binaries, agent/planning material, and future user uploads. Previously tracked attachments remain in Git and need review before any public release.

## Findings

The starting Replit dependency scan reported **91 findings** (12 critical, 46 high, 25 moderate, 8 low). The direct registry audit used a different snapshot (14 critical, 49 high, 22 moderate, 6 low). Keep those sources separate when comparing counts.

After compatible Expo/EAS/codegen upgrades and synchronized overrides, both the final Replit dependency scan and registry audit report **0 critical, 4 high, 0 moderate, 0 low**:

| Finding | Status |
|---|---|
| image-size: zero-sized JXL/HEIF box loops | Guarded in a pnpm patch; rejects ambiguous/invalid box lengths rather than changing Metro's expected API. |
| image-size: zero-sized ICNS entry loops | Guarded in the same patch; crafted-entry and normal PNG tests. |
| braces: deeply nested AST stack exhaustion | Parser depth guard for string-derived brace/parenthesis trees; normal expansion and nested-input tests. |
| node-forge: RSA PKCS#1 DigestAlgorithm ambiguity | No published fixed version. Remains in the latest EAS development toolchain; public production download cannot execute EAS. Not described as fixed. |

Version-based scanners still list the three patched advisories. Preserve `patches/`, their manifest entries, and the frozen lockfile in GitHub/EAS. Re-test and remove a patch only when a compatible upstream fix replaces it.

Manual review also found and repaired unauthenticated owner-funded Grok access and inbound owner webhooks, duplicate SSE readers with stalled-stream/buffer failure modes, repeated paid-provider attempts, incorrect submission CLI flags, source/bundle filesystem path assumptions, unbounded download redirects/tool execution, unsafe purchase simulation, and stale generated source packaging.

## Required before shipping

1. The secured backend has been published and its owner-authorization requirement verified live. New download-manifest/client changes still require publication; a source commit alone does not update production.
2. Rotate/revoke the formerly exposed AIs & Ears service key at its issuer. Do not assume deleting the source literal invalidates history, devices, or old APKs.
3. Verify the new separate live-room host key and native secure-storage recovery on a real device; load-check room/frame/client/stream bounds and persistence. Old room hosts must create a new room; history is preserved. Shared links still permit guest participation and are not private account sessions.
4. EAS-managed Apple signing is configured. No additional certificate revocation is needed for this release; never auto-revoke other apps' certificates.
5. Configure customer GitHub App device flow and validate it on native hardware. Mock tests cannot authorize a real customer.
6. Keep purchases explicitly unavailable until real StoreKit/RevenueCat implementation and restoration are tested. Provider billing is separate.
7. Build fresh binaries for native-device testing and complete those checks before public release. Never promote an older APK as containing newer security/privacy fixes.
8. Record a verified new APK URL, publish the download manifest, verify APK bytes through the proxy, complete iOS build/submission, and check App Store processing.

## Scope limits

Earlier static-code and privacy scans reported no findings. The latest static-code scan also returned zero findings, but the latest privacy/dataflow scan failed before producing results; see the dated scan above. Previously recorded tests, exports, and store-build results below describe earlier source revisions and do not validate the current workspace. Local checks do not substitute for native-device tests.

ASC authentication, the matching App Store record, and EAS signing were verified in earlier work. iOS production version 1.2.0 build 1 reached Apple's VALID processing state, and an Android APK was previously verified through its task-preview proxy. Those older artifacts do not contain this task's changes. The current source commit is on GitHub, but no production publish or new native build was started; the last recorded production API check returned 503. As of October 20, 2026, the checked privacy, terms, and support URLs return the generic homepage (HTTP 200), not the required policy/support content. The correct live pages are still needed before store review.

The Guide's question composer is visible in the preview after the tab-overlap fix. The development console reports the existing Expo AV deprecation warning. Chromium tracing identified the preview's HTTP 415 as its own DNS-over-HTTPS request to `https://1.1.1.1/dns-query`; it is not a Middlemain API response, and the captured page had no application JavaScript exceptions. Assets rendered correctly on the settled preview, but native-device behavior remains unverified.

Static/privacy scans do not inspect all historical Git objects, remote provider settings, device backups, native OS behavior, App Store metadata, or every runtime path. No paid AI requests are used as tests. The RSA-tooling advisory, external key rotation, production deployment, room host controls, and native validation must not be hidden behind a “clean security scan” claim.

## Repository preflight security boundary

An attempted `image-size` 2.0.4 update passed isolated parser tests but failed the Expo web export because Metro 0.83.3 received a non-callable default export. The compatible 1.2.1 package and its malformed-input guards are retained and covered by regression tests. The `braces` advisory remains mitigated by a local depth guard; the node-forge advisory still lists no patched release. Dependency inspection places node-forge in Expo/EAS tooling, not the API server's dependency graph; that does not make the signing-toolchain finding fixed.

The new repository preflight never executes uploaded code, installs dependencies, runs package hooks, or loads repository compiler plugins. Its compiler reads supplied virtual files and trusted compiler standard libraries only. Source/file/output limits, two-worker concurrency, worker heap limits, timeouts, cancellation and cleanup are enforced. Uploaded source is not persisted by this checker; request logs contain counts/status, not source or GitHub tokens. Physical-device behavior, embedded-secret detection, secure storage of saved connector credentials and external key revocation still need separate verification/remediation.
