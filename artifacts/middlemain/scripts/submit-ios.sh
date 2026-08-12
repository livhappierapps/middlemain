#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# submit-ios.sh — Submit a completed iOS build to TestFlight via EAS
#
# Reads App Store Connect credentials from Replit Secrets:
#   ASC_KEY_ID       — App Store Connect API Key ID
#   ASC_ISSUER_ID    — App Store Connect API Issuer ID
#   ASC_PRIVATE_KEY  — Full content of the .p8 private key file
#
# Usage:
#   ./scripts/submit-ios.sh                          # submits latest build
#   ./scripts/submit-ios.sh --path build.ipa         # submits specific file
# ─────────────────────────────────────────────────────────────────────────────
set -e

if [[ -z "$ASC_KEY_ID" || -z "$ASC_ISSUER_ID" || -z "$ASC_PRIVATE_KEY" ]]; then
  echo "❌ Missing one or more App Store Connect secrets."
  echo "   Required: ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY"
  exit 1
fi

KEY_FILE="$(mktemp /tmp/AuthKey_XXXXXX.p8)"
echo "$ASC_PRIVATE_KEY" > "$KEY_FILE"
trap 'rm -f "$KEY_FILE"' EXIT

echo "🔑 ASC key written to temp file"
echo "🚀 Starting EAS submit..."

npx eas submit \
  --platform ios \
  --non-interactive \
  --asc-api-key-path "$KEY_FILE" \
  --asc-api-key-id "$ASC_KEY_ID" \
  --asc-api-key-issuer-id "$ASC_ISSUER_ID" \
  "$@"

echo "✅ Submit complete"
