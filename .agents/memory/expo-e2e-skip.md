---
name: Expo E2E testing skip
description: Playwright-based runTest() cannot reach the Expo mobile build via browser proxy; skip with documented reason.
---

# Expo E2E Testing Limitation

## The Rule
Skip `runTest()` (Playwright-based) for the Middlemain Expo app and document the reason. Do not treat it as a test failure.

**Why:** The Expo Metro bundler starts on `$PORT` and serves the mobile JavaScript bundle, not a web app. The Replit proxy routes browser traffic to the port, but the Expo bundler responds with 404 for `GET /` because it expects the Expo Go client protocol, not a standard browser request. The web version (react-native-web) requires a separate web build step that isn't part of the dev workflow.

**How to apply:**
- In "The Greatest Hits" skill (Step 2), log: "Tests skipped — Expo mobile app requires physical device or emulator via Expo Go. Web browser E2E not applicable."
- For any specific UI logic testing, use TypeScript's `tsc --noEmit` (typecheck) as a proxy for catching code errors.
- Full E2E testing is done manually on-device via Expo Go or a production build installed via TestFlight/direct APK.
