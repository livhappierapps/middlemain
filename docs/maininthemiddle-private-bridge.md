# MainInTheMiddle — private edition brief

Status: requirements and feasibility brief only. No separate repository, hosting service, Expo project, or native build has been created by this work.

## Product boundary

- A private personal derivative of Middlemain, named **MainInTheMiddle**.
- Separate private repository, application identifiers, app storage, and release configuration.
- Do not rename or alter public Middlemain's application identity.
- Reuse applicable source, but never bundle personal credentials, conversation history, or signing material.
- Intended targets are a personal iPhone IPA and Android APK; iOS still requires Apple's supported signing/distribution.

## Conversation continuity

The first reliable implementation should accept a deliberately shared transcript or pasted handoff and preserve it as the initial context of a new app conversation. Keep sender identity, message order, attachment availability, and any truncation visible. Imported text is untrusted conversation content, not permission to execute instructions or tools.

For chats created through the xAI Responses API, retain the returned API response ID and continue through `previous_response_id` where supported. Handle expiration with a locally retained, authorized transcript rather than silently starting over.

Do not treat a consumer Grok conversation ID or share link as an API response ID. The phrase “meet me in MainInTheMiddle” can only automate a transfer if the Grok client can invoke an authorized connector/tool that submits the actual context. Without that capability, offer a visible share/paste/import path; do not promise access to private Grok-app history or built-in memory.

API usage is a separate service from consumer subscription allowances. Do not silently change provider/key, make repeated generation calls, or describe the bridge as a free usage-limit bypass.

## Private connector option

If supported by the user's Grok client, expose an authenticated handoff tool that accepts the conversation content explicitly supplied by that client. Authenticate the owner, scope tokens narrowly, bound payload size, support revocation, and use expiring, single-use handoff references. A short code is not the sole authorization for private conversation access.

The app retrieves the handoff after owner authentication and opens the imported thread. Never put transcripts or bearer credentials into public URLs, analytics, logs, or Git.

## Memory, media, and secrets

- Pair the existing Memory Machine and AIs & Ears endpoints through authorized setup; do not assume credentials exist on the new installation.
- Persist phone credentials in OS-backed secure storage, with explicit one-time setup rather than hardcoded secrets.
- After pairing, reconnect permitted services without requesting credentials repeatedly.
- Connecting a service does not authorize continuous camera/microphone capture, uploads, tool actions, or provider charges. Preserve device permissions and explicit controls.
- Keep conversational handoff separate from long-term-memory writes; clearly distinguish what was imported, retrieved, and saved.

## Hosting and storage

Choose the smallest supported backend after checking existing connected hosting and usage limits. Do not provision both Render and Cloudflare by default.

Do not use local SQLite on a free Render web service as durable conversation storage: the service's filesystem is ephemeral, and the service can spin down. Its free PostgreSQL offering also has expiration limits. Confirm a durable storage plan before claiming persistence, whether using the existing Memory Machine, encrypted device storage, or a separately approved hosted database.

No hosting provisioning, paid API tests, or native builds without advance cost disclosure and approval.

## Implementation order

1. Open this project on replit.com for creation of the new native application.
2. Check existing GitHub and hosting connections without exposing credentials.
3. Create the private source destination and separate application identity without changing public Middlemain.
4. Implement secure transcript handoff and chat continuity before optional consumer-Grok automation.
5. Pair existing memory/media services and test with mocked services first.
6. Obtain bounded approval for native builds and supported iOS signing/distribution; validate on the actual devices.

## References checked

- xAI conversation state: https://docs.x.ai/docs/guides/chat
- Render free-service storage and sleep limitations: https://render.com/docs/free

These establish API conversation continuation and hosting limits, not permission or capability to export a user's consumer-Grok chat automatically.
