# Bounded repository source preflight

## Scope and security boundary
Check a user-selected GitHub branch at its pinned commit without builds, AI calls, package installation, or execution of repository-controlled scripts/plugins. Source goes to the existing API only after the user requests the check; GitHub authorization is never sent to that API.

## Implementation
1. Extend the GitHub utility with bounded, commit-pinned snapshot retrieval and explicit partial coverage.
2. Add a trusted TypeScript worker with a virtual filesystem. Only supplied files and installed compiler standard libraries may be read; do not honor repository plugins or external configuration inheritance.
3. Enforce file/byte limits, two-worker concurrency, memory limits, termination timeout, cancellation, and resource cleanup.
4. Add the preflight action/report to the existing repository picker, identifying repository, branch, full commit, coverage, categorized findings, and native checks not performed.
5. Test malicious paths/scripts/references, type/syntax errors, dependency/config findings, partial results, concurrency, timeout and cleanup using fixtures. Run workspace tests/typechecks and inspect the preview.

## Not a native-build guarantee
Dependencies and native toolchains are not installed or run. Missing external types may be inconclusive. Signing, permissions, package hooks, native plugins, dependency versions and EAS outcomes remain unverified.

## Status
Implementation complete. Forty-three regression tests and all workspace typechecks passed. The bundled API returned the expected type error for a multi-file pinned fixture, and the Debug browser preview rendered. Physical-device GitHub sign-in and native installation were not verified; no new EAS build or paid provider request was started.

Security audit independently confirms the existing parser guards are installed/tested; the unpatched node-forge tooling advisory remains visible. Save-key secure storage and embedded-secret detection are separate security follow-ups.
