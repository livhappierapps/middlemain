# Middlemain agent notes

pnpm workspace. Do not add package-lock.json or yarn.lock. Install with pnpm.

## Layout
- `artifacts/api-server` Express API. Grok proxy lives at `src/routes/grok.ts` and reads `XAI_API_KEY` (or a runtime key via `src/lib/xaiKey.ts`).
- `artifacts/council-room` web UI.
- `lib/` shared db, zod, api client.
- `.agents/skills` is the skill library. Grok Build picks these up.

## Grok
- Terminal agent: `bash scripts/install-grok-cli.sh` then `grok` in this repo.
- Official installer: `curl -fsSL https://x.ai/cli/install.sh | bash`
- App proxy default model: `grok-4.7`. Callers may override `model` on `POST /api/grok/chat`.
- Never commit API keys. Use `XAI_API_KEY` in the environment.
