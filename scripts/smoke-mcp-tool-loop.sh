#!/usr/bin/env bash
set -Eeuo pipefail

: "${DEEPSEEK_API_KEY:?DEEPSEEK_API_KEY required}"

token="jeanclaude-tool-ok"
out="$(./bin/jeanclaude run "Use the deterministic_echo tool with token '${token}' and return exactly that token." 2>&1 || true)"

echo "$out"

if [[ "$out" != *"$token"* ]]; then
  echo "[smoke-mcp-tool-loop:error] expected token not found" >&2
  exit 1
fi
