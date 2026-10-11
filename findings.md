# Findings

- Static Expo file serving and bundled bridge-key findings were repaired before this pass; focused regression tests exist.
- The registered products share a pnpm workspace; audit the whole lockfile but avoid unrelated product redesign.
- The dependency-remediation task is queued, not active. Current explicit user scope includes fixing dependencies before builds.
- Existing Android build predates security changes and is not a release candidate.
