#!/bin/bash
pnpm install --frozen-lockfile
# DB schema push — best-effort, skipped if it exceeds time budget
timeout 12 pnpm --filter db push 2>/dev/null || true
