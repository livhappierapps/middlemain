# Human Hands connector and Replit key-vault status

**Status:** Research only; no application code changed.  
**Scope reviewed:** Human Hands source, local and remote Git branches, Middlemain provider/GitHub code, and Replit’s public Admin API and Secrets documentation.

## Findings at a glance

| Question | Finding |
| --- | --- |
| Does the connector framework exist? | No. Human Hands has task/checklist types and a screen, but no `ProviderConnector`, provider registry, or `Vault` interface. No Human Hands branch was found. |
| Which Human Hands provider plugins are started? | None: not Replit, Grok, GitHub, Render, or another service. Existing AI connections and GitHub repository access are separate features, not Human Hands plugins. |
| Is there encrypted storage? | Yes, for manually saved Human Hands secrets on native phones: Expo SecureStore protects values; AsyncStorage stores labels and metadata. It is device-local, not a synced provider-key vault. |
| Biggest Replit blocker? | Replit’s public API reference documents no project Secrets list/create/revoke endpoints. The available Admin API is account administration, not project-secret management. |

## 1. Framework: current code versus proposed design

There is **no connector framework in code**. `HumanHandsStep` and `HumanHandsTask` in `artifacts/middlemain/utils/humanHands.ts:1-13` model checklist text and completion state only. The Human Hands screen’s prompt says the user performs every action, and forbids the AI from claiming that it created an account or connected a service (`artifacts/middlemain/app/(tabs)/hands.tsx:18-22,317-324,506-508`). It also blocks credential-like text before sending the request to an AI (`hands.tsx:157-180`). This is a human-guided checklist feature, not an account automation framework.

I searched the project and its local/remote branch names for Human Hands provider interfaces and methods such as `ProviderConnector`, `Vault`, `listKeys`, `createKey`, and `revokeKey`; none were found. There is no Human Hands-specific branch in the checked-out repository.

If a future implementation is approved, a minimal contract could be:

```ts
// Specification only — not implemented application code.
interface ProviderConnector {
  authenticate(input: AuthInput): Promise<AuthSession>;
  listKeys(session: AuthSession): Promise<KeyMetadata[]>;
  createKey(session: AuthSession, input: CreateKeyInput): Promise<CreatedKey>;
  revokeKey(session: AuthSession, keyId: string): Promise<void>;
}

interface Vault {
  get(reference: string): Promise<string | null>;
  put(reference: string, secret: string): Promise<void>;
  delete(reference: string): Promise<void>;
}
```

`listKeys` should return metadata only, never secret values; a newly created secret should be handed to the vault once and not written to logs or analytics. `authenticate` must support provider-approved authorization rather than asking users to paste a broad account-admin key into a public app.

## 2. Provider plugins: none started for Human Hands

Middlemain’s `AIProvider` list includes xAI/Grok, OpenAI, Anthropic, Gemini, Custom, and the Middlemain server (`artifacts/middlemain/context/AIContext.tsx:11-22,63-70`). Those are model connections for chat and inference; they do not let Human Hands administer keys or accounts at those providers.

GitHub has separate device authorization and repository-reading code (`artifacts/middlemain/utils/github.ts:61-99,160-196`). It is used by repository debugging, not by Human Hands. No Human Hands provider adapter is registered there. Likewise, no Human Hands Replit or Render adapter was found. A Render deployment configuration elsewhere does not constitute a Render connector. In short: **Replit, Grok, GitHub, Render, and other Human Hands plugins are all unstarted.**

## 3. Existing Human Hands secret storage

`HumanHandsVault` stores secret values with `expo-secure-store`, requires device authentication when saving and retrieving, and stores only the label/service/type metadata in AsyncStorage (`artifacts/middlemain/components/HumanHandsVault.tsx:9-28,145-178,200-219,228-261`). The vault is disabled on web (`:145-146,180-185,231-233`). Expo SecureStore uses the platform’s protected storage—Android Keystore-backed encrypted preferences and iOS Keychain—rather than a custom Middlemain encryption scheme ([Expo SecureStore SDK 54 documentation](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/)).

This is a **local phone vault**, not a remote service-credential manager: values do not sync between devices or automatically enter websites, and the UI says they are not sent to AI (`HumanHandsVault.tsx:219,270-279`). Retrieving a value copies it to the system clipboard, which can expose it to other apps (`:228-248`). The separate generic credential store is also device-based and names only AI, AIs & Ears, Memory MCP, and Council credentials (`artifacts/middlemain/utils/secureCredentialStore.ts:1-3,38-88`); it is not a provider plugin layer.

### App Store Connect `.p8` keys

Do not use the phone vault for the private key used to sign App Store Connect requests. Human Hands can draft the steps, but it must not collect or upload the key. For this app's build pipeline, the private key, key ID, and issuer ID belong in the build project's secret manager as `ASC_PRIVATE_KEY`, `ASC_KEY_ID`, and `ASC_ISSUER_ID`; the build scripts create a permission-restricted temporary `.p8` file and remove it after use (`artifacts/middlemain/scripts/configure-ios-signing.mjs:23-53`, `artifacts/middlemain/scripts/submit-ios.sh:23-53`).

Apple says the private key download is available only once and Apple does not retain a copy. If the local download is missing, first check whether a valid secure copy is already in the build secret manager; do not rotate a working key unnecessarily. If a replacement is needed, create a new Team API key in App Store Connect and store it directly in the build secret manager. Revoke the old key only when it is confirmed compromised or no longer needed. See Apple's [key creation guide](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api) and [revocation guide](https://developer.apple.com/documentation/appstoreconnectapi/revoking-api-keys).

## 4. Replit key-management blocker and actual endpoints

The official [Replit Admin API reference](https://api.replit.com/docs) describes an Enterprise account-scoped API at `https://api.replit.com/v1`. Its documented resources include workspaces, projects, deployments, members, usage, budgets, and approval requests. Examples include `GET /workspaces`, `GET /workspaces/{workspaceId}`, and `GET /projects`. Authentication uses an account API key; the reference describes Enterprise account administration.

**The public reference does not document any endpoint to list, create, or revoke project Secrets.** The official [Secrets guide](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets) describes adding, editing, and deleting secrets through the Project Editor’s Secrets tool. Therefore, there are no verified Replit key-management endpoint URLs to list for the proposed plugin. Do not invent paths or depend on undocumented editor internals. The existing Admin API endpoints above are real, but they do not manage project secrets.

This is the single biggest blocker: Human Hands cannot implement the requested `listKeys`/`createKey`/`revokeKey` operations for Replit through a documented public API. Even if Replit workspace/project listing is available to an Enterprise administrator, it does not grant a supported way to manage a project’s secret values. An account Admin API key would also be inappropriate to embed in a consumer app. Until Replit publishes a supported secret-management API or an approved delegated integration, the honest Replit path is to guide the user to the Secrets tool and let them perform the change themselves.

## Sources and review boundary

- Middlemain source citations above are relative to the repository root and include line numbers.
- Replit official references: [Admin API](https://docs.replit.com/teams/admin-api), [API reference](https://api.replit.com/docs), and [Secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets).
- Expo official reference: [SecureStore for SDK 54](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/).
- This report specifies a possible interface but does not implement one, access any credentials, or change app behavior.
