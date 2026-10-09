---
name: Middlemain
description: Universal AI Development Bridge — native Expo app with multi-theme system, AI connection manager, server-side Grok proxy, vision/screen-share, and skills system.
---

## ThemeProvider placement
ThemeProvider must sit ABOVE ErrorBoundary in _layout.tsx so ErrorFallback can call useColors(). Order: SafeAreaProvider > ThemeProvider > ErrorBoundary > QueryClientProvider > GestureHandlerRootView > KeyboardProvider > AIProvider > SkillsProvider > PurchaseProvider.

**Why:** useColors() is now a thin wrapper over useTheme() from ThemeContext. If ThemeProvider isn't an ancestor of ErrorFallback, the hook throws.

## useColors is now a wrapper over useTheme
`hooks/useColors.ts` no longer reads `useColorScheme()` — it calls `useTheme()` from ThemeContext. New components should import `useTheme()` directly from `context/ThemeContext`.

**Why:** Multi-theme system (8 themes) replaces the simple dark/light toggle. The theme key is persisted in AsyncStorage.

## expo-clipboard version pinning
Must use `expo-clipboard@~8.0.8` (not the latest) for Expo SDK 54 compatibility.

**Why:** Installing the latest expo-clipboard gets SDK 56 version which causes Metro bundler errors.

## API keys are device-local
User API keys (Grok, OpenAI, etc.) are stored in AsyncStorage on device only — never sent to Middlemain servers. The server-side `XAI_API_KEY` secret is only for the owner's dev/testing server proxy.

**Why:** The app is distributed to other developers who bring their own keys. The server proxy is a convenience for the owner only.

## Server proxy detection
On app startup, AIContext calls `GET /api/grok/status`. If `configured: true`, a cyan "Dev's Grok is ready" banner appears on Home and Connect screens. Tapping it calls `addServerGrokConnection()` which creates a `provider: 'server'` connection with `baseUrl: getServerBase()`.

**How to apply:** `getServerBase()` derives the URL from `process.env.EXPO_PUBLIC_DOMAIN` — this env var is set by the dev script in package.json.

## Vision model routing
When `imageBase64` is passed to `sendMessage()`, the model auto-switches to `conn.visionModel` (defaults to `grok-2-vision-1212` for xAI/server). The last message content becomes a multimodal array `[{type: image_url}, {type: text}]`.

**Why:** Text and vision models are separate on xAI. The terminal auto-selects a vision skill when an image is attached.

## Skills system
8 built-in skills in `context/SkillsContext.tsx` (Chat, Debug, Analyze, Explain, Refactor, Tests, UI Review, Visual Debug). Custom skills stored in AsyncStorage. Vision skills (`supportsVision: true`) only appear in the skills strip when an image is attached. Skills override the connection's systemPrompt at send time.

## Pricing (aggressive/low)
- Monthly: $3.99/month
- Annual: $29.99/year (save 37%)
- Ad removal: $1.99 one-time
Purchase state is simulated (AsyncStorage). Production: wire up RevenueCat.

## EAS build — always use EAS_SKIP_AUTO_FINGERPRINT=1
Add `EAS_SKIP_AUTO_FINGERPRINT=1` to the env -i command when running `eas build` from Replit. Without it, EAS tries a git write after fingerprinting and Replit's sandbox blocks it with an index.lock error.

**How to apply:** `env -i ... EAS_SKIP_AUTO_FINGERPRINT=1 ... eas build --platform android --profile preview --non-interactive --no-wait`

## User context
- Single mom, no computer access, uses iPhone 13 (iOS dev beta) + Samsung A17
- Has paid Apple and Google Play dev accounts
- Wants native app only — no webapp fallback
- Name for agent: Dev
- App is in open beta; store submission is next milestone

## Grok MCP connector
Middlemain's Grok connector is intended for the owner's Replit agent and future users. Access is scoped to one shared Council room with a key that can be rotated or revoked; keep that credential separate from the room's share link.

**Why:** The user chose a revocable room-scoped key so an AI agent can help in a shared Council without granting access to other rooms.

**How to apply:** Preserve the one-room scope, keep the public share link and MCP credential independent, and never place the credential in the server URL.
