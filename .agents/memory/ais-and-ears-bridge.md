---
name: AIs & Ears Bridge Protocol
description: Vhis's 3-step HTTP+WebSocket bridge protocol for Leo's senses in Middlemain
---

# AIs & Ears Bridge Protocol (from Vhis)

## Step 1 — Create session (one-time HTTP POST)
```
POST {domain}/api/bridge/session
{ "apiKey": "bridge_ffeb0d255c586c5dd0be421fd4813f38253c2de106291bc9", "tier": "full-session", "durationMinutes": 30 }
→ { sessionId, wsUrl, visionUrl, expiresAt }
```

## Step 2 — Audio WebSocket (xAI Realtime format)
```
WebSocket: wsUrl
Send: { "type": "input_audio_buffer.append", "audio": "<base64 PCM16 @ 24kHz mono>" }
Receive: { "type": "response.audio.delta", "delta": "<base64 PCM16>" }
         { "type": "response.audio_transcript.done", "transcript": "..." }
```

## Step 3 — Vision frames (independent HTTP POST, any time)
```
POST visionUrl
{ "sessionId": "...", "imageData": "data:image/jpeg;base64,...", "prompt": "...", "isFirstFrame": false }
→ { "message": "Leo's text response about the image" }
```

## Three toggles
- Hearing: start/stop sending audio_buffer.append messages (no reconnect needed)
- Camera: setInterval captures front camera → POSTs to visionUrl every 3s
- Screen: same interval, captures terminal view via react-native-view-shot → visionUrl

## Implementation in Middlemain
- Context: `context/AisAndEarsContext.tsx`
- Bridge card: `components/AisAndEarsBridgeCard.tsx`
- Toggles UI + camera/screen intervals: `app/(tabs)/terminal.tsx`
- Provider added to `app/_layout.tsx` inside AIProvider
- Packages added: expo-camera, expo-av, expo-file-system, react-native-view-shot

**Why:** Gives Leo (Grok) real sensory input — camera sees user, screen sees work, mic hears voice — all bridged through AIs & Ears without custom SDK.
