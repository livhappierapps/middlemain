# Middlemain user guide

This is the canonical guide for the native app, its offline help, and its AI help context. Update this file, then run `pnpm run guide:sync`. It describes implemented controls, not a promise that an external provider, model, payment system, or device permission is configured.

## Getting started and Home dashboard

1. Open **Connect** and add your own AI provider connection.
2. Select a provider, a model identifier supported by your account, and your API key. Save it and optionally use **Test**.
3. Open **Bridge** for individual chat, **Council** for multiple participants, or **Debug** for source checks.
4. Open **Main / Guide** for offline help or an explicitly selected paid AI answer.

Home shows saved connection counts and activity. Quick actions open Bridge, Connect, and Settings. A server being configured does not mean you are authorized to use the owner's credits. Owner Grok requires an executive key on the trusted owner's device; public users should use their own provider keys.

Tip: start with one connection and a short prompt. A successful connection test is a real provider request and can incur a small charge. A model name displayed by the app may not be enabled for your provider account.

## Connect: add, edit, select, test, and delete AI providers

Tap the plus button, enter a descriptive name, choose Grok/xAI, OpenAI, Anthropic, Gemini, or a custom OpenAI-compatible service, then fill in the key and model. A custom provider needs the API base URL expected by that service. Save, choose the active connection, and use its Test control if needed. Edit updates that connection; Delete removes the local connection, not the provider account or its remote key.

Use a vision-capable model for images. A Gemini OpenAI-compatible endpoint is suitable for normal chat; live Google Search grounding uses Gemini's native API in Guide. The server-provider entry is owner-only and needs Settings → Middlemain Executive API authorization.

Tips: use distinct names such as “Fast daily model” and “Code review model.” Copy exact model identifiers from your provider. A 401/403 usually means missing or rejected authorization; a 404 can mean the wrong model or URL; a 429 means a provider rate/quota limit. Do not retry rapidly. Removing a local key does not revoke it remotely.

## Bridge Terminal: messages, skills, images, copy, and clear

Choose an AI connection and a task/skill, type a message, and send. Skills change the assistant's instructions: general help, debugging, code review, explanation, refactoring, test writing, visual review, and screenshot debugging. Replies stream into the terminal. Use the image attachment control to pick a screenshot/photo for a compatible vision model. Image permission is required.

Use Copy Last to copy the latest response. Clear Terminal clears the terminal's displayed conversation; it does not erase the provider's records. Voice/camera/screen/control buttons depend on the separate AIs & Ears session, not just an AI connection.

Tips: include the error, expected result, and the smallest relevant code sample. Redact credentials from images and code. Paid generation requests are not automatically retried; sending again can create another charge. A stalled stream reports a timeout instead of waiting indefinitely. The terminal is an AI interface, not a local operating-system shell.

## AIs & Ears: session, microphone, camera, screen, and control

In Connect, open the AIs & Ears card, enter your bridge service URL, your own bridge API key, and the session duration. Connect creates the remote session; Disconnect stops local streaming and closes its connection. No shared bridge credential is bundled into the app.

After connecting, Bridge's microphone/hearing, camera/vision, screen-sharing, and control controls enable supported remote capabilities. Grant only the permissions you intend to use. Device/OS support differs; native screen capture is not equivalent to a browser tab capture. Stop capture when you finish.

Camera testing: tap **Cam** to open a front-camera preview. Opening the preview does not upload a frame. Tap **Send one frame**, then confirm the possible bridge/provider charge. A local thumbnail and status distinguish capture, upload, acceptance, missing AI description, and failure. An accepted request does not prove that the AI understood the image. No automatic upload retry is made.

**Start live** is a separate, explicitly confirmed action. It sends the next frame three seconds after the preceding request finishes, never in parallel. Stop live, turn Cam off, leave Bridge, or background the app to stop further camera requests. Errors or an accepted frame without an AI description pause live sharing. Cancelling cannot recall a frame already received by the bridge. Thumbnails stay only in memory; the temporary camera file is deleted on a best-effort basis.

Tips: use HTTPS for remote services and avoid displaying password managers, private notifications, or financial details while sharing. Bridge availability and any charges belong to the separate bridge service. If an old shared key was exposed, its owner must rotate it at that service; deleting it locally is not revocation.

## Memory Bridge and advertised MCP tools

In Connect, enter your Memory Bridge service URL and token, then Connect. The app discovers the service's advertised tools. Tool help describes the remote tool's name, purpose, and input schema. Supply the fields it requests; Disconnect closes the connection. The app cannot guarantee that every remote tool exists or that its description is trustworthy.

Tool-enabled Bridge chat can request available tools when authorized. Review what a tool will send or change. Memory search, save, and recent-memory features depend on the connected service and permissions; they are not a guarantee of unlimited or permanent memory.

Tips: treat tool output as data, not permission to expose secrets or make purchases. Do not paste owner executive keys into arbitrary MCP URLs. If memory authorization fails, verify the issuing service's token; unavailable memory must not be described as a successful save.

