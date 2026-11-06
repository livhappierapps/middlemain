# Final bug fix before shipping report

**Investigation date: 2026-11-06. Status: fixes verified locally; release gate remains OPEN.**

This is an evidence log, not a claim that every bug is fixed. No new APK/IPA was built, no store submission was made, and no live AI/media inference was requested during this investigation. The currently installed mobile binary does not acquire these source changes automatically.

## Read this first

“Connected” can mean several different things:

1. The server answered.
2. The credential was accepted.
3. A session was established.
4. Audio/image bytes were accepted in the correct format.
5. A model actually processed them and returned a result.
6. That result was included in the **same conversation** as the user's next question.

Do not show step 2 as proof of steps 4–6. That distinction explains much of the confusion in this app.

## Findings and applied fixes

### 1. Council showed recalled memories but did not send them to its AIs

**Evidence:** Recall added a `system` feed entry. Both normal and autonomous history construction discarded system entries. Normal requests also excluded answers from other participants.

**Applied:** Shared reference entries are explicitly marked. Normal and autonomous turns include those entries as user-level reference material, plus attributed messages from other participants. Status notices and unfinished responses remain excluded. Another agent's answer is not impersonated as the current agent's own answer.

**Why this works:** Stateless chat APIs only see the history included in the request [1, 2, 3]. Displaying text in a React component is not equivalent to sending model context.

**Verification:** Regression tests cover recalled context, cross-agent attribution, own-assistant roles, and exclusion of empty/in-progress replies. No live provider call was made.

**Limit:** This does not import a consumer chat application's private history or hidden memories.

### 2. Bridge Terminal discarded previous turns

**Evidence:** Every ordinary send constructed a messages array containing only the newest user message.

**Applied:** Completed text turns are retained in memory separately by connection/model; changing the key resets that connection's usable history. Clear resets history and prevents an in-flight response from repopulating it. History is bounded to 40 messages, with a visible notice when truncated. Old image attachments are not silently resent; their absence is explicitly marked.

**Verification:** TypeScript passes. Paid/live multi-turn behavior and physical-device UI interaction remain unverified.

**Limit:** This is session-local text context, not durable chat restoration, a Grok consumer-chat import, or complete preservation of tool-call artifacts.

### 3. Council live-room URLs could be invalid on native devices

**Evidence:** Missing build-time domain configuration fell back to `/api`, which has no host on a phone. A domain already containing `https://` could also be prefixed again. This matches the *class* of the previously reported `Invalid URL: /api/council/rooms` error; the user's installed binary was not inspected.

**Applied:** Council normalizes bare domains/full HTTPS URLs, adds `/api` to a bare origin, rejects embedded credentials and unsafe URLs, and reports missing native configuration explicitly.

**Verification:** Tests cover native missing-domain errors, bare host, full URL, trailing slash, credential rejection, and the web-relative fallback.

**Owner path if the installed build is affected:** Settings → API Server → API Base URL. Use the verified published API URL, not a preview address. A correctly configured fresh binary is preferable to making every user enter this manually.

### 4. Council microphone file reads threw at runtime

**Evidence:** Council imported legacy `readAsStringAsync`/`deleteAsync` from the main `expo-file-system` entry point. The installed SDK 54 package explicitly throws for these methods there.

**Applied:** Use `expo-file-system/legacy`, matching the existing Bridge implementation.

**Why TypeScript missed it:** The methods remain typed, but their implementation throws. Consult the pinned dependency, not only a successful type check [4].

### 5. Whole audio files were sent as raw PCM

**Evidence:** Both microphone paths base64-encoded the entire recording and sent it as `input_audio_buffer.append`. A WAV header is not audio samples. Android's `DEFAULT` encoder and a `.wav` filename do not establish PCM output.

**Applied:** Validate RIFF/WAVE chunks, PCM format, 24 kHz sample rate, mono channel count, 16-bit samples, and bounds; strip the container before sending. Unsupported or damaged recordings stop with an explanation instead of being silently presented as usable audio. Council now reads returned transcript events, includes their text as shared reference data on subsequent turns, reports media-service errors, and guards overlapping/stale recording work.

**Verification:** Byte-for-byte tests cover small and large sample buffers; wrong codec/rate/channels/bit depth, malformed base64, compressed content, and truncated files are rejected.

**Still blocked:** Actual Android `DEFAULT` output may be compressed and will now be rejected. A compatible recorder or an explicitly documented server-side transcoding endpoint is required. The external service's VAD/commit/response behavior must also be verified [5]. This change is **not** proof that microphone delivery works on either physical device.

### 6. Memory Machine used an incomplete MCP transport

