#!/usr/bin/env bash
set -Eeuo pipefail

die() {
  printf '[package:error] %s\n' "$*" >&2
  exit 1
}

note() {
  printf '[package] %s\n' "$*"
}

usage() {
  cat <<'HELP'
Usage:
  scripts/package.sh [output.zip]
  scripts/package.sh --check
HELP
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

zip_excludes=(
  # --- Sensitive & runtime dirs ---
  ".git/*"
  "*/.git/*"
  ".codeseeq/*"
  ".codeseeq/"
  "*/.codeseeq/*"
  "codeseeq/*"
  "codeseeq/"
  "*codeseeq/*"
  "claude-code/*"
  ".jeanclaude/"
  "claude-code/"
  ".jeanclaude/"
  "*claude-code/*"
  ".jeanclaude/"
  "open-responses/*"
  "open-responses/"
  "*open-responses/*"

  # --- Secrets ---
  ".env"
  ".env.*"
  "*.env"
  "*.env.*"

  # --- Local config ---
  ".claude/*"
  ".claude.json"
  ".mcp.local.json"
  ".jeanclaude/*"
  ".jeanclaude/*"

  # --- Build & dependency artifacts ---
  "node_modules/*"
  "dist/*"
  "build/*"
  "coverage/*"
  "gateway/node_modules/*"
  "gateway/dist/*"

  # --- Temp, test & log ---
  "tests/*"
  "tmp/*"
  "cache/*"
  ".cache/*"
  "*.log"
  "logs/*"
  "gateway/*.log"

  # --- OS junk ---
  ".DS_Store"
  "*/.DS_Store"
  "__MACOSX/*"
  "__MACOSX/"

  # --- Archives ---
  "*.zip"

  # --- Infrastructure (not needed in release package) ---
  "infra/*"
  "infra/"
)

have_zip_cli()    { command -v zip >/dev/null 2>&1; }
have_unzip_cli()  { command -v unzip >/dev/null 2>&1; }
have_python3()    { command -v python3 >/dev/null 2>&1; }

resolve_abs_path() {
  local path="$1"
  local dir base
  dir="$(cd "$(dirname "$path")" && pwd)"
  base="$(basename "$path")"
  printf '%s/%s' "$dir" "$base"
}

create_package_with_zip() {
  local output_abs="$1"
  local output_rel=""
  if [[ "$output_abs" == "$repo_root/"* ]]; then
    output_rel="${output_abs#"$repo_root/"}"
  fi

  local -a cmd=(zip -rq "$output_abs" .)
  local pattern
  for pattern in "${zip_excludes[@]}"; do
    cmd+=(-x "$pattern")
  done
  if [[ -n "$output_rel" ]]; then
    cmd+=(-x "$output_rel")
  fi

  (
    cd "$repo_root"
    "${cmd[@]}"
    # Always include .env.example regardless of exclusion patterns
    if [[ -f .env.example ]]; then
      zip -q "$output_abs" .env.example
    fi
  )
}

create_package_with_python() {
  local output_abs="$1"
  local output_rel=""
  if [[ "$output_abs" == "$repo_root/"* ]]; then
    output_rel="${output_abs#"$repo_root/"}"
  fi

  JEANCLAUDE_REPO_ROOT="$repo_root" \
  JEANCLAUDE_OUTPUT_ZIP="$output_abs" \
  JEANCLAUDE_OUTPUT_REL="$output_rel" \
  python3 - <<'PY'
import fnmatch
import os
import zipfile
from pathlib import Path

repo = Path(os.environ["JEANCLAUDE_REPO_ROOT"]).resolve()
out = Path(os.environ["JEANCLAUDE_OUTPUT_ZIP"]).resolve()
out_rel = os.environ.get("JEANCLAUDE_OUTPUT_REL", "")
patterns = [
    # Sensitive & runtime dirs
    ".git/*",
    "*/.git/*",
    ".codeseeq/*",
    ".codeseeq/",
    "*/.codeseeq/*",
    "claude-code/*",
  ".jeanclaude/"
    "claude-code/",
  ".jeanclaude/"
    "*claude-code/*",
  ".jeanclaude/"
    "open-responses/*",
    "open-responses/",
    "*open-responses/*",
    # Secrets
    ".env",
    ".env.*",
    "*.env",
    "*.env.*",
    # Local config
    ".claude/*",
    ".claude.json",
    ".mcp.local.json",
    ".jeanclaude/*",
    ".jeanclaude/*",
    # Build & dependency artifacts
    "node_modules/*",
    "dist/*",
    "build/*",
    "coverage/*",
    "gateway/node_modules/*",
    "gateway/dist/*",
    # Temp, test & log
    "tests/*",
    "tmp/*",
    "cache/*",
    ".cache/*",
    "*.log",
    "logs/*",
    "gateway/*.log",
    # OS junk
    ".DS_Store",
    "*/.DS_Store",
    "__MACOSX/*",
    "__MACOSX/",
    # Archives
    "*.zip",
    # Infrastructure
    "infra/*",
    "infra/",
]
if out_rel:
    patterns.append(out_rel)

# Banned path prefixes that MUST NOT appear in the archive
BANNED_PREFIXES = [
    "claude-code/",
  ".jeanclaude/"
    "open-responses/",
    ".codeseeq/",
    ".git/",
    "__MACOSX/",
]


def excluded(rel: str) -> bool:
    # .env.example is always included
    if rel == ".env.example":
        return False

    # .DS_Store at any depth is always excluded
    fname = os.path.basename(rel)
    if fname == ".DS_Store":
        return True

    # Check for banned path prefixes first
    for banned in BANNED_PREFIXES:
        if rel.startswith(banned):
            return True

    for pat in patterns:
        if fnmatch.fnmatch(rel, pat):
            return True
        if pat.endswith("/*"):
            root = pat[:-2]
            if rel == root or rel.startswith(root + "/"):
                return True
    return False


out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(repo):
        root_path = Path(root)
        rel_root = root_path.relative_to(repo).as_posix()
        if rel_root == ".":
            rel_root = ""

        keep_dirs = []
        for d in dirs:
            rel_d = f"{rel_root}/{d}" if rel_root else d
            if excluded(rel_d) or excluded(rel_d + "/x"):
                continue
            # Also check banned prefixes for directories
            skip = False
            for banned in BANNED_PREFIXES:
                check = rel_d + "/" if rel_root else d + "/"
                if check.startswith(banned):
                    skip = True
                    break
            if skip:
                continue
            keep_dirs.append(d)
        dirs[:] = keep_dirs

        for name in files:
            rel = f"{rel_root}/{name}" if rel_root else name
            if excluded(rel):
                continue
            zf.write(root_path / name, rel)
PY
}

create_package() {
  local output_zip="$1"
  mkdir -p "$(dirname "$output_zip")"
  rm -f "$output_zip"

  local output_abs
  output_abs="$(resolve_abs_path "$output_zip")"

  if have_zip_cli; then
    create_package_with_zip "$output_abs"
  elif have_python3; then
    note "zip not found; using Python 3 zipfile fallback" >&2
    create_package_with_python "$output_abs"
  else
    die "cannot create zip: install zip or python3"
  fi

  printf '%s\n' "$output_abs"
}

archive_entries() {
  local archive="$1"
  if have_unzip_cli; then
    unzip -Z -1 "$archive"
  elif have_python3; then
    python3 - "$archive" <<'PY'
import sys
import zipfile
with zipfile.ZipFile(sys.argv[1]) as zf:
    for name in zf.namelist():
        print(name)
PY
  else
    return 1
  fi
}

package_check() {
  local tmpdir archive entries_file
  tmpdir="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap 'rm -rf "${tmpdir:-}"' EXIT
  archive="$tmpdir/jeanclaude-package-check.zip"
  entries_file="$tmpdir/entries.txt"

  if ! create_package "$archive" >/dev/null; then
    die "failed to create test package"
  fi

  if ! archive_entries "$archive" > "$entries_file"; then
    die "unable to inspect package archive"
  fi

  local failures=0
  local entry base

  # Banned path prefixes — FAIL HARD
  local -a banned_prefixes=(
    "claude-code/"
  ".jeanclaude/"
    "open-responses/"
    ".codeseeq/"
    ".git/"
    "__MACOSX/"
  )

  while IFS= read -r entry; do
    base="${entry##*/}"

    # Check banned path prefixes — any entry starting with these is a hard fail
    local prefix
    for prefix in "${banned_prefixes[@]}"; do
      if [[ "$entry" == "$prefix"* ]]; then
        echo "[package:check:error] FORBIDDEN path prefix '${prefix}' matched: $entry" >&2
        failures=$((failures + 1))
        continue 2
      fi
    done

    # Allow .env.example explicitly
    if [[ "$base" == ".env.example" ]]; then
      continue
    fi

    # Forbidden file patterns (name-based)
    case "$base" in
      .env|.env.*|*.env|*.env.*|.claude.json|.mcp.local.json|.DS_Store|*.log|*.zip)
        echo "[package:check:error] forbidden file in archive: $entry" >&2
        failures=$((failures + 1))
        continue
        ;;
    esac

    # Forbidden directory paths (legacy patterns — these should also be caught by prefix check)
    case "$entry" in
      .git/*|*/.git/*|.claude/*|.jeanclaude/documents/*|.jeanclaude/tmp/*|node_modules/*|dist/*|build/*|coverage/*|tests/*|tmp/*|cache/*|.cache/*|logs/*|infra/*)
        echo "[package:check:error] forbidden path in archive: $entry" >&2
        failures=$((failures + 1))
        continue
        ;;
    esac
  done < "$entries_file"

  # Verify .env.example IS included
  if ! grep -Fxq '.env.example' "$entries_file"; then
    echo "[package:check:error] .env.example missing in archive" >&2
    failures=$((failures + 1))
  fi

  # Verify .env is NOT included
  if grep -Fxq '.env' "$entries_file"; then
    echo "[package:check:error] .env found in archive (must be excluded)" >&2
    failures=$((failures + 1))
  fi

  # --- Summary: included top-level directories ---
  echo ""
  echo "[package:check] ===== Included top-level directories ====="
  local -a toplevel_dirs
  while IFS= read -r entry; do
    # Get first path component
    local top="${entry%%/*}"
    # Only consider entries with a subdirectory structure
    if [[ "$entry" == */* && "$top" != "."* && "$top" != "" ]]; then
      toplevel_dirs+=("$top")
    fi
  done < "$entries_file"

  if [[ ${#toplevel_dirs[@]} -gt 0 ]]; then
    # Deduplicate and sort
    local -a unique_dirs
# shellcheck disable=SC2207
    IFS=$'\n' unique_dirs=($(printf '%s\n' "${toplevel_dirs[@]}" | sort -u))
    for d in "${unique_dirs[@]}"; do
      echo "  $d/"
    done
  fi
  echo "[package:check] Total entries: $(wc -l < "$entries_file" | tr -d ' ')"
  echo "[package:check] ==========================================="
  echo ""

  if (( failures > 0 )); then
    die "package check failed with ${failures} issue(s)"
  fi

  note "package check passed"
}

main() {
  case "${1:-}" in
    -h|--help)
      usage
      ;;
    --check)
      shift
      [[ $# -eq 0 ]] || die "--check does not accept output path"
      package_check
      ;;
    *)
      [[ $# -le 1 ]] || die "too many arguments"
      version="${JEANCLAUDE_VERSION:-$(cat "${repo_root}/VERSION" 2>/dev/null || date +%Y%m%d-%H%M%S)}"
      default_zip="${repo_root}/dist/jeanclaude-${version}.zip"
      create_package "${1:-$default_zip}"
      ;;
  esac
}

main "$@"