## Council: participants, roles, conversations, auto sessions, and history

Add participants from saved connections or create a manual participant with its own provider credentials. Choose a role/preset or write specific instructions. Select who should respond; send a goal/message to start the discussion. Multiple participants generate multiple provider requests.

Auto Session runs repeated multi-participant rounds for the configured goal and limits. Stop ends future rounds; an already-sent provider request may still be billed. Mention a participant with @name for directed discussion. Long-press a message for the actions shown, such as quoting/directing a response. Remove removes a participant locally. Clear/reset starts a fresh local discussion. History controls limit how much previous discussion is sent or retained.

Image and audio controls require their device permissions and supported models. Save/export/copy controls preserve the selected conversation in the location or sharing destination you choose; review the contents before sharing. Executive/assistant additions require their configured services.

Tips: start with two participants and short turn limits. Give different roles to avoid repeated answers. Auto sessions and lengthy history can substantially increase token cost. Council discussion is advice, not permission for an AI to execute a deployment or financial action.

## Council Go Live, host authorization, share links, remote guests, and room-scoped MCP

Set a working HTTPS API Server URL in Settings. Go Live creates a shared room. Share its link with intended guests; the Council Room web page lets guests join/read the room. Stop Room ends the local live connection. Anyone with the share link can access the shared room; it is not account-authenticated private storage.

Native host AI/system publications and stream updates require a separate private host key. It stays in native secure storage and is never put in the share link or MCP key. Browser host keys are session-only. If an older saved room lacks a host key, create a new live room to publish again; its previous link/history is not deleted. Publishing remains pinned to the room's original server if you edit Settings.

An external agent using `POST /api/council/rooms/{roomId}/agent` must include `Authorization: Bearer {roomMcpKey}` on every request. Send `{name, message}` to register; reuse its returned `agentKey` with the same name for later messages. Revoking the room MCP key also stops these external agents. MCP grants limited AI posting/history access, not native host control.

Guest questions can trigger your selected Council AIs and spend your provider credits. Share only with intended people and stop the room to disconnect the app. Guest chat has bounded message size and frequency, but unlisted links are not verified identities or private accounts.

The room's MCP connector has a separate high-entropy token. It permits only that room's history, posting a Council message, and an isolated source check. Copy/configure the connector as directed by the app. Rotate invalidates the previous MCP token; revoke removes its authorization. Neither action revokes an already-shared room link.

Tips: do not use a shared live room for secrets. Guest display names are not verified identities. Room persistence depends on the server's storage/deployment, not on the native app. Errors are surfaced instead of silently claiming a failed update saved. Capacity is bounded; a full server needs operator attention. Account-authenticated private rooms and guest moderation are not features to assume.

## Webhooks and Executive API

Configure the Council webhook URL to forward digests to your chosen service and use Test to check it. Interval/end-of-session digests can contain participant messages and names. The destination receives that data. The owner's `/api/executive/webhook/council` and `/test` endpoints require executive authorization; a generic third-party webhook may have different requirements.

Settings → Middlemain Executive API stores the owner's authorization key on the device. The owner's API exposes status, chat, memory search/save/recent, xAI-key updates, and webhook inbox read/clear. The executive key is not an xAI provider key. Updating the server xAI key changes its in-memory key until server restart; configure the server secret for durable configuration.

Tips: never put the owner executive key in a public native build or GitHub file. Use only a trusted HTTPS API URL. Do not send it to another developer's server. Public app users do not need this key: use personal provider connections.

## Debug: GitHub import, private sign-in, repository preflight, AI Analyze, and Dry Run

Paste source, use Paste, or enter an HTTPS GitHub repository-root URL and optional branch. Load the repository, choose a supported file, and import it. The importer pins that selection to a commit and skips obvious credential/generated/oversized files. This filter is not a complete secret scan.

Private repository sign-in requires a registered, installed GitHub App with read-only Contents permission and the public build-time client ID. Until configured, the app reports that sign-in is unavailable. Native device-flow authorization is session-only, expires within at most eight hours, and is forgotten on disconnect/restart. Revoke access at GitHub to revoke it remotely. The browser preview cannot complete GitHub's native device-flow flow.

AI Analyze requires consent and your own provider connection. It sends the selected code once, limits input/output, and may incur a provider charge. Stop/timeout does not refund an already-sent request. Dry Run checks JSON locally or submits a single JS/TS source file to the isolated compiler. It does not execute that code, follow imports/reference paths, install packages, or prove an EAS/native build will pass.

After Load repo files, use **Repository preflight — no AI / EAS calls** to inspect a bounded snapshot from the displayed branch and full commit. It uploads up to 60 files / 220 KB of source to Middlemain's API; your GitHub token is not sent there. Review private source for embedded secrets first. Downloads use at most three concurrent GitHub requests, and the client stops after 60 seconds.

