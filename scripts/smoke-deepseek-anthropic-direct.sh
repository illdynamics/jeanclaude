#!/usr/bin/env bash
set -Eeuo pipefail

: "${DEEPSEEK_API_KEY:?DEEPSEEK_API_KEY required}"

model="${JEANCLAUDE_MODEL:-deepseek-v4-flash}"
token="jeanclaude-direct-ok"
body="{\"model\":\"${model}\",\"max_tokens\":64,\"messages\":[{\"role\":\"user\",\"content\":\"Return exactly: ${token}\"}]}"

response="$(curl -fsS https://api.deepseek.com/anthropic/v1/messages \
  -H 'Content-Type: application/json' \
  -H "x-api-key: ${DEEPSEEK_API_KEY}" \
  -H 'anthropic-version: 2023-06-01' \
  -d "$body")"

if command -v jq >/dev/null 2>&1; then
  text="$(jq -r '[.content[]? | select(.type=="text") | .text] | join("\n")' <<<"$response")"
else
  text="$response"
fi

if [[ "$text" != *"$token"* ]]; then
  echo "$response" >&2
  echo "[smoke-direct:error] expected token not found" >&2
  exit 1
fi

echo "$text"
