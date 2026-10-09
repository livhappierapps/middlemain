# Repository debugging in Middlemain

## What works

Debug accepts an HTTPS GitHub repository URL, with an optional branch. It lists up to 300 supported source/configuration files and imports the file the user chooses, pinned to a commit. Pasting code remains available.

Dry Run checks the selected JS/TS file with the server's TypeScript compiler, or validates JSON locally. It does **not** follow source imports/reference paths, install the repository's dependencies, execute repository scripts, start EAS, or prove that a native build will pass. Missing project dependencies and imports can appear as diagnostics in an isolated-file check.

AI Analyze uses the customer's own saved provider connection, never the owner's server credits. It requires an explicit consent checkbox, limits source to 60,000 characters and output to 2,048 tokens, sends one request, and does not automatically retry. A stopped or timed-out request may already have incurred a provider charge. Review private source for secrets before sending it to any AI.

GitHub imports have a 30-second request timeout, a 3 MB metadata response limit, and a 150 KB selected-file limit. Generated folders, large files, and obvious credential filenames are skipped. Results may be partial. Compiler checks are capped at two concurrent requests and cannot report success when the compiler fails to complete.

## Private repository setup — not yet configured

This requires a **GitHub App**, not a shared owner token and not the workspace's development GitHub integration. Registration itself does not require a paid AI or EAS service. No registration or native build was performed as part of this change.

1. Register a GitHub App for Middlemain at https://github.com/settings/apps/new. Set **Repository permissions → Contents → Read-only**; leave other optional permissions disabled. Metadata read access is automatic.
2. Enable **Device Flow** and leave user-token expiration enabled. The native app does not need the GitHub App's private key or client secret.
3. Set the public build-time variable `EXPO_PUBLIC_GITHUB_APP_CLIENT_ID` to that app's **client ID**, not its app ID. Optionally set `EXPO_PUBLIC_GITHUB_APP_SLUG` so users can open its installation page directly.
4. Install the app only on the repositories the user chooses. In the installed Middlemain app, tap **Sign in for private repos**, copy the verification code, authorize it on GitHub, and return to Debug.

The public client ID must be present when the eventual native app bundle is built. The Replit shared environment variable enables the development preview, but does not prove that a separate remote EAS build environment has it. This document does not authorize a paid rebuild. Without the ID in a build, the app explicitly states that private-repo sign-in is unavailable; public repositories and pasted code still work.

Customer authorization is stored only in memory for this session, expires after at most eight hours, and is discarded on disconnect, expiry, or app restart. When it expires, the private-repository listing is cleared and the user must sign in again; source already copied into the Debug editor remains until the user clears it. Disconnect forgets the token; **Revoke GitHub access in GitHub settings** removes the authorization at GitHub. No refresh token is stored.

Native iOS/Android support device sign-in. The Expo browser preview can load public repos, but GitHub's device-flow endpoints do not allow browser-origin requests; the UI explains that limitation. A private-repository native smoke test remains required after registration.

Official protocol: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app

## Verification

- `node --test scripts/middlemain-repository-tests.mjs` runs mocked GitHub/provider requests only. It does not contact paid services.
- `pnpm --filter @workspace/middlemain run typecheck`
- `pnpm --filter @workspace/api-server run typecheck`
- Inspect Debug in the Expo preview and exercise the local compiler endpoint with clean and invalid source.

The separately queued help-and-guide task is not duplicated here. Final source ZIP and store submission remain separate shipping milestones.

### Last full check — October 7, 2026

- Eight mocked GitHub/provider tests passed; no paid-provider requests were made.
- Mobile and API TypeScript checks passed.
- Frozen-lockfile installation passed without running dependency scripts.
- Live development API checks accepted clean source, rejected a type error, and rejected an untrusted filesystem import.
- Debug was inspected at a phone-sized viewport. Native private-repository authorization and live paid AI requests were not verified.

### Rechecked on October 9, 2026

- The eight mocked tests and Middlemain TypeScript check pass.
- The Replit shared GitHub App client ID was saved and the Expo development preview was restarted. No native private-repository authorization, selected-private-repository import, GitHub revocation, or live paid AI request was performed.
