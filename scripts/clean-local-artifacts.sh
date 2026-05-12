#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'HELP'
Usage:
  scripts/clean-local-artifacts.sh [--remove-codeseeq]

Cleans local-only junk from the repository working tree:
  - Removes __MACOSX/ directories
  - Removes .DS_Store files (skips reference trees: claude-code/, open-responses/)
  - With --remove-codeseeq: also removes .codeseeq/ directory

This script never deletes source files (.ts, .js, .sh, .md, .json, .yml, .yaml,
.toml, .py, .mjs, Dockerfile, Makefile, etc.).
HELP
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "$repo_root"

REMOVE_CODESEEQ=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remove-codeseeq)
      REMOVE_CODESEEQ=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

note()  { printf '[clean] %s\n' "$*"; }
warn()  { printf '[clean:warn] %s\n' "$*" >&2; }

removed_count=0
REFERENCE_TREES=(
  './claude-code'
  './open-responses'
)

# ---------------------------------------------------------------------------
# 1. Remove __MACOSX/ directories
# ---------------------------------------------------------------------------
note "scanning for __MACOSX/ directories..."
while IFS= read -r -d '' dir; do
  note "removing __MACOSX/ dir: $dir"
  rm -rf "$dir"
  removed_count=$((removed_count + 1))
done < <(find . -type d -name '__MACOSX' -print0 2>/dev/null || true)

if [[ $removed_count -eq 0 ]]; then
  note "no __MACOSX/ directories found"
fi

# ---------------------------------------------------------------------------
# 2. Remove .DS_Store files (exclude reference trees)
# ---------------------------------------------------------------------------
macosx_removed=$removed_count # shellcheck disable=SC2034
note "scanning for .DS_Store files (excluding reference trees)..."

ds_count=0
while IFS= read -r -d '' f; do
  # Check if file is inside a reference tree
  skip=false
  for ref in "${REFERENCE_TREES[@]}"; do
    if [[ "$f" == "$ref" || "$f" == "$ref"/* ]]; then
      skip=true
      break
    fi
  done

  if $skip; then
    warn "skipping reference-tree .DS_Store: $f"
    continue
  fi

  note "removing .DS_Store: $f"
  rm -f "$f"
  ds_count=$((ds_count + 1))
  removed_count=$((removed_count + 1))
done < <(find . -name '.DS_Store' -type f -print0 2>/dev/null || true)

if [[ $ds_count -eq 0 ]]; then
  note "no stray .DS_Store files found"
fi

# ---------------------------------------------------------------------------
# 3. Optionally remove .codeseeq/
# ---------------------------------------------------------------------------
if $REMOVE_CODESEEQ; then
  if [[ -d .codeseeq ]]; then
    note "removing .codeseeq/ (--remove-codeseeq flag set)"
    rm -rf .codeseeq
    removed_count=$((removed_count + 1))
  else
    note ".codeseeq/ not present, nothing to remove"
  fi
else
  note ".codeseeq/ left in place (use --remove-codeseeq to remove it)"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [[ $removed_count -eq 0 ]]; then
  note "nothing to clean — repo is already clean"
else
  note "cleaned ${removed_count} artifact(s)"
fi
