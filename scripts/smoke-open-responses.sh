#!/usr/bin/env bash
set -Eeuo pipefail

: "${RESPONSE_API_KEY:?RESPONSE_API_KEY required}"

docker compose up -d open-responses open-responses-integrations open-responses-db open-responses-migration open-responses-vectorizer-worker >/dev/null

payload_file="./infra/open-responses/smoke/simple-response-request.json"
url="${JEANCLAUDE_OPEN_RESPONSES_PUBLIC_URL:-http://127.0.0.1:8080}/v1/responses"
response="$(curl -fsS "$url" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${RESPONSE_API_KEY}" \
  -d "$(cat "$payload_file")" || true)"

if [[ -z "$response" ]]; then
  response="$(curl -fsS "$url" \
    -H 'Content-Type: application/json' \
    -H "Authorization: ${RESPONSE_API_KEY}" \
    -d "$(cat "$payload_file")" || true)"
fi

if [[ -z "$response" ]]; then
  echo "[smoke-open-responses:error] empty response" >&2
  exit 1
fi

if command -v jq >/dev/null 2>&1; then
  text="$(jq -r '[.output_text?, (.output[]? | .content[]? | .text?)] | flatten | map(select(type=="string" and length>0)) | join("\n")' <<<"$response")"
else
  text="$response"
fi

if [[ "$text" != *"jeanclaude-open-responses-ok"* ]]; then
  echo "$response" >&2
  echo "[smoke-open-responses:error] expected token not found" >&2
  exit 1
fi

echo "$text"
