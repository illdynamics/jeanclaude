#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${JEANCLAUDE_DOCUMENTS:-off}" != "on" ]]; then
  echo "[smoke-document] skipped: JEANCLAUDE_DOCUMENTS is not on"
  exit 0
fi

if [[ -z "${UNSTRUCTURED_API_KEY:-}" ]]; then
  echo "[smoke-document] skipped: UNSTRUCTURED_API_KEY missing"
  exit 0
fi

fixture_dir="./.jeanclaude/tmp"
mkdir -p "$fixture_dir"
fixture_file="$fixture_dir/doc.txt"
cat > "$fixture_file" <<'DOC'
JeanClaude document smoke fixture.
Requirement keyword: van-damage-kick.
Open Responses must synthesize answers with snippet citations.
DOC

ingest_out="$(./bin/jeanclaude document ingest "$fixture_file" 2>&1 || true)"
echo "$ingest_out"

if ! grep -q 'chunk_count' <<<"$ingest_out"; then
  echo "[smoke-document:error] ingest did not report chunk_count" >&2
  exit 1
fi

query_out="$(./bin/jeanclaude document query "van-damage-kick" 2>&1 || true)"
echo "$query_out"
if ! grep -q 'van-damage-kick' <<<"$query_out"; then
  echo "[smoke-document:error] query did not return expected snippet" >&2
  exit 1
fi

ask_out="$(./bin/jeanclaude document ask "What keyword is required?" 2>&1 || true)"
echo "$ask_out"

if ! grep -Eq 'citations|snippet|van-damage-kick' <<<"$ask_out"; then
  echo "[smoke-document:error] ask output missing citation/snippet evidence" >&2
  exit 1
fi
