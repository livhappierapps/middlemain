# Middlemain: non-secret integration handoff for Sable

Prepared from the current workspace source on October 12, 2026. This document contains no token, API-key, client-ID value, session URL, or credential.

## Source location

Repository: https://github.com/livhappierapps/middlemain

The current workspace is the source of this review. Do not assume the GitHub checkout or an installed APK already contains every current workspace change.

## 1. GitHub repository access

Sources:
- `artifacts/middlemain/utils/github.ts`
- `artifacts/middlemain/components/RepositoryPicker.tsx`
- `docs/repository-debugging.md`

Private repository access uses a GitHub App's device authorization flow. The public build-time variable is named `EXPO_PUBLIC_GITHUB_APP_CLIENT_ID`; its value is deliberately omitted here. No app private key, client secret, or shared owner GitHub token is needed in this mobile flow.

Setup documentation requires Repository Contents read-only permissions and installation on only user-selected repositories. These are setup requirements, not proof of the permissions currently enabled in the GitHub App dashboard.

The customer access token lives in component memory, not persistent storage. The app stops using it after at most eight hours. Disconnect GitHub forgets the local token and resets the repository picker; it does not revoke authorization at GitHub. Restarting the app also loses the local token.

For provider-side revocation, review the Middlemain GitHub App authorization under GitHub Settings → Applications and revoke it. Separately, review the app installation's repository access and remove selected repositories or uninstall the app as appropriate. Organization installations may require an organization administrator.

Native private-repository sign-in still needs a real-device test. The browser preview cannot perform this device flow. Source previously copied into the Debug editor is separate from the repository authorization.

## 2. Memory Machine / Memory Bridge

Sources:
- `artifacts/middlemain/context/MCPContext.tsx`
- `artifacts/middlemain/components/MemoryMachineCard.tsx`

This is a user-configured remote MCP service, not a fixed memory provider identified by the app. The user supplies the server URL and bearer token.

The client makes HTTP POST JSON-RPC requests to that URL: `tools/list` discovers available tools and `tools/call` invokes them. The server's advertised tools and token permissions determine what can be read or changed.

The URL and token are persisted together in React Native AsyncStorage. This is not SecureStore/keychain storage.

Disconnect only clears connection status, error state, and the displayed tool list. It does not delete the saved URL/token or revoke the remote token. The tool-call function also does not itself enforce connected status. Therefore, do not describe Disconnect as a security revocation boundary.

To remove the local saved credential, disconnect and clear the token field. Provider-side revocation must happen at the service that issued the token. The source alone cannot establish that service's dashboard or exact revocation procedure. Disconnecting or clearing the token does not delete server-side memories.

## 3. AIs & Ears camera / microphone / screen bridge

Sources:
- `artifacts/middlemain/context/AisAndEarsContext.tsx`
- `artifacts/middlemain/components/AisAndEarsBridgeCard.tsx`
- `artifacts/middlemain/app/(tabs)/terminal.tsx`
- `artifacts/middlemain/app.json`

The user supplies an external bridge app URL, bridge API key, and session duration. The URL/key/configuration are persisted in AsyncStorage, not SecureStore/keychain storage.

Connect sends a POST request to the configured service's `/api/bridge/session`. The service returns a session identifier, WebSocket address, vision address, and expiry. The default requested duration is 30 minutes.

Hearing sends microphone recording chunks through the session WebSocket. Camera sends captured images to the session vision endpoint. Screen sends images of a referenced in-app view using `react-native-view-shot`; this is not proof of whole-phone or other-app screen capture. Camera and screen capture intervals are approximately three seconds while enabled.

Camera, hearing, screen, and control have separate user toggles. Camera/microphone use device permission prompts. Disconnect stops local streaming, closes the WebSocket, clears the local session, and turns off the local toggles. The inspected client does not send a server-side session-revocation request; it receives a server-reported expiry.

For revocation: turn off the toggles and disconnect locally; remove camera/microphone access in the phone's app permission settings when desired; clear the saved bridge key field. Revoke or rotate the API key, and terminate remote sessions if supported, at the issuing bridge service. Its exact admin controls cannot be established from this mobile client's source.

## Security caveat requiring verification

`docs/security-status.md` identifies a previously exposed AIs & Ears service key as a release gate requiring rotation/revocation at its issuer. No value is included here. Removing a value from current source does not invalidate old copies, Git history, or old APKs. Do not claim that rotation or remote revocation has occurred without issuer-side confirmation.

## Requested review

Please use the source paths above to document actual services, permissions, local disconnect behavior, and provider-side revocation separately. Verify the GitHub App's live permissions and the identity/admin controls of the user-configured memory and bridge services before giving exact provider-specific instructions. Do not request or include credentials in the report.
