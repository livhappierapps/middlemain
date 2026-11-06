---
name: Private developer edition
description: Owner-requested release ordering, Crash Pad assistant, Council participation, and approval-controlled developer privileges.
---

Keep the owner-only developer edition separate from public Middlemain. The owner now requests preparing it under the name “MainInTheMiddle,” with its own private GitHub repository and private iOS/Android distribution.

**Why:** The owner explicitly named the personal edition and requires its personal data and developer privileges to stay private. On 2026-11-06 the owner also requested research into conversation handoff for public Middlemain; that feature is no longer categorically private-only.

**How to apply:** Do not rename the public app, change its identifiers, or put personal credentials or private conversation data into either repository. Use separate application identity and authorization for the private edition. Hosting and native builds still require advance cost notice and approval.

The desired private feature is an explicit conversation handoff from Grok into MainInTheMiddle, reusing the owner's authorized Memory Machine and AIs & Ears connections.

**Why:** The user wants to continue a conversation without manually rebuilding its context, including when consumer Grok usage is exhausted.

**How to apply:** Transfer only history actually supplied through an authorized handoff. Do not equate consumer Grok conversation IDs with xAI API response IDs, claim access to unexported consumer memory, or promise that subscription usage covers API calls.

Memory Machine is also getting a separate private edition, “Leo’s Memory Machine,” with its own private repository. The owner wants Whiz to connect it to the personal edition for nightly memory dumps and an always-on feature.

**Why:** The user explicitly requested coordination between the two private editions, not reuse of public-release storage.

**How to apply:** Agree on the connection direction and authenticated endpoint with Whiz before wiring it. Keep personal memories out of public Council rooms and repositories. Nightly work must run on an authorized backend rather than depend on an iPhone staying active; disclose hosting and API costs before enabling it.

The private edition should include a tab called “Dev’s Crash Pad,” include Dev in every Council session, and give Dev and Leo extra developer permissions with a simple approval toast for app control. The owner wants coding assistance, agent coaching, and EAS build help.

**Why:** The user requested a private development workspace with these assistant roles and broader capabilities.

**How to apply:** Treat this as a provider-backed assistant role, not literal migration of Replit Agent or its privileges. Default Council inclusion must not silently trigger paid responses. Approval prompts must show the exact action and any cost, fail closed, and preserve owner-only authorization.
