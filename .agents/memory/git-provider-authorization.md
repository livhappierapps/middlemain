---
name: Git provider authorization
description: Git-provider account connections can differ from ordinary connector authorization cards.
---

Do not assume a healthy Git-provider connection means the workspace's Git push credentials are accepted. Git-provider account connections may not support the normal connector reconnect card.

**Why:** GitHub rejected a workspace push while the account connection reported healthy OAuth. The integration attachment response described automatic Git CLI authentication, but both reconnect and regular connection cards rejected that account-connection type.

**How to apply:** Preserve verified local commits and report the push as blocked when Git authentication fails. Stop repeated card attempts if the connection type lacks the required connector configuration. Do not request raw tokens in chat, expose existing credentials, or claim a push succeeded from account health alone.
