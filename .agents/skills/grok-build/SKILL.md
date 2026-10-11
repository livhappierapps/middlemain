---
name: grok-build
description: Install and use the official Grok Build CLI in middlemain. Triggers on grok cli, grok build, install grok, x.ai/cli, update grok model.
---

# Grok Build in middlemain

The current official install is:

```bash
bash scripts/install-grok-cli.sh
# equivalent:
curl -fsSL https://x.ai/cli/install.sh | bash
```

npm fallback: `npm i -g @xai-official/grok`

After install, open a new shell and run `grok` in the repo root. Auth is browser login, `grok login --device-auth`, or `XAI_API_KEY`.

The in-app proxy is `artifacts/api-server/src/routes/grok.ts`. Default model is `grok-4.7`. Do not hardcode keys.
