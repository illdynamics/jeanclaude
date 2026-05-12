#!/usr/bin/env bash
# ── JeanClaude online installer ─────────────────────────────────────────
# curl -fsSL https://raw.githubusercontent.com/illdynamics/jeanclaude/main/scripts/install.sh | bash
#
# Downloads the latest release zip, extracts it, and runs ./jeanclaude install.
# ─────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

log()  { printf '[jeanclaude-install] %s\n' "$*" >&2; }
die()  { printf '[jeanclaude-install:error] %s\n' "$*" >&2; exit 1; }

REPO="illdynamics/jeanclaude"
RELEASE_URL="https://github.com/${REPO}/releases/latest/download/jeanclaude.zip"
TMPDIR="${TMPDIR:-/tmp}/jeanclaude-install-$$"

cleanup() { rm -rf "$TMPDIR" 2>/dev/null || true; }
trap cleanup EXIT

mkdir -p "$TMPDIR"
cd "$TMPDIR"

# ── download ────────────────────────────────────────────────────────────
if command -v curl >/dev/null 2>&1; then
  log "downloading latest release with curl ..."
  curl -fsSLo jeanclaude.zip "$RELEASE_URL" || {
    log "release zip not found at ${RELEASE_URL}"
    log "falling back to git clone ..."
    cleanup
    git clone --depth 1 "https://github.com/${REPO}.git" "${TMPDIR}/jeanclaude"
    cd "${TMPDIR}/jeanclaude"
    exec ./jeanclaude install
  }
elif command -v wget >/dev/null 2>&1; then
  log "downloading latest release with wget ..."
  wget -qO jeanclaude.zip "$RELEASE_URL" || {
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
unzip -qo jeanclaude.zip -d jeanclaude
cd jeanclaude

# ── install ────────────────────────────────────────────────────────────
log "installing ..."
exec ./jeanclaude install
