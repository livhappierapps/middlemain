# Middlemain

Middlemain is a mobile-first development companion built with Expo. It connects a developer's chosen AI providers with repository debugging, Bridge tools, multi-agent Council rooms, offline help, and Human Hands setup checklists.

## Start here

- **[Developer index](docs/DEVELOPER_INDEX.md)** — code map, commands, security boundaries, and release checklist.
- [User guide](docs/middlemain-user-guide.md) — app controls, privacy, and provider-cost behavior.
- [Repository debugging](docs/repository-debugging.md) — GitHub authorization and bounded source checks.
- [Security status](docs/security-status.md) and [threat model](threat_model.md).
- [Replit contributor instructions](replit.md) — workspace-specific runtime constraints.

The user guide is bundled into the app. Offline help reads it locally; AI help adds relevant sections to an existing, user-approved request. It does not train a model or make a second request.

## Local development

Use the repository's pinned pnpm setup:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/middlemain run dev
```

Run the main checks before changing or releasing code:

```sh
pnpm run typecheck
pnpm run test:middlemain
pnpm --filter @workspace/api-server run build
```

Managed Replit workflows provide artifact ports. See the [developer index](docs/DEVELOPER_INDEX.md) for workspace routes and release checks.

## Costs and credentials

Requests to a connected AI provider can incur charges from that provider. The app's tests use mocked provider/GitHub calls; they do not prove live service authorization. Never put secrets in source, screenshots, task descriptions, or public issues. Human Hands' vault is separate from existing provider-connection storage.

### Bridge connection stability

Bridge Terminal checks the selected provider's model-list endpoint (or the server's status endpoint), without generating replies, replaying messages, or uploading media. The quality badge is green through 500ms, yellow above 500ms, and red above 1000ms; unavailable checks show offline.

Slow or failed checks retry after 1, 2, 4, 8, 16, then at most 30 seconds between attempts. Healthy checks reset backoff and resume every 8 seconds. Requests time out after 10 seconds. Retry scheduling, attempts, failures, and recovery appear in the terminal without credentials or response bodies. Authorization/configuration errors pause retries until a manual check, settings change, or return to the screen. Checks stop on background/navigation and cancel when the connection changes.

The server-key switch starts off and requires manual selection. Bridge never switches keys on latency or failure, and personal memory does not transfer to the server connection. Custom providers must support a model-list endpoint for these checks. A successful connectivity check is not proof that model access, memory, or the separate AIs & Ears media bridge works.

## License and public release

The project is licensed under the [MIT License](LICENSE). GitHub visibility has not been changed. The tracked workspace support files and attachments still need a public-release review before the repository is made public.
