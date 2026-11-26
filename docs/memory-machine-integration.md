# Memory Machine → server Grok: automatic context injection

Status: built on `feature/memory-context-injection`, **not deployed**. Merging to `main`
auto-deploys `middlemain-api` on Render, so this ships only after review. Native pieces
(Sign in with Apple) need the next EAS build after TestFlight build 4; they cannot go out OTA.

## What happens on every server-Grok message

```
iPhone (Middlemain)                     middlemain-api (Render)                         Memory Machine API
 Bridge / Council  ── POST /api/grok/chat ──▶ requireOwner (X-Executive-Key)
   X-Memory-Token: <Clerk JWT>              withMemoryContext()  ── ≤1.5 s total ──▶ GET /v1/profile          (cached 10 min)
                                                                 ──────────────────▶ GET /v1/memories?q=<keywords>&match=any&limit=25
                                            rankMemories → top 5                       (Bearer <Clerk JWT>, or x-mm-service-key)
                                            system = base + "About the user" + "Relevant memories"
                                            ──▶ api.x.ai /chat/completions (unchanged provider logic)
```

- Hook: `artifacts/api-server/src/routes/grok.ts` → `withMemoryContext()` in
  `src/lib/memoryContext.ts`, which calls the shared `injectMemoryContext()` from
  conn-manager (vendored in `src/lib/memory/`, see `VENDORED.md`).
- Never blocks chat: unset config, errors, 4xx/5xx, or a slow Memory Machine all fall back to
  the original prompt within ~1.5 s (`MEMORY_TIMEOUT_MS`). Response header
  `X-Memory-Context: profile=0|1;memories=N` shows what was added (no content).
- Ranking (conn-manager `rankMemories`): `0.6·keyword overlap + 0.25·freshness + 0.25 high-stakes`,
  freshness half-life 45 days (`MEMORY_HALF_LIFE_DAYS`), high-stakes memories (DHS, court, custody,
  ICWA, hearing, medical, camper, …; extend with `MEMORY_HIGH_STAKES_TERMS=a,b`) get a boost and never
  decay below 0.8, so old load-bearing memories aren't buried by fresh keyword noise.

## Profile layer

- Stored in Memory Machine as ONE upserted row per user (`GET/PUT /v1/profile`, new in the
  memory-machine PR). It's excluded from search so it never summarizes itself.
- Rebuilt by `POST /api/memory/profile/rebuild` (owner key). Incremental: reads only memories newer
  than the last build (paged `GET /v1/memories?before=`); a night with no new memories makes **zero**
  LLM calls. First build also pulls older high-stakes memories. Cost guards: 400 memories, 4 LLM calls,
  4,000-char profile (`MEMORY_PROFILE_MAX_MEMORIES`, `MEMORY_PROFILE_MAX_LLM_CALLS`, `MEMORY_PROFILE_MAX_CHARS`).
- Section headings are generic (identity, family/household, home, health, legal/case matters, work/apps,
  brand/style, how to help, open threads). Every fact comes from memories at build time.
- Summarizer: xAI `grok-4.3` (cheapest text model, `$1.25 / $2.50` per 1M in/out tokens), override with
  `MEMORY_PROFILE_MODEL`. **Billed to middlemain-api's `XAI_API_KEY` (Liv's key).**

### Scheduling options (pick one; nothing is created yet)

| Option | Cost | Notes |
| --- | --- | --- |
| **GitHub Actions** `.github/workflows/memory-profile-nightly.yml` (recommended) | **$0** (public repo) | 3:00 AM CT nightly. Needs repo secrets `MIDDLEMAIN_API_URL`, `LEO_EXECUTIVE_KEY`. Wakes the free Render instance first. Runs only once merged to `main`. |
| Lazy rebuild-if-stale | $0 extra | Set `MEMORY_PROFILE_LAZY_HOURS=24`; a chat may start a background rebuild at most hourly. Off by default (spec says schedule, not on demand). |
| Render cron job | **$1/month minimum** (`$0.00016/min`, starter) | Only if Liv approves. Snippet below, not applied. |

