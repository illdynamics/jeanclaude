#!/usr/bin/env bash
# ── JeanClaude online installer ─────────────────────────────────────────
# curl -fsSL https://raw.githubusercontent.com/illdynamics/jeanclaude/main/scripts/install.sh | bash
#
# Downloads the latest release zip (versioned), extracts it, and runs install.
# Version is resolved from the latest GitHub tag matching v*.
# ─────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

log()  { printf '[jeanclaude-install] %s\n' "$*" >&2; }
die()  { printf '[jeanclaude-install:error] %s\n' "$*" >&2; exit 1; }

REPO="illdynamics/jeanclaude"
TMPDIR="${TMPDIR:-/tmp}/jeanclaude-install-$$"

cleanup() { rm -rf "$TMPDIR" 2>/dev/null || true; }
trap cleanup EXIT

mkdir -p "$TMPDIR"
cd "$TMPDIR"

# ── resolve latest tag ──────────────────────────────────────────────────
log "resolving latest release tag ..."
LATEST_TAG=""
if command -v curl >/dev/null 2>&1; then
  LATEST_TAG="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null \
    | grep '"tag_name":' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' || true)"
elif command -v wget >/dev/null 2>&1; then
  LATEST_TAG="$(wget -qO- "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null \
    | grep '"tag_name":' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' || true)"
fi

if [[ -z "$LATEST_TAG" ]]; then
  log "could not resolve latest tag via GitHub API; trying git ls-remote ..."
  LATEST_TAG="$(git ls-remote --tags "https://github.com/${REPO}.git" 2>/dev/null \
    | grep 'refs/tags/v' | sed 's|.*refs/tags/||' | sort -V | tail -1 || true)"
fi

if [[ -z "$LATEST_TAG" ]]; then
  log "could not resolve latest tag; falling back to git clone ..."
  git clone --depth 1 "https://github.com/${REPO}.git" "${TMPDIR}/jeanclaude"
  cd "${TMPDIR}/jeanclaude"
  exec ./jeanclaude install
fi

log "latest release: ${LATEST_TAG}"

# ── download ────────────────────────────────────────────────────────────
ZIP_NAME="jeanclaude-${LATEST_TAG}.zip"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_TAG}/${ZIP_NAME}"

if command -v curl >/dev/null 2>&1; then
  log "downloading ${DOWNLOAD_URL} ..."
  curl -fsSLo "${ZIP_NAME}" "${DOWNLOAD_URL}" || {
    log "release zip not found at ${DOWNLOAD_URL}"
    log "falling back to git clone ..."
    cleanup
    git clone --depth 1 "https://github.com/${REPO}.git" "${TMPDIR}/jeanclaude"
    cd "${TMPDIR}/jeanclaude"
    exec ./jeanclaude install
  }
elif command -v wget >/dev/null 2>&1; then
  log "downloading with wget ..."
  wget -qO "${ZIP_NAME}" "${DOWNLOAD_URL}" || {
    log "release zip not found; falling back to git clone ..."
    cleanup
    git clone --depth 1 "https://github.com/${REPO}.git" "${TMPDIR}/jeanclaude"
    cd "${TMPDIR}/jeanclaude"
    exec ./jeanclaude install
  }
else
  die "curl or wget required. Install one, or use: git clone https://github.com/${REPO}.git && cd jeanclaude && ./jeanclaude install"
fi

# ── extract ─────────────────────────────────────────────────────────────
log "extracting ..."
unzip -qo "${ZIP_NAME}" -d jeanclaude-extracted
cd jeanclaude-extracted/*/

# ── install ────────────────────────────────────────────────────────────
log "installing ..."
exec ./jeanclaude install
