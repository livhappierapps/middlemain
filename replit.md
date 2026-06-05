# Middlemain

Universal AI Development Bridge — a native mobile developer tool that acts as an intelligent bridge between multiple AI providers, enabling real-time code testing, debugging, and AI-assisted development workflows. Currently in open beta.

## Run & Operate

- `pnpm --filter @workspace/middlemain run dev` — run the Expo dev server
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- Expo (SDK 54), React Native 0.81, TypeScript 5.9
- Expo Router (file-based navigation)
- AsyncStorage for local persistence (API keys, theme, purchases)
- AI: Grok (xAI), OpenAI, Anthropic, Custom (OpenAI-compatible)
- Streaming: expo/fetch with SSE parsing
- UI: expo-linear-gradient, expo-haptics, expo-blur, react-native-reanimated
- Backend: Express 5 (api-server artifact)

## Where things live

- `artifacts/middlemain/` — the main Expo mobile app
- `artifacts/middlemain/context/` — ThemeContext, AIContext, PurchaseContext
- `artifacts/middlemain/constants/themes.ts` — all 8 theme definitions
- `artifacts/middlemain/components/` — NeonText, NeonCard, NeonButton, AdBanner, etc.
- `artifacts/middlemain/app/(tabs)/` — Home, Bridge Terminal, Connections, Settings
- `artifacts/middlemain/app/legal.tsx` — Privacy Policy + Terms & Conditions
- `artifacts/api-server/src/` — Express API server

## Themes (8)

| Key | Name | Primary | Secondary |
|-----|------|---------|-----------|
| cyberpunk | Cyberpunk (default) | Hot pink #ff00aa | Cyan #00ffff |
| rainbow | Cyber Rainbow | Pink #ff0090 | Green #00ff88 |
| pink | Rose Neon | Cotton candy #ffb3d9 | Hot pink #ff69b4 |
| sunshine | Sunshine | Yellow #ffe600 | Amber #ffaa00 |
| matrix | Matrix | Lime #39ff14 | Green #00ff41 |
| serene | Serene | Aqua #00e5ff | Blue #00bfff |
| monochrome | Monochrome | White #ffffff | Grey #cccccc |
| prism | Prism | Warm pink #ffb3de | Pastel blue #b3d9ff |

## Pricing

- Monthly: $3.99/month
- Annual: $29.99/year (save 37%)
- Ad removal: $1.99 one-time

## AI Provider Support

- Grok (xAI) — https://api.x.ai/v1
- OpenAI — https://api.openai.com/v1
- Anthropic — https://api.anthropic.com/v1
- Custom (any OpenAI-compatible API)

## Architecture decisions

- API keys stored in AsyncStorage (local device only, never transmitted to our servers)
- SSE streaming via expo/fetch for real-time AI responses
- Multi-theme system via ThemeContext + AsyncStorage persistence
- Simulated purchase flow for beta (production: wire up RevenueCat)
- No user accounts required — app is fully local-first

## Product

- **Home** — Dashboard showing connected AIs, status, quick navigation
- **Bridge Terminal** — Chat/Analyze/Debug/Explain/Transform with any connected AI, streaming output
- **Connect** — Add/edit/test/delete AI connections with API key management
- **Settings** — Theme selector, subscription/pricing, bug report tool, legal

## User preferences

- Name: Dev (the agent)
- Build native mobile app only (no webapp)
- Aggressive pricing compared to competitors
- No user PII collected — only anonymous usage data and user-submitted reports
- Easy-to-find reporting tool in Settings
- Apple and Google dev accounts ready for submission

## Gotchas

- expo-clipboard must be version ~8.0.8 (expo SDK 54 compatible)
- Streaming uses `fetch` from `expo/fetch` (NOT the global fetch) for ReadableStream support
- ThemeProvider must be above ErrorBoundary in _layout.tsx for ErrorFallback theming to work
- useColors() is now a thin wrapper over useTheme() — prefer useTheme() in new components
- app.json must stay static (no app.config.ts/js) for Expo Launch to work

## Pointers

- See the `pnpm-workspace` skill for workspace structure
- See the `expo` skill for publishing via Expo Launch (iOS App Store only from Replit)
- Google Play submission is manual (EAS CLI or upload AAB directly)
