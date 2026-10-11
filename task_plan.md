# Middlemain security, cleanup, and release plan

## Scope
Audit Middlemain and its API, repair security/debugging findings, remove proven junk, consolidate genuine duplication, document every user-facing function and wire that guide into app AI context, push to GitHub, then verify and build. Do not collapse unrelated modules or remove user assets. No automatic Apple certificate revocation.

## Phases
1. Inventory, baseline checks, security scans — complete.
2. Dependency/application-code repairs and regression tests — complete; one upstream signing-tool advisory remains.
3. Safe cleanup/documentation/shared AI knowledge — complete.
4. Full fix/test/fix pass, scans, preview — verified locally; source push being finalized. Development warnings and native-device checks remain open.
5. Secure builds/submission/APK verification — blocked on backend publication, Apple app record, and signing access.

## Gates and constraints
- Local verification before cloud build spending.
- Track failed approaches; alert the user if an issue cannot be fixed within 15 attempts (earlier for missing access or unsafe changes).
- Initial iOS signing remains blocked by Apple's distribution-certificate limit. Specific revocation approval or reusable signing credentials are required.
- GitHub changes must be pushed without exposing credentials.
- Broad cleanup is approved; deletion must be supported by reference/build checks.

## Errors / blockers
- Previously exposed bridge key requires rotation by its issuing service.
- Initial dependency scan: 91 findings, including 12 critical and 46 high; code and privacy scans clean.
