---
name: EAS Xcode version
description: iOS EAS builds require image latest in eas.json to get Xcode 26+; omitting it causes a build failure.
---

# EAS Build Xcode Version

## The Rule
All iOS build profiles in `eas.json` must include `"image": "latest"` to ensure EAS uses Xcode 26 or newer.

```json
"production": {
  "ios": {
    "buildConfiguration": "Release",
    "image": "latest"
  }
}
```

**Why:** As of June 2026, Expo SDK 54 with React Native 0.81 requires Xcode 26+. EAS defaults to an older image that doesn't meet this requirement, causing the build to fail immediately with a message like "need to use Xcode 26 or newer".

**How to apply:** Add `"image": "latest"` to every iOS block in `eas.json` (development, preview, and production profiles). This applies to the `artifacts/middlemain/eas.json` file.
