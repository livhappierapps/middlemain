---
name: Git provider authorization
description: Git-provider account connections can differ from ordinary connector authorization cards.
---

Do not assume a healthy Git-provider connection means the workspace's Git push credentials are accepted. Git-provider account connections may not support the normal connector reconnect card, and even an active OAuth connection can fail through the Git CLI.

**Why:** GitHub rejected a workspace push while the account connection reported healthy OAuth. The integration attachment response described automatic Git CLI authentication, but pushes still failed and the reconnect card rejected the connection type.

**How to apply:** Verify authorization with an actual GitHub API or push operation. After authentication fails through both the configured secret and provider connection, preserve local commits and ask the user to refresh authorization through Replit Secrets or the supported OAuth flow. Stop retrying and never request raw tokens in chat.
