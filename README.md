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

## License and public release

This repository currently has no `LICENSE` file. Do not assume permission to reuse or redistribute the code until the owner selects and adds a license. The tracked workspace support files and attachments also need a public-release review before the repository is made public.
