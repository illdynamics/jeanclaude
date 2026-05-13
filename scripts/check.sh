#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "$repo_root"

RELEASE_MODE=false
ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      RELEASE_MODE=true
      shift
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done

failures=0

note() {
  if $RELEASE_MODE; then
    printf '[check:release] %s\n' "$*"
  else
    printf '[check] %s\n' "$*"
  fi
}

fail() {
  printf '[check:error] %s\n' "$*" >&2
  failures=$((failures + 1))
}

# ---------------------------------------------------------------------------
# 0. Release-mode hard checks (run first, fail fast on release blockers)
# ---------------------------------------------------------------------------
if $RELEASE_MODE; then
  note "=== RELEASE MODE: running hard blockers ==="

  # 0a. .env must NOT exist on disk
  if [[ -f .env ]]; then
    fail ".env exists on disk — RELEASE BLOCKER: remove before release"
  else
    note ".env not present on disk (good)"
  fi

  # 0b. .codeseeq/ must NOT exist
  if [[ -d .codeseeq ]]; then
    fail ".codeseeq/ exists on disk — RELEASE BLOCKER: remove before release"
  else
    note ".codeseeq/ not present on disk (good)"
  fi

  # 0c. __MACOSX/ must NOT exist
  if find . -type d -name '__MACOSX' 2>/dev/null | grep -q .; then
    find . -type d -name '__MACOSX' 2>/dev/null | while IFS= read -r d; do
      fail "__MACOSX/ directory exists: $d — RELEASE BLOCKER"
    done
  else
    note "no __MACOSX/ directories found (good)"
  fi

  # 0d. .env must be gitignored
  if ! git check-ignore -q --no-index .env 2>/dev/null; then
    fail ".env is NOT gitignored — RELEASE BLOCKER"
  else
    note ".env is properly gitignored (good)"
  fi

  # 0e. .codeseeq/ must be gitignored
  if ! git check-ignore -q --no-index .codeseeq 2>/dev/null; then
    fail ".codeseeq/ is NOT gitignored — RELEASE BLOCKER"
  else
    note ".codeseeq/ is properly gitignored (good)"
  fi

  note "=== Release blockers check complete ==="
  echo ""
fi