```yaml
# NOT APPLIED. Render cron alternative (min $1/month). Add to a Blueprint only after approval.
services:
  - type: cron
    name: middlemain-memory-profile
    runtime: node
    plan: starter
    region: oregon
    schedule: "0 9 * * *"   # 09:00 UTC = 3:00 AM CST
    buildCommand: "true"
    startCommand: >-
      curl -fsS --retry 6 --retry-delay 15 --retry-all-errors "$MIDDLEMAIN_API_URL/healthz" > /dev/null;
      curl -fsS --max-time 300 -X POST "$MIDDLEMAIN_API_URL/memory/profile/rebuild"
      -H "content-type: application/json" -H "x-executive-key: $LEO_EXECUTIVE_KEY" -d '{}'
    envVars:
      - key: MIDDLEMAIN_API_URL
        sync: false
      - key: LEO_EXECUTIVE_KEY
        sync: false
```

## Auth: Clerk JWT vs service key

- Middlemain had **no Clerk** before this branch. Now: `context/MemoryAuthContext.tsx` mounts
  `ClerkProvider` (`@clerk/expo`, token cache in SecureStore) only when
  `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is set; otherwise the app behaves exactly as before.
  Settings → Memory Machine shows the native Sign in with Apple button (`useSignInWithApple`,
  `expo-apple-authentication`, `ios.usesAppleSignIn`).
- Token path: `getToken()` (Clerk refreshes silently, no prompts) → `X-Memory-Token` header on
  `/grok/chat` (AIContext + CouncilContext) → middlemain-api forwards it as `Authorization: Bearer`
  → Memory Machine verifies it against `CLERK_ISSUER` JWKS. Middlemain's server never verifies or logs it.
- `MEMORY_MACHINE_SERVICE_KEY`: Memory Machine previously accepted Clerk JWTs **only**. The memory-machine
  PR adds `x-mm-service-key`, bound to ONE Clerk user (`SERVICE_KEY_CLERK_USER_ID`), read-only plus
  `PUT /v1/profile`. It's what the nightly rebuild uses (no live session) and the fallback when the app
  isn't signed in. A Bearer token always wins.

## Settings → Memory Machine (app)

`components/MemoryMachineSettingsCard.tsx`: Memory Machine URL (AsyncStorage), service key
(SecureStore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; web preview keeps it in memory only), **Test connection**
(`GET /healthz`, then `GET /v1/me` with the key if one is entered), **Save** (stores locally and pushes
both to `POST /api/memory/config` with the executive key). The server keeps pushed values in memory until
restart and the app re-pushes on launch; Render env vars are the durable source. The Connect tab's Memory
Bridge card stays the MCP-tools connection and now points here for automatic memory.

## Server env (middlemain-api)

| Var | Required | Purpose |
| --- | --- | --- |
| `MEMORY_MACHINE_URL` | yes | Memory Machine API base URL (https) |
| `MEMORY_MACHINE_SERVICE_KEY` | for nightly rebuild | Same value as Memory Machine's `SERVICE_KEY` |
| `MEMORY_INJECTION` | no | `off` disables injection |
| `MEMORY_TIMEOUT_MS` | no | default 1500 |
| `MEMORY_HALF_LIFE_DAYS`, `MEMORY_HIGH_STAKES_TERMS` | no | ranking tuning |
| `MEMORY_PROFILE_MODEL`, `MEMORY_PROFILE_MAX_*`, `MEMORY_PROFILE_LAZY_HOURS` | no | profile rebuild tuning |

App build env (EAS, not committed): `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, optional
`EXPO_PUBLIC_MEMORY_MACHINE_API_URL` (prefills the URL field).

## Running cost per message

Injection adds at most ~1,600 input tokens per server-Grok message (4,000-char profile + 2,400-char
memories block). At grok-4.7's $2.00 / 1M input that's ≤ $0.0032 per message (≈ $3.20 per 1,000
messages), billed to middlemain-api's xAI key. Lower `MEMORY_PROFILE_MAX_CHARS` to cut it.
Server Grok is owner-only (`X-Executive-Key`), so no public user can spend it.
