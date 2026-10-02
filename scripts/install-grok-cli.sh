#!/usr/bin/env bash
# Install or refresh the official Grok Build CLI (grok).
# https://x.ai/cli  |  npm: @xai-official/grok
# Does not need sudo or Node. Writes under $HOME.
set -euo pipefail

echo "Installing Grok Build from https://x.ai/cli/install.sh"
curl -fsSL https://x.ai/cli/install.sh | bash

echo
echo "Open a new shell, then:"
echo "  grok --version"
echo "  cd $(pwd) && grok"
echo
echo "Headless / Codespaces (no browser):"
echo "  grok login --device-auth"
echo "  # or export XAI_API_KEY from console.x.ai"
echo "Update later with: grok update"
