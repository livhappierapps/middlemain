# Developer index

Use this page as the map to Middlemain's code and operating instructions. It covers the whole pnpm workspace; Middlemain is one artifact in a multi-app repository.

## Find the right starting point

| If you need to… | Start here |
|---|---|
| Understand what a user can do | [Middlemain user guide](middlemain-user-guide.md) |
| Find screens and app logic | `artifacts/middlemain/app/(tabs)/`, `components/`, `context/`, and `utils/` |
| Change the API or WebSocket behavior | `artifacts/api-server/src/` |
| Change the guest Council website | `artifacts/council-room/src/` |
| Update the bundled offline/AI guide | Edit `docs/middlemain-user-guide.md`, then run `pnpm run guide:sync` and `pnpm run guide:check` |
| Work on private-repository debugging | [Repository debugging notes](repository-debugging.md) |
| Review security boundaries or release blockers | [Security status](security-status.md) and the root [threat model](../threat_model.md) |
| Understand Replit-specific constraints | [replit.md](../replit.md) and [AGENTS.md](../AGENTS.md) |

## Workspace map

| Artifact or area | Purpose |
|---|---|
| `artifacts/middlemain/` | Expo mobile app: screens, local state, provider connections, Bridge, Council controls, repository tools, help, and Human Hands. |
| `artifacts/api-server/` | Backend APIs, WebSockets, authorization, repository preflight, and the Android-download proxy. |
| `artifacts/council-room/` | Guest-facing web client for shared Council rooms. |
| `artifacts/mockup-sandbox/` | Isolated component previews; not part of the consumer app runtime. |
| `lib/` | Shared workspace code. Check package boundaries before adding a dependency or moving a module. |
| `scripts/` | Workspace checks, guide generation, and regression tests. |
| `patches/` | Deliberate pnpm patches; do not remove one until an upstream fix and its tests replace it. |

### Middlemain code map

- `app/(tabs)/` contains the navigable screens. `more.tsx` keeps less-used destinations reachable without crowding the main tab bar.
- `components/` contains reusable screen pieces; `context/` owns shared app state and provider integrations.
- `constants/appGuide.ts` is generated. Edit the Markdown guide instead of editing this file by hand.
- `utils/` contains bounded network, parsing, GitHub, and feature helpers.
- `app.json`, `eas.json`, and `scripts/` control Expo/native configuration and build support. Keep `app.json` static for Expo Launch.

## Run and verify

From the workspace root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/middlemain run dev
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/council-room run dev
```

Use the corresponding managed Replit workflow for previews; do not create duplicate workflows for these artifacts.

```sh
pnpm run guide:check
pnpm run test:middlemain
pnpm run typecheck
pnpm --filter @workspace/api-server run build
```

The test suite uses mocks and bounded fixtures; it does not prove access to a live GitHub App, provider, MCP server, store, or physical device. For repository preflight, submitted code is treated as data and must not be executed.

## Data, credentials, and cost boundaries

- AI requests use the selected user's connection and may incur that provider's charges. Keep explicit consent before any paid request; do not add automatic paid retries.
- Repository checks are bounded and are not native build certification. Review private source for secrets before sending code to an AI.
- Human Hands stores checklist details locally. Its new vault uses OS-backed secure storage for values, but its labels are stored separately in local app storage. Vault values are not read by AI or inserted into websites.
- Other saved connection keys are not automatically migrated into the Human Hands vault. Do not claim that every stored key is encrypted.
- Never bundle owner credentials in consumer builds. Keep owner, room-host, GitHub App, MCP, provider, and webhook credentials on their intended paths; do not treat shared links as authorization.
- Tests should not call live AI, search, GitHub, or other metered services.

## Native builds and store release

- EAS (the cloud build service) may incur charges. Do not start a new build or submission without explicit approval for that attempt.
- Before a paid build, run typechecks, the regression suite, security checks, and local Android/iOS JavaScript exports from the exact source revision.
- Follow the pinned toolchain and profiles in `artifacts/middlemain/eas.json`. Preserve existing signing credentials; never revoke an Apple certificate without explicit approval for the named certificate.
- A successful build is not a device test or store approval. Check permissions and secure-storage behavior on physical devices, then verify the APK download through the API proxy.
- The account owner must handle Apple/Google account authentication, agreements, privacy disclosures, billing/tax details, final review answers, and store submission approvals. These services do not have a universal safe one-click agent connection.
- Provider credentials and usage are separate from app-store purchases. A service that offers OAuth can avoid collecting its password; services without supported OAuth still require user-controlled setup.

## Public-source checklist

The project has an MIT license, but repository visibility has not been changed. Before making it public:

1. Confirm the owner has rights to license all first-party code and preserve third-party notices.
2. Review tracked `attached_assets/` and workspace-specific `.agents/` content. A `.gitignore` entry does not remove files already tracked or erase them from Git history.
3. Scan the full Git history and any screenshots, logs, sample configs, and integration handoffs for credentials or personal information.
4. Confirm third-party skill, image, font, and other asset redistribution rights.
5. Resolve remaining high-severity dependency findings and rerun the privacy/dataflow scan; a failed scan is not a clean result.
6. Verify that the public privacy-policy URL and store metadata are live and accurate.

Keep public repository visibility separate from a normal private GitHub push. Do not change visibility or publish a public mirror without the owner's explicit decision.
