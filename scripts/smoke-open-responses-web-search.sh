#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${JEANCLAUDE_WEB_SEARCH:-off}" != "on" ]]; then
  echo "[smoke-web-search] skipped: JEANCLAUDE_WEB_SEARCH is not on"
  exit 0
fi

if [[ -z "${BRAVE_API_KEY:-}" ]]; then
  echo "[smoke-web-search] skipped: BRAVE_API_KEY missing"
  exit 0
fi

out="$(./bin/jeanclaude web-search "DeepSeek Claude Code Anthropic compatibility docs" 2>&1 || true)"

echo "$out"

if ! grep -Eq 'https?://[^ ]+' <<<"$out"; then
  echo "[smoke-web-search:error] no URL found" >&2
  exit 1
fi

if ! grep -qi '"provider"[[:space:]]*:[[:space:]]*"brave"' <<<"$out"; then
  echo "[smoke-web-search:error] provider=brave not found" >&2
  exit 1
fi
