# Progress

## Baseline
- Rescanned dependency, static-code, and privacy findings in parallel.
- Identified GitHub origin and existing release-signing blocker.

## Repairs and verification
- Compatible dependency updates, synchronized overrides, and tested image-size/braces/Expo-plist parser patches. EAS pins the verified pnpm 10 version rather than the latest image's incompatible default.
- Owner-service authorization, cost-safe no-retry requests, bounds/timeouts, shared native SSE/fetch, host/MCP separation, and atomic bounded room persistence.
- Shared canonical guide with offline retrieval and relevant context in existing AI requests. Mock purchases explicitly unavailable.
- Removed obsolete source archive/empty placeholders; preserved originals/history. Generated outputs and credentials excluded from Git/deployment/EAS.
- 33 regression tests, frozen install, native typecheck, and a clean local iOS prebuild passed. Earlier workspace typechecks, API build, and iOS/Android/web exports also passed. WebSocket upgrades reject missing/full rooms before allocation.
- Final scanners: 0 critical; 4 high version findings (3 patched/tested, 1 unpatched EAS tool); static and privacy scans returned no findings.
- GitHub token verified with push permission to the existing private repository.
- ASC authentication and matching app record verified; EAS-managed signing configured.
- Secured backend is published and reports owner authorization required. New in-app privacy disclosures and GitHub configuration still need fresh binaries.
- Two queued iOS attempts failed before producing a binary: first on the builder's pnpm major version, then on Expo's legacy XML caller. Both causes have local fixes; native prebuild now passes. No iOS submission has started.
- An approved Android refresh completed, but predates the latest privacy/GitHub changes. Do not present that APK as containing those newer fixes.
- Reconciled newer GitHub commits without force-pushing. Preserved the working Debug screen rather than accepting the remote's empty screen; kept the newer Grok model/CLI notes.
- Preview confirms the offline Guide and its question composer render above the tabs. Development console still reports Expo AV deprecation and an unidentified HTTP 415 resource warning; this is not a claim of error-free native operation.

## Remaining release work
- Obtain approval for additional paid attempts beyond the original iOS retry and completed Android refresh; then finish iOS build/upload and verify Apple processing.
- Build the updated Android APK, publish its verified download manifest, and verify the production proxy.
- The publisher's privacy URL still rendered a 404 at the last check; website policy and public App Store metadata/review remain separate work.
- External bridge-key rotation and native-device validation remain required; do not claim scans certify all runtime paths.
