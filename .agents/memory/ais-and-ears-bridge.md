---
name: AIs & Ears Bridge Protocol
description: External media bridge contract, distinct authorization, and cost-conscious camera testing.
---

## Distinct credentials and billing

The external AIs & Ears service uses a bridge credential to create a session with returned audio-WebSocket and vision URLs. That credential is not an xAI provider key or a Middlemain executive key. Selecting a personal chat connection does not establish which account pays for the external media bridge.

**Why:** The chat provider and the external media session are separate services. The user requires advance notice of possible charges.

**How to apply:** Never interchange credentials or include them in shared handoffs. Explain where media goes and treat external media sessions as potentially billable unless their operator confirms otherwise.

## Camera testing defaults

Camera preview should remain local until the user explicitly sends a frame. Repeated inference needs separate, informed consent. Never silently retry a possibly billed upload; distinguish a local capture, remote acceptance, and an actual AI reply.

**Why:** Hidden capture and silent upload failures made it impossible for the user to verify delivery, while repeating requests could incur charges.

**How to apply:** Preserve explicit single-frame testing, bounded sequential live sharing, actionable errors, and stopping on navigation/background. Cancellation cannot recall data already delivered.

## Upstream audio contract

The protocol supplied by the bridge's developer describes base64 raw PCM16 audio at 24 kHz mono in `input_audio_buffer.append`, with `response.audio_transcript.done` for text replies. A complete WAV file is not the same payload as raw PCM.

**Why:** The bridge implementation lives outside this workspace; successful recording alone does not establish its audio compatibility.

**How to apply:** Verify the external bridge's current accepted format before claiming microphone delivery works. Do not assume a file extension or a green toggle proves valid audio transmission.

## Native permission conflicts

Verify the generated native permissions, not just the permission list in app.json. Disabling microphone permission in one media plugin can block microphone access requested by another.

**Why:** The image-picker plugin's microphone opt-out produced an Android manifest removal entry that overrode the audio plugins. Expo Go's own permissions concealed this standalone-build difference.

**How to apply:** Keep shared media-plugin permissions consistent and test the final Expo-introspected manifest and iOS Info.plist before using a paid build to investigate permission problems.