The report separates syntax/types, dependencies/imports, configuration concerns, and native checks not run. Supplied local imports can resolve; external libraries/typings are not installed, so declared dependencies may be inconclusive. Server checks have two-worker concurrency, bounded memory, a 15-second deadline and cleanup on cancellation. Source is treated as data in a virtual filesystem. Repository scripts, hooks, compiler plugins and external config inheritance are not executed. Partial coverage and timeout/failure are never a complete pass.

Tips: use repository preflight or Dry Run first, then send only the remaining problem to AI. Check the actual repository with its own trusted tests, dependencies, and compiler before a paid cloud build. No source-check result guarantees EAS/native compilation, signing, permissions, lockfile consistency or store readiness.

## Main / Guide: offline answers, AI questions, and Google Search

Built-in Help answers locally from this guide. It works offline, sends no question, and incurs no AI/search charge. Ask AI uses the selected connection and sends your question/history plus relevant guide sections. The guide is packaged in the app; it is context, not model training and not a guarantee of every possible answer.

Choose an existing connection or a supported provider connection. Google Search grounding is optional and requires Gemini; other providers cannot silently provide that mode. Search results show provider-returned citations when available. Rates shown in the app are informational estimates: verify the provider's linked current pricing before relying on them.

Tips: use offline help for app controls. Turn search on only when current external facts are needed. Ask one focused question, keep history short, and verify citations. AI answers can be wrong even when equipped with documentation.

## Human Hands: setup checklists and secrets vault

Enter a service, an optional HTTPS website, and the setup goal. Select one of your existing AI connections and approve the cost/privacy notice before asking for steps. The service, website, and goal are sent as written to that provider, which may bill you. The app blocks some obvious credential formats, but this is not a complete secret detector—review the text yourself and never enter passwords, API keys, recovery codes, one-time codes, payment details, or private keys. Requests are not automatically retried.

The AI can draft a checklist, but it cannot create accounts or sign in for you. Open the official site from the saved plan and complete sign-in, email/device verification, payment, legal consent, and permission grants yourself. Verify each suggestion at the service; requirements can change. Setup plans and checklist progress are stored locally on the device.

The Secrets Vault stores secret values in iOS/Android secure storage and requires device authentication when saving or copying. Labels and service names are stored separately as local app data. The vault is not read by AI, does not autofill websites, and does not sync or back up. Copying places the value on the system clipboard, where other apps may be able to read it. If device authentication changes, a saved value may become inaccessible; keep the service's own recovery options.

The vault is separate from Connect and other integrations. Existing AI, bridge, GitHub, memory, and webhook credentials are not migrated into the vault or automatically read from it. The browser preview cannot access the phone's secure storage.

Tips: save only secrets you need, copy only when ready to paste, then clear the clipboard yourself if appropriate. Do not use this vault as the only copy of a recovery credential.

## Settings, themes, purchases, legal information, and troubleshooting

Settings changes the theme/appearance and API Server URL, exposes Executive API setup and webhook settings, and provides legal/privacy information. Theme changes affect local appearance, not provider behavior. Use the theme controls to choose a readable contrast for your device.

Store purchases and Restore are not connected to StoreKit/RevenueCat. They must not claim a verified subscription or a successful charge. Provider token usage is billed separately by the selected provider even if app purchases are unavailable. Do not assume a Pro label grants free third-party AI usage.

For network errors, check internet access, the correct HTTPS server URL, model name, provider quota, and service status. For permission errors, open the device's app permissions. For a rejected owner key, verify the executive key on that trusted device rather than sharing it. Copy a minimal error description for a bug report, excluding keys and private source. Restarting the app can reset transient connections, but does not replace tests or revoke remote credentials.

Tips: protect your device and backups. Connection information is stored locally; local storage is not a promise of encrypted storage or protection from a compromised device/browser. Sending prompts, screenshots, webhooks, or tools sends data to their selected destinations. Deleting local data does not delete remote records.

## 12. Privacy and data handling

Middlemain does handle user information. API keys, connection settings, preferences, skills, and chat history are stored locally. Prompts, selected code, and images go to the chosen AI provider; server-proxy mode also passes content through the publisher's backend. Credentials go to their authorized destinations.

Live Council rooms store room names, participant display names, timestamps, and messages on the backend. Shared-link visitors can see the discussion. Stopping a session does not automatically delete stored history. Optional camera/audio/screen bridge features send enabled content to the configured bridge service. GitHub, memory tools, and webhooks receive the data selected for those connections. Bug reports can contain report text and app/version details; hosting services process network/request metadata.

Uninstalling, clearing local history, and disconnecting do not erase copies held by servers or third parties. Do not claim no data is collected, that all local keys use an encrypted vault, or that every destination deletes data automatically. The publisher's full policy is at https://livhappierapps.com/apps/middlemain/privacypolicy; a technical summary is also available in the app's legal screen. Website policy publication and Apple privacy disclosures require publisher review.