# ---------------------------------------------------------------------------
# 1. Bash syntax check on all shell scripts
# ---------------------------------------------------------------------------
note "running bash -n on shell scripts"
for f in bin/*.sh scripts/*.sh; do
  [[ -f "$f" ]] || continue
  if ! bash -n "$f"; then
    fail "bash syntax failed: $f"
  fi
done

# ---------------------------------------------------------------------------
# 2. shellcheck (if available)
# ---------------------------------------------------------------------------
if command -v shellcheck >/dev/null 2>&1; then
  note "running shellcheck"
  if ! shellcheck bin/jeanclaude bin/jeanclaude-entrypoint bin/jeanclaude-healthcheck bin/jeanclaude-print-config bin/jeanclaude-standalone scripts/*.sh; then
    fail "shellcheck reported issues"
  fi
else
  note "shellcheck not installed; skipped"
fi

# ---------------------------------------------------------------------------
# 3. Tools package tests
# ---------------------------------------------------------------------------
if [[ -f tools/package.json ]]; then
  note "running tools package tests"
  if ! (cd tools && npm test); then
    fail "tools tests failed"
  fi
else
  note "no tools/package.json; skipped"
fi

# ---------------------------------------------------------------------------
# 4. Gateway package tests
# ---------------------------------------------------------------------------
if [[ -f gateway/package.json ]]; then
  note "running gateway package tests"
  if ! (cd gateway && npm test); then
    fail "gateway tests failed"
  fi
else
  note "no gateway/package.json; skipped"
fi

# ---------------------------------------------------------------------------
# 4b. Gateway wrapper tests (if tests/gateway.test.mjs exists)
# ---------------------------------------------------------------------------
if [[ -f tests/gateway.test.mjs ]]; then
  note "running gateway wrapper tests"
  if ! node --test tests/gateway.test.mjs; then
    fail "gateway wrapper tests failed"
  fi
else
  note "no gateway.test.mjs; skipped"
fi

# ---------------------------------------------------------------------------
# 5. Wrapper tests (if tests directory exists)
# ---------------------------------------------------------------------------
if ls tests/*.test.* 1>/dev/null 2>&1; then
  note "running wrapper tests"
  if ! node --test tests/*.test.*; then
    fail "wrapper tests failed"
  fi
else
  note "no wrapper tests found; skipped"
fi

# ---------------------------------------------------------------------------
# 6. Package exclusion check
# ---------------------------------------------------------------------------
note "checking package exclusions"
if ! ./scripts/package.sh --check; then
  fail "package check failed"
fi

# ---------------------------------------------------------------------------
# 7. Secret scan (standalone script)
# ---------------------------------------------------------------------------
note "running secret-pattern scan"
if ! ./scripts/secret-scan.sh; then
  fail "secret scan failed"
fi

# ---------------------------------------------------------------------------
# 8. Markdown lint (if available)
# ---------------------------------------------------------------------------
if command -v markdownlint >/dev/null 2>&1; then
  note "running markdownlint"
  if ! markdownlint '*.md' 'docs/'; then
    fail "markdownlint reported issues"
  fi
else
  note "markdownlint not installed; skipped"
fi

# ---------------------------------------------------------------------------
# 9. Dockerfile lint (if available)
# ---------------------------------------------------------------------------
if [[ -f Dockerfile ]]; then
  if command -v hadolint >/dev/null 2>&1; then
    note "running hadolint"
    if ! hadolint Dockerfile; then
      fail "hadolint reported issues"
    fi
  else
    note "hadolint not installed; skipped"
  fi
fi

# ---------------------------------------------------------------------------
# 10. .DS_Store check — fail if any .DS_Store outside reference dirs
# ---------------------------------------------------------------------------
note "checking for .DS_Store files outside allowed directories"
ds_hits="$(find . -name '.DS_Store' \
  -not -path './claude-code/*' \
  -not -path './open-responses/*' \
  -not -path './.git/*' \
  -not -path './node_modules/*' 2>/dev/null || true)"
if [[ -n "$ds_hits" ]]; then
  while IFS= read -r f; do
    fail ".DS_Store found: $f"
    if $RELEASE_MODE; then
      fail "RELEASE BLOCKER: .DS_Store must not exist in release"
    fi
  done <<<"$ds_hits"
else
  note "no stray .DS_Store files"
fi

# ---------------------------------------------------------------------------
# 11. Dotenv check — verify .env is gitignored
# ---------------------------------------------------------------------------
if ! $RELEASE_MODE; then
  # In non-release mode, just verify gitignore
  note "verifying .env is gitignored"
  if ! git check-ignore -q --no-index .env 2>/dev/null; then
    fail ".env is NOT gitignored — add to .gitignore"
  else
    note ".env is properly gitignored"
  fi

  # Warn about .env on disk (non-blocking in normal mode)
  if [[ -f .env ]]; then
    note "warning: .env exists on disk (should be gitignored and in .gitignore)"
  fi
fi

# ---------------------------------------------------------------------------
# 12. Claude-code reference check — verify source hasn't been modified
# ---------------------------------------------------------------------------
note "verifying claude-code/ reference tree integrity"
if [[ -d claude-code ]]; then
  # Check for untracked modifications inside claude-code/
  if git ls-files --modified --others --exclude-standard claude-code/ 2>/dev/null | grep -q .; then
    git ls-files --modified --others --exclude-standard claude-code/
    fail "claude-code/ reference tree has been modified"
  else
    note "claude-code/ reference tree is clean"
  fi
else
  note "claude-code/ directory not present; skipped"
fi

# ---------------------------------------------------------------------------
# 13. Banned files check — no secrets, .env, .DS_Store in tracked files
# ---------------------------------------------------------------------------
note "checking for banned files in tracked content"
banned_patterns=(
  '^.env$'
  '^.env.'
  '\.env$'
  '\.DS_Store$'
)
for bpat in "${banned_patterns[@]}"; do
  hits="$(git ls-files --cached 2>/dev/null | grep -v '^\.env\.example$' | grep "$bpat" || true)"
  if [[ -n "$hits" ]]; then
    while IFS= read -r f; do
      fail "banned file tracked by git: $f"
    done <<<"$hits"
  fi
done
# ---------------------------------------------------------------------------
# 14. Release mode: extra package content assertions
# ---------------------------------------------------------------------------
if $RELEASE_MODE; then
  note "release package content verification already covered by package check (step 6)"
fi

# ---------------------------------------------------------------------------

# 15. Privacy lockdown static checks ────────────────────────────────────────
# ---------------------------------------------------------------------------
note "running privacy lockdown static checks"

# 15a. No api.anthropic.com in runtime source files
note "checking for api.anthropic.com in runtime files"
an_api_hits="$(grep -rl 'api\.anthropic\.com' bin/ config/ scripts/ gateway/ jeanclaude Dockerfile Makefile docker-compose.yml docker-compose.open-responses.yml 2>/dev/null || true)"
if [[ -n "$an_api_hits" ]]; then
  while IFS= read -r f; do
    fail "found api.anthropic.com in runtime file: $f"
  done <<<"$an_api_hits"
else
  note "no api.anthropic.com in runtime files (good)"
fi

# 15b. No claude.ai in runtime source files
note "checking for claude.ai in runtime files"
claude_ai_hits="$(grep -rl 'claude\.ai' bin/ config/ scripts/ gateway/ jeanclaude Dockerfile Makefile docker-compose.yml docker-compose.open-responses.yml 2>/dev/null || true)"
if [[ -n "$claude_ai_hits" ]]; then
  while IFS= read -r f; do
    fail "found claude.ai in runtime file: $f"
  done <<<"$claude_ai_hits"
else
  note "no claude.ai in runtime files (good)"
fi

# 15c. Verify privacy env vars are in runtime files
note "checking privacy env vars in runtime files"
for var in "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC" "DISABLE_TELEMETRY" "DISABLE_UPDATES" "CLAUDE_CODE_SKIP_PROMPT_HISTORY"; do
  found=false
  for f in bin/jeanclaude-standalone.ts bin/jeanclaude-entrypoint Dockerfile .env.example config/managed-settings.template.json; do
    if grep -q "$var" "$f" 2>/dev/null; then
      found=true
      break
    fi
  done
  if ! $found; then
    fail "privacy env var $var not found in any runtime file"
  fi
done
note "all key privacy env vars present in runtime files"

# 15d. No 'latest' in CLAUDE_CODE_NPM_VERSION in Dockerfile or .env.example
note "checking CLAUDE_CODE_NPM_VERSION is not 'latest'"
if grep -q 'CLAUDE_CODE_NPM_VERSION.*=.*latest' Dockerfile .env.example 2>/dev/null; then
  fail "CLAUDE_CODE_NPM_VERSION=latest found in Dockerfile or .env.example"
else
  note "CLAUDE_CODE_NPM_VERSION is pinned (good)"
fi

# 15e. Verify managed-settings.template.json is valid JSON
note "validating managed-settings.template.json"
if ! python3 -c "import json; json.load(open('config/managed-settings.template.json'))" 2>/dev/null; then
  fail "config/managed-settings.template.json is not valid JSON"
else
  note "managed-settings.template.json is valid JSON (good)"
fi

# Summary
# ---------------------------------------------------------------------------
if (( failures > 0 )); then
  if $RELEASE_MODE; then
    printf '[check:release] FAILED with %d issue(s).\n' "$failures" >&2
  else
    printf '[check] FAILED with %d issue(s).\n' "$failures" >&2
  fi
  exit 1
fi

if $RELEASE_MODE; then
  note "all checks passed — ready for release"
else
  note "all checks passed"
fi

# ---------------------------------------------------------------------------
