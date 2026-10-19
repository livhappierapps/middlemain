# Human Hands

## Scope
Add a Middlemain tab for planning third-party setup work and a device-only secrets vault. Use an already connected AI only after a clear per-request cost/data confirmation.

## Phases
1. Inspect existing tab, AI, storage, and theme patterns — in progress.
2. Build the local checklist workflow and Human Hands navigation entry.
3. Add an OS-secure vault for user-managed secrets, with device authentication and explicit copy/reveal actions.
4. Run focused checks, workspace typecheck, and inspect the rendered screen.

## Boundaries
- No new provider/API, account creation, universal auto-fill, or unattended verification.
- Vault secrets stay in iOS Keychain/Android Keystore-backed SecureStore and are never sent to AI or websites automatically.
- No background AI requests. The user chooses a connection and explicitly authorizes each potentially billable request.
- User must complete login, verification, payment, and final consent on the official service.
