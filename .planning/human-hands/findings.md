# Human Hands findings

- Middlemain is an Expo app with a seven-tab Expo Router layout and an existing multi-provider AI context.
- Existing connected AI calls can be billed by the provider; no request may run before clear in-app consent.
- Generic account automation remains out of scope; prefer official OAuth per service and keep users in control of sign-in and verification.
- User explicitly expanded scope to include a secrets vault. Store secret values only in OS-backed SecureStore, require device authentication to read them, keep metadata local, and never attach vault contents to AI prompts.
- Existing local task details should not include secrets. Plans may stay on device.
