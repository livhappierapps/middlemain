# Middlemain

Universal AI Development Bridge — a native mobile developer tool that acts as an intelligent bridge between multiple AI providers, enabling real-time code testing, debugging, and AI-assisted development workflows.

**Version:** 1.0.0 (build 1) | **Bundle ID:** app.middlemain.bridge | **Company:** LivHappier Apps

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
- Vision: grok-2-vision-1212 (xAI), gpt-4o (OpenAI), claude-3-5-sonnet (Anthropic)
- UI: expo-linear-gradient, expo-haptics, expo-blur, react-native-reanimated
- Backend: Express 5 (api-server artifact)
- Build: EAS Build (production profile, Xcode latest / image: "latest")

## Where things live

- `artifacts/middlemain/` — the main Expo mobile app
- `artifacts/middlemain/context/` — ThemeContext, AIContext, PurchaseContext, SkillsContext
- `artifacts/middlemain/constants/themes.ts` — all 8 theme definitions
- `artifacts/middlemain/components/` — NeonText, NeonCard, NeonButton, AdBanner, ConnectionCard, ThemeSelector, ErrorBoundary, ErrorFallback
- `artifacts/middlemain/app/(tabs)/` — Home, Bridge Terminal (terminal), Connections, Settings
- `artifacts/middlemain/app/legal.tsx` — Privacy Policy + Terms & Conditions
- `artifacts/api-server/src/` — Express API server (Grok proxy via XAI_API_KEY)

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

- **Grok (xAI)** — https://api.x.ai/v1 | text: grok-3 | vision: grok-2-vision-1212
- **OpenAI** — https://api.openai.com/v1 | text: gpt-4o | vision: gpt-4o
- **Anthropic** — https://api.anthropic.com/v1 | text: claude-3-5-sonnet-20241022 | vision: same
- **Custom** — any OpenAI-compatible API
- **Dev Server (Grok)** — proxied via api-server using XAI_API_KEY secret

## Skills (8 built-in)

Code Analyzer, Debug Assistant, Code Explainer, Code Transformer, Security Reviewer, Performance Optimizer, Vision Analyzer (image), Screen Analyzer (vision + context)

## Architecture decisions

- API keys stored in AsyncStorage (local device only, never transmitted to our servers)
- SSE streaming via expo/fetch for real-time AI responses (NOT global fetch — ReadableStream requirement)
- Multi-theme system via ThemeContext + AsyncStorage persistence
- Simulated purchase flow for beta (production: wire up RevenueCat)
- No user accounts required — app is fully local-first
- Vision mode auto-activates grok-2-vision-1212 when image is attached in Bridge Terminal
- SkillsProvider wraps PurchaseProvider in _layout.tsx provider tree

## Product

- **Home** — Dashboard showing connected AIs, status, quick navigation
- **Bridge Terminal** — Chat/Analyze/Debug/Explain/Transform with any connected AI, streaming + vision
- **Connect** — Add/edit/test/delete AI connections with API key management
- **Settings** — Theme selector, subscription/pricing, bug report tool, legal (Sable URLs)

## EAS Build

- Project ID: a72a78ff-35a8-41f1-8e9a-897a88b03eb8
- iOS: production profile, `image: "latest"` (requires Xcode 26+)
- Android: production profile, buildType: app-bundle
- Submit Apple ID: oblivionhappier@icloud.com
- GitHub repo: livhappierapps/middlemain | base dir: artifacts/middlemain

## User preferences

- Name: Dev (the agent)
- Build native mobile app only (no webapp)
- Aggressive pricing compared to competitors
- No user PII collected — only anonymous usage data and user-submitted reports
- Easy-to-find reporting tool in Settings
- Apple and Google dev accounts ready for submission
- Contact: oblivionhappier@icloud.com | Company: LivHappier Apps | livhappierapps.com

## Gotchas

- expo-clipboard must be version ~8.0.8 (expo SDK 54 compatible)
- Streaming uses `fetch` from `expo/fetch` (NOT global fetch) for ReadableStream support
- ThemeProvider must be above ErrorBoundary in _layout.tsx for ErrorFallback theming to work
- useColors() is a thin wrapper over useTheme() — prefer useTheme() in new components
- app.json must stay static (no app.config.ts/js) for Expo Launch compatibility
- pnpm-lock.yaml must have matching `pnpm.overrides` in root package.json or EAS frozen install fails
- After ANY `pnpm update`, run `pnpm install --frozen-lockfile` to verify before pushing to GitHub
- Shadow/textShadow deprecation warnings are web-only noise — safe to ignore
- E2E Playwright testing does not work on the Expo mobile build — skip with documented reason

## Pointers

- See the `pnpm-workspace` skill for workspace structure
- See the `expo` skill for publishing via Expo Launch (iOS App Store only from Replit)
- Google Play submission is manual (EAS CLI or upload AAB directly)
- Run "the greatest hits" skill for a full security + test + cleanup + docs maintenance sweep
