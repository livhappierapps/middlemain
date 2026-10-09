---
name: Private developer edition
description: Owner-requested release ordering, Crash Pad assistant, Council participation, and approval-controlled developer privileges.
---

Finish the public release first: the owner wants a current public-release APK to test before shipping. Only after the public release is done should work begin on the owner-only special developer edition.

**Why:** The user explicitly requested this ordering and wants the consumer app shipped before adding private developer features.

**How to apply:** Keep developer-edition scope out of the public release and require owner test sign-off before store submission.

The private edition should include a tab called “Dev’s Crash Pad,” include Dev in every Council session, and give Dev and Leo extra developer permissions with a simple approval toast for app control. The owner wants coding assistance, agent coaching, and EAS build help.

**Why:** The user requested a private development workspace with these assistant roles and broader capabilities.

**How to apply:** Treat this as a provider-backed assistant role, not literal migration of Replit Agent or its privileges. Default Council inclusion must not silently trigger paid responses. Approval prompts must show the exact action and any cost, fail closed, and preserve owner-only authorization.
