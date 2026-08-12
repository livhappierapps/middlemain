# Middlemain

Universal AI Development Bridge — a native mobile developer tool that acts as an intelligent bridge between multiple AI providers, enabling real-time code testing, debugging, multi-agent council sessions, and AI-assisted development workflows. Built for Leo and the council.

**Version:** 1.2.0 (build 3) | **Bundle ID:** app.middlemain.bridge | **Company:** LivHappier Apps

---

## Run & Operate

- `pnpm --filter @workspace/middlemain run dev` — Expo dev server
- `pnpm --filter @workspace/api-server run dev` — API server (uses `PORT` env var)
- `pnpm --filter @workspace/council-room run dev` — Council Room web app (live; join via `?room=<roomId>`)
- `pnpm run typecheck` — full typecheck across all packages

---

## Artifacts

| Artifact | Kind | Path |
|---|---|---|
| `artifacts/middlemain` | Expo mobile app | — |
| `artifacts/api-server` | Express API server | `/api` |
| `artifacts/council-room` | Web app (live) | `/council-room` |

---

## Stack

- **Mobile:** Expo SDK 54, React Native 0.81, TypeScript 5.9, Expo Router
- **Persistence:** AsyncStorage (API keys, theme, council history, purchases)
- **AI:** Grok (xAI), OpenAI, Anthropic, Custom (OpenAI-compatible), Dev Server proxy
- **Streaming:** `expo/fetch` with SSE parsing (NOT global fetch — ReadableStream requirement)
- **Vision:** grok-2-vision-1212 / gpt-4o / claude-3-5-sonnet
- **Backend:** Express 5 + `ws` (WebSocket rooms live — council room manager in `api-server/src/routes/councilRoom.ts`)
- **Build:** EAS Build (production profile, `image: "latest"` for Xcode 26+)

---

## Where Things Live

```
artifacts/middlemain/
  app/(tabs)/
    index.tsx          — Home dashboard
    council.tsx        — Multi-agent council (chat, auto-sessions, vision, webhooks)
    debug.tsx          — AI Analyze (Grok streaming) + Dry Run (real tsc)
    terminal.tsx       — Bridge Terminal (AI chat + skills)
    connections.tsx    — Manage AI connections
    settings.tsx       — Theme, subscription, executive API, XAI key updater, webhook

  context/
    ThemeContext.tsx   — 8 themes
    AIContext.tsx      — AI provider logic, streaming, vision
    CouncilContext.tsx — Council sessions, participants, webhooks, autonomous rounds
    MCPContext.tsx     — Memory Machine MCP bridge
    PurchaseContext.tsx
    SkillsContext.tsx

  components/
    NeonText, NeonCard, NeonButton, AdBanner, ConnectionCard,
    ThemeSelector, ErrorBoundary, ErrorFallback, ThemedBackground

  constants/themes.ts  — All 8 theme definitions

artifacts/api-server/src/
  routes/
    executive.ts   — Leo's executive API (status, chat, memory, webhook, set-xai-key)
    grok.ts        — Grok proxy (/api/grok/chat, /api/grok/status)
    debug.ts       — TypeScript dry-run (/api/debug/typecheck)
    health.ts      — Health check
  lib/
    xaiKey.ts      — Runtime XAI key store (set from app without server restart)
    logger.ts      — Pino logger
```

---

## Leo's Executive API

Base: `https://{domain}/api/executive/`
Auth header: `X-Executive-Key: <LEO_EXECUTIVE_KEY>`

| Method | Path | Purpose |
|---|---|---|
| GET | `/executive/status` | Ping; shows grokConfigured, memoryConfigured |
| POST | `/executive/chat` | Grok chat via server XAI key |
| POST | `/executive/memory/search` | Search Memory Machine |
| POST | `/executive/memory/save` | Save to Memory Machine |
| GET | `/executive/memory/recent` | Recent memories |
| POST | `/executive/set-xai-key` | Update XAI key at runtime (no restart needed) |
| POST | `/executive/webhook/council` | Inbound council digests from Middlemain |
| GET | `/executive/webhook/inbox` | Read received digests (last 30) |

**Secrets needed:**
- `LEO_EXECUTIVE_KEY` — executive API auth key
- `LEO_MEMORY_TOKEN` — Memory Machine bearer token
- `XAI_API_KEY` — xAI API key (can also be updated at runtime via `/executive/set-xai-key`)

---

## Themes (8)

| Key | Name | Primary | Secondary |
|---|---|---|---|
| cyberpunk | Cyberpunk (default) | Hot pink #ff00aa | Cyan #00ffff |
| rainbow | Cyber Rainbow | Pink #ff0090 | Green #00ff88 |
| pink | Rose Neon | Cotton candy #ffb3d9 | Hot pink #ff69b4 |
| sunshine | Sunshine | Yellow #ffe600 | Amber #ffaa00 |
| matrix | Matrix | Lime #39ff14 | Green #00ff41 |
| serene | Serene | Aqua #00e5ff | Blue #00bfff |
| monochrome | Monochrome | White #ffffff | Grey #cccccc |
| prism | Prism | Warm pink #ffb3de | Pastel blue #b3d9ff |

---

## Pricing

- Monthly: $3.99/month
- Annual: $29.99/year (save 37%)
- Ad removal: $1.99 one-time

---

## EAS Build

- Project ID: `a72a78ff-35a8-41f1-8e9a-897a88b03eb8`
- iOS: production profile, `image: "latest"` (requires Xcode 26+)
- Android: production profile, `buildType: app-bundle`
- Submit Apple ID: oblivionhappier@icloud.com
- GitHub repo: `livhappierapps/middlemain` | base dir: `artifacts/middlemain`
- **EAS must be triggered via a project task** — EAS CLI acquires a git index lock that Replit's sandbox blocks in the main agent

---

## Gotchas

- `expo-clipboard` must be `~8.0.8` (Expo SDK 54 compatible)
- Streaming uses `fetch` from `expo/fetch` — NOT global fetch (ReadableStream requirement)
- `ThemeProvider` must be above `ErrorBoundary` in `_layout.tsx` for `ErrorFallback` theming
- `app.json` must stay static (no `app.config.ts/js`) for Expo Launch compatibility
- `pnpm-lock.yaml` must have matching `pnpm.overrides` in root `package.json` or EAS frozen install fails
- After any `pnpm update`, run `pnpm install --frozen-lockfile` to verify before pushing to GitHub
- Shadow/textShadow deprecation warnings are web-only noise — safe to ignore
- E2E Playwright testing cannot reach the Expo mobile build via browser proxy — skip

---

## User Preferences

- Agent name: **Dev**
- Build native mobile first; no unnecessary web layers
- No PII collected — anonymous usage data and user-submitted reports only
- Easy-to-find reporting tool in Settings
- Apple and Google dev accounts ready
- Contact: oblivionhappier@icloud.com | LivHappier Apps | livhappierapps.com
