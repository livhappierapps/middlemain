# Middlemain threat model

## Assets and boundaries

- Customer provider keys and source/screenshots: device → explicitly selected AI/GitHub/bridge services.
- Owner executive, xAI, and memory credentials: trusted device → HTTPS API → upstream providers. Public users must not receive or spend them.
- Council transcripts and room tokens: native host/guests → API/WebSockets → file persistence. Shared-room URLs are capabilities, not verified user identities.
- Signing credentials: workspace secrets → temporary EAS submission configuration → Apple/Expo. Never application bundle or Git.
- Download: public client → API → approved Expo/GCS archive. Never arbitrary URLs, internal networks, or a public signing-tool command.

## Prioritized STRIDE scenarios

| Scenario | Impact | Controls / remaining limitation |
|---|---|---|
| Public caller spends owner xAI credits | High financial abuse | Constant-time executive authorization, request limits, bounded output, no automatic paid retries. Must publish and verify the secured API; workspace fixes do not secure the existing deployment. |
| Caller inserts a false owner webhook digest | Spoofing/tampering | Both owner webhook write endpoints require executive authorization; trusted native webhook calls supply it. |
| Static path traversal/symlink/forwarded-host injection | Disclosure/injection | Lexical and realpath containment, malformed/control-byte rejection, manifest allowlist, escaped HTML. Regression tests cover crafted paths and headers. |
| Compiler reads arbitrary source/imports or executes code | Disclosure/code execution | Isolated single-file checks, limited input, fixed compiler options, no installs or execution; source consent for paid review. |
| Guide/tool/guest text tricks AI into privileged action | Prompt injection | Treat help/tool output as data; no permission is implied by an AI answer. User-authorized external tools can still expose data; their controls and model behavior need independent review. |
| Leaked bridge credential still works in old builds/history | Disclosure | No bundled default key. **Service-side revocation/rotation remains required.** Source removal is not revocation. |
| Guest forges an owner AI/system publication | Spoofing/tampering | Crypto-random room IDs; separate host key for AI/system HTTP publications and streams, hash-only server persistence, native secure storage, and original-server pinning. MCP keys cannot authorize host operations. Legacy hosts must recreate a room. Guest display names remain unverified. |
| Excessive public compiler/chat/room creation traffic | Availability/cost | Endpoint/body/rate limits, request/stream timeouts, room/client/frame/stream bounds. In-memory per-socket limits are conservative behind a proxy and not distributed abuse prevention. Production traffic/storage still needs load validation. |
| Malformed image or deeply nested brace pattern crashes build tooling | Availability | Version-compatible parser patches and crafted-input tests. Registry scanners still flag the original package versions. |
| RSA digest verification ambiguity in node-forge | Signing/tooling integrity | Latest parent/dependency still vulnerable. EAS is a development tool; production download cannot invoke it. No homemade crypto patch. Use trusted Apple/Expo inputs and track the upstream fix. |
| Local device/browser compromise reads saved customer keys | Disclosure | Local storage is not advertised as encrypted. OS/device protection and upstream revocation are required; migrating credential storage to native keychain needs coordinated backup/migration tests. |
| Fake local purchase state claims a paid entitlement | Fraud/misrepresentation | Removed simulated entitlements; purchase/restore controls explicitly unavailable until real store integration is implemented. |

## Verification scope

Static, dependency, and privacy scans supplement—not replace—manual authorization review, crafted-input tests, production probes, and real-device testing. The automated suite makes no paid provider calls. Zero scanner findings cannot establish that an app is vulnerability-free or compliant.
