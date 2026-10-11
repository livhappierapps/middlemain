---
name: React type alignment
description: Why compatible React runtimes can still fail ref typing across a mixed Expo/web workspace.
---

Keep React typings aligned across packages within the native SDK's supported range.

**Why:** Mixed React type releases produced incompatible opaque ref-return brands in shared UI components, even though each runtime dependency appeared compatible. Skipping library checks did not fix assignments in application code.

**How to apply:** When refreshing web/native dependencies together, check the native SDK's type range and align the workspace. Do not conceal this mismatch with unsafe casts or blindly force the newest web typings onto Expo.
