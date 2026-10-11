# Security status and release gates

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

1. Publish the secured backend with approval and verify unauthenticated owner operations fail **without calling a paid provider**. The currently published API is not made safe by committing this source.
2. Rotate/revoke the formerly exposed AIs & Ears service key at its issuer. Do not assume deleting the source literal invalidates history, devices, or old APKs.
3. Verify the new separate live-room host key and native secure-storage recovery on a real device; load-check room/frame/client/stream bounds and persistence. Old room hosts must create a new room; history is preserved. Shared links still permit guest participation and are not private account sessions.
4. Resolve Apple distribution signing: reuse a matching certificate/private key, or obtain explicit permission to revoke a named existing certificate. Do not auto-revoke other apps' certificates.
5. Configure customer GitHub App device flow and validate it on native hardware. Mock tests cannot authorize a real customer.
6. Keep purchases explicitly unavailable until real StoreKit/RevenueCat implementation and restoration are tested. Provider billing is separate.
7. Complete native-device checks, then build fresh binaries. Never promote the earlier pre-hardening APK as the security-fixed release.
8. Record a verified new APK URL, publish the download manifest, verify APK bytes through the proxy, complete iOS build/submission, and check App Store processing.

## Scope limits

The final static-code scan reported no findings and was not incomplete. The privacy/dataflow scan reported no findings. Twenty-nine regression tests, workspace typechecks, frozen install, API build, and local iOS/Android/web exports passed. These are local checks, not successful EAS signing/submission or native-device tests.

The ASC private key can now be validated and used for read-only Apple authentication. No App Store app record currently matches this build's bundle identifier; creating that record is an additional submission gate.

The Guide's question composer is visible in the preview after the tab-overlap fix. The development console still reports Expo AV deprecation and an unidentified HTTP 415 resource warning. Assets rendered correctly on the settled preview, but native-device behavior remains unverified.

Static/privacy scans do not inspect all historical Git objects, remote provider settings, device backups, native OS behavior, App Store metadata, or every runtime path. No paid AI requests are used as tests. The RSA-tooling advisory, external key rotation, production deployment, room host controls, and native validation must not be hidden behind a “clean security scan” claim.
