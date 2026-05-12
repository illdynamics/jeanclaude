#!/usr/bin/env bash
set -Eeuo pipefail

: "${DEEPSEEK_API_KEY:?DEEPSEEK_API_KEY required}"

token="jeanclaude-claude-ok"
out="$(./bin/jeanclaude run "Return exactly: ${token}" 2>&1 || true)"

if [[ "$out" != *"$token"* ]]; then
  echo "$out" >&2
  echo "[smoke-claude-code:error] expected token not found" >&2
  exit 1
fi

echo "$out"
