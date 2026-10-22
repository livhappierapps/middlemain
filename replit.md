# Middlemain contributor instructions

Middlemain is LivHappier Apps' native-first Expo developer tool: provider connections, Bridge chat/vision, multi-agent Council, repository debugging, and offline/AI help. Preserve that product and its existing theme system; do not add unnecessary web layers.

## Runtime and documentation

- `artifacts/middlemain`: Expo SDK 54 / React Native 0.81; Expo Router screens and contexts.
- `artifacts/api-server`: Express 5 / WebSockets at `/api`; isolated source checking, owner services, live rooms, APK proxy.
- `artifacts/council-room`: guest web client at `/council-room`.
- [Canonical user guide](docs/middlemain-user-guide.md): screen/control instructions and tips. It is also the source for bundled offline/AI help.
- [Repository debugging](docs/repository-debugging.md): customer GitHub App authorization and single-file compiler boundaries.
- [Security/release gates](docs/security-status.md) and [threat model](threat_model.md).

Use pnpm. Managed workflows provide the service ports:

```sh
pnpm --filter @workspace/middlemain run dev
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/council-room run dev
pnpm run typecheck
pnpm run test:middlemain
```

After a guide edit, run `pnpm run guide:sync` and `pnpm run guide:check`. Do not independently maintain a second offline FAQ. AI retrieval adds relevant sections to the existing request; never claim it trains the model or guarantees every answer.

## Engineering constraints

- Keep `app.json` static for Expo Launch; do not replace it with an app.config file.
- Native streaming must use `expo/fetch`, including shared network wrappers—not just the calling component. Node fetch mocks cannot prove native streaming works.
- Keep `ThemeProvider` above `ErrorBoundary`; preserve theme keys in `constants/themes.ts`.
- Customer private GitHub access needs a read-only, customer-authorized GitHub App/device flow. Never bundle the workspace owner's GitHub token into a consumer build.
- AI source review requires explicit cost/data-sharing consent, uses customer credentials, and does not automatically retry. Dry Run is not a paid EAS/native build and never executes submitted code or follows its imports.
- The API's TypeScript compiler is a runtime dependency. Its isolated checks need fixed options, limited input, and no package installation.
- Owner-funded Grok, Executive API, and inbound owner webhooks require executive authorization. New room AI/system publications require a separate room host key; guest links and MCP keys cannot authorize them.
- Keep host keys in native secure storage, separate from share links/MCP tokens. Pin room publication to the server that created it. Old hosts without a key create a new room; preserve prior history.
- AI-provider, AIs & Ears bridge, and Memory Machine MCP tokens use Expo SecureStore on iOS/Android, with one-time legacy migrations that preserve old data if secure storage fails. Only non-secret Memory Machine URL/state metadata remains in AsyncStorage. Browser preview keeps these tokens in session memory only. Other values not yet migrated remain local storage, not a promise of encryption; do not claim submitted messages, guest names, source, or images never leave the device.
- No purchase simulation or unverified paid entitlements. Store purchases/restore remain explicitly unavailable until real integration is tested.
- Keep error messages explicit, secrets out of logs, and room writes atomic. Invalid persisted history must not be silently overwritten.

## Dependency/build constraints

- Root `package.json` and `pnpm-workspace.yaml` overrides must agree with `pnpm-lock.yaml`. Verify a frozen installation after dependency edits.
- Preserve `patches/` and patchedDependencies entries until compatible upstream fixes replace them. Version-based audits still flag patched versions; report mitigations honestly.
- Align React type versions across packages within Expo's supported range; do not fix incompatible ref types with broad unsafe casts.
- Do not exclude Darwin native packages just because the workspace uses Linux; iOS EAS builders need macOS binaries.
- Do not commit generated source archives, exports, test output, or credential files. Use `generated-artifacts/` for local output; preserve user-uploaded originals unless specifically approved for deletion.
- EAS production iOS needs `"image": "latest"` for Xcode 26+. Android preview produces APK; Android production produces AAB.
- EAS builds run through the assigned task with `EAS_SKIP_AUTO_FINGERPRINT=1`. Check security and backend deployment gates before spending build credits.
- Submission uses `artifacts/middlemain/scripts/submit-ios.sh`: current EAS takes ASC credential configuration, not `--asc-api-key-*` flags. Temporary keys/configuration must be private and removed.
- Never automatically revoke an existing Apple certificate. Obtain explicit approval for a named certificate or reuse its matching private key through the secure credential flow.
- Production APK download uses only an approved stable Expo artifact URL. It must not run the EAS signing CLI on public requests or promote a pre-fix binary.
- Browser previews, static scans, and mocked tests do not replace real-device permissions, streaming, private sign-in, native secure-storage recovery, or store submission verification.
