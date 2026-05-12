#!/usr/bin/env bash
set -Eeuo pipefail

: "${DEEPSEEK_API_KEY:?DEEPSEEK_API_KEY required}"

token="jeanclaude-thinking-tool-ok"
out="$(JEANCLAUDE_THINKING=enabled ./bin/jeanclaude run "Use deterministic_echo token '${token}' and return exactly that token." 2>&1 || true)"

echo "$out"

if [[ "$out" != *"$token"* ]]; then
  echo "[smoke-thinking-tool-loop:error] expected token not found" >&2
  exit 1
fi
