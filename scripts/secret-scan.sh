#!/usr/bin/env bash
set -Eeuo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
failures=0
note() { printf '[secret-scan] %s\n' "$*"; }
fail() { printf '[secret-scan:error] %s\n' "$*" >&2; failures=$((failures + 1)); }

EX=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=claude-code --exclude-dir=open-responses --exclude-dir=.codeseeq --exclude=.env --exclude=.env.example --exclude='*.zip' --exclude='*.tar.gz')

PATTERNS=('sk-[A-Za-z0-9]{10,}' 'sk-ant-[A-Za-z0-9]{10,}' 'sk-proj-[A-Za-z0-9_-]{10,}' 'Bearer[[:space:]]+sk-[A-Za-z0-9_-]{10,}' 'x-api-key:[[:space:]]*sk-[A-Za-z0-9_-]{10,}' 'eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}')

SAFE=('sk-abcdefghijk' 'sk-your-deepseek-key' 'sk-your-actual-key-here' 'sk-prod-deepseek-key' 'sk-your-deepseek-api-key' 'sk-abcd1234567890' 'test-fake-key-12345' 'sk-test-default-key' 'sk-test-mapping-key' 'sk-test-key' 'sk-test-jeanclaude-key' 'sk-real-key' 'sk-abc123')

note "running secret-pattern scan"
all=""
for pat in "${PATTERNS[@]}"; do
  hits=$(grep -RInE "${EX[@]}" "$pat" . 2>/dev/null || true)
  [[ -n "$hits" ]] && all+="$hits"$'\n'
done
filtered="$all"
for s in "${SAFE[@]}"; do filtered=$(grep -vF "$s" <<<"$filtered" || true); done
filtered=$(grep -v '^[[:space:]]*$' <<<"$filtered" || true)
if [[ -n "$filtered" ]]; then
  echo "$filtered" | head -20 >&2
  fail "potential leaked secrets found"
fi
note "scanning for .DS_Store files"
ds=$(find . -name '.DS_Store' -not -path './claude-code/*' -not -path './open-responses/*' -not -path './.git/*' -not -path './node_modules/*' 2>/dev/null || true)
[[ -n "$ds" ]] && { echo "$ds" >&2; fail "found .DS_Store outside allowed dirs"; }
if (( failures > 0 )); then printf '[secret-scan] FAILED with %d issue(s).\n' "$failures" >&2; exit 1; fi
note "secret scan passed"
