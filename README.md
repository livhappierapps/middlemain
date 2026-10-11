# Middlemain

Native Expo developer app with AI provider connections, Bridge chat, multi-agent Council sessions, repository debugging, and offline/AI help. Built by LivHappier Apps.

## Instructions

- **[User guide: every main screen, control group, and tips](docs/middlemain-user-guide.md)**
- [Private GitHub access and isolated source checking](docs/repository-debugging.md)
- [Security findings and release gates](docs/security-status.md)
- [Threat model](threat_model.md)
- [Contributor/runtime constraints](replit.md)

The user guide is also bundled into the app. Offline help reads it locally. AI help retrieves relevant sections into the existing request; it does not train a model or make an extra AI request.

## Run and check

Use pnpm, not npm or yarn:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test:middlemain
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/middlemain run dev
```

Other services: `pnpm --filter @workspace/api-server run dev` and `pnpm --filter @workspace/council-room run dev`. Managed Replit workflows provide their ports. Tests use mocked AI/GitHub calls and isolated files, not paid provider requests.

After updating the canonical guide:

```sh
pnpm run guide:sync
pnpm run guide:check
```

## Release

Do not start a paid build until source checks, security gates, and production backend verification pass. iOS production uses the latest Xcode EAS image; Android `preview` emits an APK and `production` emits an AAB. Keep root/workspace overrides synchronized with the lockfile and preserve macOS native dependencies.

From `artifacts/middlemain`, use `EAS_SKIP_AUTO_FINGERPRINT=1 pnpm exec eas build --platform ios --profile production`. Submit a completed build with `bash scripts/submit-ios.sh --id <build-id>`. The script inherits ASC secrets, creates a temporary private configuration/key, waits for submission, and cleans up. It looks up the App Store app record; `ASC_APP_ID` can specify an existing numeric record. `MIDDLEMAIN_SUBMIT_DRY_RUN=1` validates preparation without submitting; it is not a real submission test.

After a **new security-verified** Android APK finishes, record its stable `expo.dev/artifacts/eas/*.apk` URL in `artifacts/api-server/src/lib/androidRelease.ts`, then verify `/api/download/android`. Production never runs EAS signing tools through that public endpoint. Do not publish expiring storage redirects or an older pre-fix APK.

Apple certificate limits require a reusable signing certificate/private key or explicit approval to revoke a named certificate. Never automatically revoke certificates that may be used by other apps. Native permissions, private GitHub authorization, store purchasing integration, and App Store metadata still need device/platform validation.
