---
name: EAS release setup
description: Replit build constraints and initial Apple signing setup using an ASC API key.
---

Run EAS builds in the assigned task agent with EAS_SKIP_AUTO_FINGERPRINT=1, not the main agent.

**Why:** The main-agent sandbox can block EAS's Git index writes.

**How to apply:** Keep the fingerprint bypass even when building through a project task.

Initial iOS distribution certificate creation requires interactive EAS credential setup. Supplying ASC API-key environment variables does not make the non-interactive build path create a missing certificate.

**Why:** EAS's non-interactive distribution-certificate path only reuses an existing certificate. Interactive credentials:configure-build can authenticate using the ASC key without an Apple password.

**How to apply:** Supply EXPO_ASC_API_KEY_PATH, EXPO_ASC_KEY_ID, EXPO_ASC_ISSUER_ID, EXPO_APPLE_TEAM_ID, and EXPO_APPLE_TEAM_TYPE to interactive credentials setup. Keep the private key in a permission-restricted temporary file and clean it up. Never automatically accept certificate revocation: Apple permits only three distribution certificates, and existing non-App-Store builds may depend on them. Get approval for a specific certificate or reuse its existing .p12/private key.

Validate the ASC key cryptographically and look up the exact bundle identifier's app record before buying a build.

**Why:** A PEM envelope alone does not prove usable formatting, and Apple signing credentials do not imply an App Store app record exists. Either can block submission after paying for a build.

**How to apply:** Normalize only parseable PKCS#8 material into a private temporary file, require Apple's EC P-256 format, and perform a read-only app lookup first. Creating the App Store record and choosing a certificate revocation still require the creator's action or specific approval.

Prefer EAS-managed signing for Middlemain's iOS release.

**Why:** The user explicitly selected EAS signing.

**How to apply:** Use EAS-managed remote credentials, while obtaining separate approval before revoking any existing Apple certificate.

Check plist parser compatibility before treating a “malformed provisioning profile” error as an Apple credential failure.

**Why:** The hardened xmldom parser requires an explicit MIME type, but legacy Expo plist callers omit it. This caused EAS to reject newly active profiles and later fail native prebuild. Supplying ASC authentication only masked the problem by allowing profile regeneration.

**How to apply:** Preserve the hardened XML dependency and verify Expo/EAS plist parsing plus a native prebuild before another paid build. Do not respond to this error by revoking more certificates. Keep any required ASC key temporary and permission-restricted.
