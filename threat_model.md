# Middlemain Threat Model

## Project Overview

Middlemain is a native-first Expo app with an Express/WebSocket API and a guest Council web client. Users can connect their own AI providers, import GitHub source for bounded checks, and share Council rooms. Owner-only services and signing credentials are separate from consumer features.

## Assets

- **Customer credentials:** AI provider keys, AIs & Ears bridge keys, MCP tokens, and GitHub device-flow tokens. Some saved AI/bridge credentials still persist in AsyncStorage; do not describe them as encrypted. Their migration to OS-backed secure storage remains outstanding.
- **Owner credentials:** executive authorization, owner Grok configuration, memory access, webhook authorization, and Apple/EAS signing material. These must stay in Replit Secrets or OS-backed storage and never enter a consumer bundle, logs, or Git.
- **User content:** repository source, prompts, images/audio/video, Council messages, room history, and Human Hands records. Content can cross to the chosen provider or server when the user requests the relevant feature.
- **Room capabilities:** share URLs, separate host tokens, MCP tokens, and guest identities. A share URL grants room access; it does not prove a guest's identity.
- **Release integrity:** source, dependency patches, app bundles, download manifests, signing profiles, and store metadata. A GitHub push does not publish or verify a production build.

## Trust Boundaries

- **Phone/browser ↔ API:** the client is untrusted; the API must validate every body, path, token, and action. Public health, bounded source checks, downloads, and guest-room access are distinct from owner-authorized actions.
- **API ↔ AI/GitHub/bridge services:** provider calls use the user's selected connection where applicable. Explicit consent is required before sending source to AI; owner-funded credentials must not be used for public requests.
- **Repository source ↔ compiler:** imported source is data only. The checker must not install dependencies, run scripts/plugins, follow untrusted config inheritance, or read outside the supplied virtual files and trusted compiler libraries.
- **Council host ↔ guests/MCP:** guest links permit participation, but only the separate host credential can publish owner AI/system messages. MCP credentials cannot authorize host actions.
- **Workspace ↔ GitHub/deployment/build services:** Replit Secrets are separate from tracked source. Deploy images must exclude credentials, agent-only material, planning notes, uploads, and generated release binaries. Repository visibility stays private unless the owner explicitly approves a public release.
- **App ↔ device storage:** OS-backed SecureStore is used for some secrets, but existing AI/bridge credentials still need a migration and recovery test before claiming complete device protection.

## Scan Anchors

- API composition: `artifacts/api-server/src/routes/index.ts`; security-sensitive route groups: `executive.ts`, `grok.ts`, `debug.ts`, `councilRoom.ts`, `mcp.ts`, and `download.ts`.
- Mobile boundary: `artifacts/middlemain/app/`, `context/`, and `utils/`; check saved credentials, explicit provider consent, native permissions, and storage migrations.
- Guest surface: `artifacts/council-room/src/`; treat all guest input and room links as untrusted.
- Repository checker: `scripts/middlemain-api-security-tests.ts` and `scripts/middlemain-repository-tests.mjs`; preserve fixed compiler options, input/resource limits, cancellation, and cleanup.
- Development-only build tooling: Expo/EAS and patched `braces`/`image-size` packages. Do not confuse development-tool findings with shipped runtime exposure, and do not call them fixed when the registry scanner still flags them.

## Threat Categories

### Spoofing

An attacker may imitate an owner, room host, GitHub user, or provider. Owner endpoints require executive authorization; host publishing uses a separate host token; GitHub private access uses customer-authorized, read-only device flow. Guest display names and share links are not verified identities.

### Tampering

Request bodies, imported code, room messages, webhook payloads, and package metadata are attacker-controlled. Validate them server-side, keep owner webhooks behind owner authorization, and never let repository scripts, plugins, or compiler settings execute against the server.

### Repudiation

Logs should record bounded status/count metadata for operational debugging without source text, provider keys, room tokens, or authorization headers. Do not imply that public guest names or request logs establish a verified human identity.

### Information Disclosure

The main risks are credentials or private source reaching Git, deployment images, logs, AI providers, screenshots, or another user's room. Keep secrets out of tracked files and release bundles; disclose what leaves the device; require consent for AI source analysis; review tracked attachments and full Git history before any public repository release.

### Denial of Service

Public room, download, and source-check routes can be abused for resource use or provider cost. Keep body/source limits, request and stream timeouts, concurrency caps, output bounds, and cancellation cleanup. Per-process limits are not distributed abuse prevention; production load behavior remains unverified.

### Elevation of Privilege

A guest, MCP client, or public caller must not gain owner API, host publishing, signing, or deployment rights through a client-side check or shared URL. Enforce permissions on the server at every sensitive route and keep build/signing tools unreachable through public download paths.

## Current Security Limits

- Dependency audit reports four high advisories: locally patched `braces` and `image-size` findings remain visible to version-based scanning; the `node-forge` RSA finding has no fixed npm release and is in Expo/EAS tooling.
- Static-code scan returned zero findings. The latest privacy/dataflow scan failed schema validation; it is not a clean result.
- Saved AI/bridge credentials still need their secure-storage migration. Physical-device recovery, native permissions, production deployment probes, load testing, external key rotation, and store review are not certified by local tests.
- No scan or local export proves that the app is vulnerability-free. Preserve the patches and run typechecks, regression tests, security scans, local exports, and real-device checks before a paid native build or public release.
