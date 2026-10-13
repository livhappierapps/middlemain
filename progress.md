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
- Secured backend is published and reports owner authorization required. New privacy disclosures and GitHub configuration are included in both fresh binaries.
- Two earlier iOS attempts failed on builder pnpm/XML compatibility. After local verification and additional approval, the corrected production build succeeded.
- iOS version 1.2.0, build 1: EAS build `bee6e786-4077-4379-984b-ed86803bcb60`; submission `5864c0d1-c444-46e0-bd79-b27901b458be`. Apple reports processing state `VALID`.
- Updated Android version 1.2.0, code 1: EAS build `8fa06bf4-0dda-4797-bffd-112d68af8425`. Canonical APK HEAD returned 200 with 121,674,543 bytes; the download manifest now selects this artifact.
- Reconciled newer GitHub commits without force-pushing. Preserved the working Debug screen rather than accepting the remote's empty screen; kept the newer Grok model/CLI notes.
- Preview confirms the offline Guide and its question composer render above the tabs. Development console still reports Expo AV deprecation and an unidentified HTTP 415 resource warning; this is not a claim of error-free native operation.

## Remaining release work
- Publish the updated backend/download manifest and verify APK bytes through the production proxy.
- The publisher's privacy URL still rendered a 404 at the last check; website policy and public App Store metadata/review remain separate work.
- External bridge-key rotation and native-device validation remain required; do not claim scans certify all runtime paths.
