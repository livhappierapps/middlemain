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
