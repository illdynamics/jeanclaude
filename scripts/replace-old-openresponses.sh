#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'HELP'
Usage:
  ./scripts/replace-old-openresponses.sh --check
  ./scripts/replace-old-openresponses.sh --report

Checks JeanClaude-owned files for forbidden legacy OpenResponses references.
Allowed exceptions:
- files under ./claude-code/
- files under ./open-responses/
- source bundle analysis docs (`jeanclaude-blueprint.md`, `jeanclaude-deep-research.md`)
- lines containing "legacy removed" (case-insensitive)
HELP
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "$repo_root"

mode="check"
case "${1:-}" in
  --check) mode="check" ;;
  --report) mode="report" ;;
  -h|--help) usage; exit 0 ;;
  "") ;;
  *)
    usage
    exit 1
    ;;
esac

raw_hits="$(
  grep -RInE 'masaicai|open-responses:latest|\bopenresponses\b|\bOpenResponses\b|\bOPENRESPONSES\b|\b6644\b' . \
    --exclude-dir=.git \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    --exclude-dir=build \
    --exclude-dir=claude-code \
    --exclude-dir=open-responses \
    --exclude=jeanclaude-blueprint.md \
    --exclude=jeanclaude-deep-research.md \
    --exclude=scripts/replace-old-openresponses.sh \
    --exclude=.env \
    --exclude=.env.example || true
)"

filtered=""
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  if grep -Eiq 'legacy removed' <<<"$line"; then
    continue
  fi
  if grep -Eq 'replace-old-openresponses\.sh' <<<"$line"; then
    continue
  fi
  filtered+="$line"
  filtered+=$'\n'
done <<<"$raw_hits"

if [[ "$mode" == "report" ]]; then
  if [[ -z "$filtered" ]]; then
    echo "[legacy-check] no forbidden legacy references found"
    exit 0
  fi
  printf '%s' "$filtered"
  exit 0
fi

if [[ -n "$filtered" ]]; then
  echo "[legacy-check:error] forbidden legacy references detected:" >&2
  printf '%s' "$filtered" >&2
  exit 1
fi

echo "[legacy-check] pass"