**Evidence:** The client sent `tools/list` directly, omitted the required Accept header, ignored session IDs, assumed JSON rather than JSON or SSE, had no request timeout, and could display a tool-level error as a successful result.

**Applied:** Initialize and send the initialized notification; negotiate a supported protocol version; preserve session headers; accept JSON/SSE responses; correlate response IDs; use bounded requests; reject tool-level failures; and block insecure/credential-bearing URLs and redirects. Legacy fallback is restricted to explicit JSON-RPC Method Not Found. Configuration changes/disconnect invalidate stale connection attempts.

**Verification:** Tests cover initialization, session headers, SSE results, narrowly scoped legacy fallback, authentication failure without fallback, failed writes without replay, and unsafe URL rejection.

**Still blocked:** Tests use fake transport responses. The current Memory Machine server was not exercised. This does not implement OAuth refresh, pagination of all tool catalogs, unsolicited server requests, or unlimited reconnects. Reconnect after a session expires; uncertain writes are never silently retried.

**Source:** MCP specifies initialization, Accept content types, session headers, and expired-session behavior [6].

### 7. Manually added Council participants retained keys in ordinary preferences

**Evidence:** Manual participant persistence included `apiKey` in AsyncStorage, even though Connect's provider keys had already moved to secure storage.

**Applied:** Migrate those keys to the existing device credential store before replacing plaintext metadata. Subsequent saves write secure credentials first and sanitized metadata second. A failed migration preserves existing data and reports an error. Browser credentials stay session-only.

**Verification:** TypeScript and the existing secure-credential tests pass. Physical iOS/Android migration and interrupted-write testing are still required; this is not a security certification.

### 8. Media status and retries overstated what had happened

**Applied:** Session-creation POSTs are no longer retried automatically. Hearing/screen messages explain that AIs & Ears is separate from the selected chat provider. Additional transcript event names and service error events are handled.

**Reason:** A lost session-creation response may already have caused a billable side effect. A bridge transcript also does not automatically enter a different provider's chat. Never silently switch keys or retry inference to make an indicator green.

### 9. The advertised Android archive had expired

**Evidence:** The full test suite initially failed the download check with HTTP 502. Following the approved Expo archive's redirects independently ended in HTTP 404.

**Applied:** Removed that expired archive from the approved-release configuration. Production now reports no completed APK available rather than advertising a dead download.

**Verification:** The download test's unavailable-release branch passes. **This does not create a replacement APK.** A new verified binary and durable distribution location remain release requirements.

## Research: bring an ongoing Grok conversation into Council

### What the official sources support

- xAI's Responses API can continue **API-created** state via `previous_response_id`. The documented retention window is 30 days; keep authorized history if longer continuity is required [1].
- Consumer Grok supports conversation sharing through a public share link. Those links can be revoked and can expose the shared content to anyone receiving the link [7].
- MCP provides tools, resources, and transport/authorization—not automatic access to a host application's entire conversation or hidden memory [6, 8].
- Chat history must be supplied or explicitly referenced in a supported provider API [1–3].

### What was not established

No supported public API was found in the reviewed official documentation that takes an arbitrary consumer Grok chat ID and resumes that exact session through an ordinary xAI API key. This is a research limitation, not proof that no future or account-specific connector could support it.

An API key, matching model name, “Leo” system prompt, or shared Memory Machine token does **not** independently transfer the consumer chat's state. Do not promise identical personality, hidden memory, tools, or subscription allowance.

### Recommended public-product connection methods

1. **Private transcript handoff:** The user explicitly imports/pastes an authorized transcript or summary. Show what is being imported and which AIs will receive it. Do not promote imported instructions to system-level authority.
2. **Connector-assisted handoff:** Where the Grok client supports a compatible authenticated connector, expose a scoped tool that receives the context the client actually sends. A “meet me” request only works if the client invokes that tool; the phrase itself is not an integration.
3. **API-native conversation continuation:** Keep separate provider-specific thread state. Use returned API response IDs only with the correct authorized account/API. On expiration, visibly rebuild from retained user-authorized context.

Do not scrape private accounts, collect consumer account passwords, promise access to hidden memories, or require users to publish private conversations as the default import route.

**Not implemented by this pass:** A complete consumer-chat import UI, automatic Grok handoff, OAuth one-click pairing, or public transcript-sharing workflow.

## Making Council simpler without making it misleading

Current basic path:

1. Connect → add/test each intended provider.
2. Council → select a recipient with `@name`, or use the existing Send to All confirmation.
3. Recall memories only when the intended participants may receive them.
4. Go Live only when inviting an external viewer/agent. It is not required for local multi-provider chat.
5. An external agent needs the MCP endpoint **and separate room-scoped authorization**. A room-view link is not a credential.

Auto rounds can trigger several paid provider requests. Connection tests, context sharing, model generation, and tool writes must remain distinct actions. A more guided onboarding screen is still desirable, but should not conceal permissions or costs.

## Memory Machine + AIs & Ears: “connect once” contract

Persist endpoint configuration and tokens securely; do not hardcode the owner's secrets or private server into a public app. Reuse authorized settings, not expired sessions. Revocation, expired credentials, service outages, phone background limits, and provider quotas mean “works forever” cannot be guaranteed.

Before claiming full integration, obtain the current service source/contracts and verify:

- Exact authenticated endpoints, required headers, response schemas, expiry and refresh behavior.
- Whether session creation charges or allocates provider resources.
- Accepted audio codec/container/rate/channels and VAD versus explicit commit.
- Vision image format and whether results arrive in HTTP, WebSocket, or both.
- Which model/session receives media; how that context becomes available to the selected chat AI.
- Memory tool schemas, ownership boundaries, read/write authorization, error semantics, and duplication prevention.

The current media service may be healthy while the selected Grok chat receives no actual image, audio, or returned interpretation. Verify the full path with a harmless test object/phrase and explicit permission, not just the connection badge.

## Approaches rejected or not sufficient

| Approach | Evidence / reason |
|---|---|
| “TypeScript passed, therefore Council works” | Typed filesystem methods can still throw at runtime. |
| Apparent duplicated live-room code | Re-read exact file lines: overlapping command output, not duplicate source. No unnecessary rewrite performed. |
| Adding more iOS provisioning capabilities blindly | This pass did not verify a provisioning fault. Usage descriptions/runtime permission and actual capture/codec behavior must be checked first [9]. |
| Renaming compressed audio `.wav` | Does not change its codec. Invalid recordings are now rejected. |
| Sending entire WAV bytes as raw PCM | Includes container bytes; corrected with validated extraction. |
| Showing recalled memory in the feed | The model never saw it until request-history construction was fixed. |
| Retrying every POST | Can duplicate paid work or memory writes. No automatic uncertain-write replay. |
| Treating an API key as consumer chat migration | Not supported by the reviewed official docs. |
| Calling an expired APK “ready” | The upstream archive returned 404. Marked unavailable instead. |

## Verification and remaining release gates

- `pnpm run test:middlemain`: **87 tests passed** (67 JavaScript tests + 20 TypeScript tests).
- Mobile `tsc --noEmit`: passed.
- API bundle build: passed.
- `git diff --check`: passed.
- Council browser preview renders at a phone-sized viewport. The capture still logged an Expo AV deprecation warning and an unidentified HTTP 415 resource response; these are not represented as resolved. No signed-in, live multi-provider or physical-device UI test was performed.
- The API workflow restarted and served `/api/grok/status` successfully after the changes.
- Provider/bridge transport tests use fixtures; no live inference/media charges were intentionally initiated.
- Still required: current external service compatibility, physical camera/microphone tests on signed builds, secure-storage migration checks on devices, guided connection usability, public conversation-handoff implementation, and replacement signed APK/IPA.
- App Store review metadata, purchase configuration, legal pages, and store submission are separate release gates; this report does not certify them.

## Source index

Research reviewed official provider/protocol documentation, local pinned package implementations, and regression-test output. Documentation may change; SDK-versioned Expo links currently redirect to newer documentation, so installed SDK 54 behavior was checked directly.

1. xAI, stateful text generation and retention: https://docs.x.ai/developers/model-capabilities/text/generate-text
2. OpenAI, conversation state: https://developers.openai.com/api/docs/guides/conversation-state
3. Anthropic, Messages API conversation patterns: https://platform.claude.com/docs/en/build-with-claude/working-with-messages
4. Expo SDK 54 filesystem source: https://github.com/expo/expo/blob/sdk-54/packages/expo-file-system/src/legacyWarnings.ts
5. OpenAI Realtime client events/audio format: https://platform.openai.com/docs/api-reference/realtime-client-events/input_audio_buffer/append
6. MCP Streamable HTTP transport: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
7. xAI consumer FAQ, sharing and revocation: https://x.ai/legal/faq
8. MCP security guidance: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
9. Expo camera and native permissions: https://docs.expo.dev/versions/v54.0.0/sdk/camera/ and https://docs.expo.dev/guides/permissions/

The Realtime documentation describes a provider protocol, **not proof of AIs & Ears' current deployed implementation**. That distinction must remain explicit.
