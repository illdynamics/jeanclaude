#!/usr/bin/env bash
set -Eeuo pipefail

log() {
  printf '[jeanclaude-install] %s\n' "$*" >&2
}

die() {
  printf '[jeanclaude-install:error] %s\n' "$*" >&2
  exit 1
}

resolve_self_path() {
  local source="$1"
  while [[ -h "$source" ]]; do
    local dir
    dir="$(cd -P "$(dirname "$source")" && pwd)"
    source="$(readlink "$source")"
    [[ "$source" == /* ]] || source="${dir}/${source}"
  done
  printf '%s\n' "$(cd -P "$(dirname "$source")" && pwd)/$(basename "$source")"
}

SELF_PATH="$(resolve_self_path "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd -P "$(dirname "$SELF_PATH")" && pwd)"
SOURCE_ROOT="$(cd -P "${SCRIPT_DIR}/.." && pwd)"

: "${JEANCLAUDE_INSTALL_DIR:=${HOME}/.config/jeanclaude}"
: "${JEANCLAUDE_BIN_DIR:=${HOME}/bin}"

# ── Safety: don't install into the source repo ──────────────────────────
case "${JEANCLAUDE_INSTALL_DIR}/" in
  "${SOURCE_ROOT}/"*)
    die "JEANCLAUDE_INSTALL_DIR cannot be inside source repo: ${JEANCLAUDE_INSTALL_DIR}"
    ;;
esac

case "${JEANCLAUDE_BIN_DIR}/" in
  "${SOURCE_ROOT}/"*)
    die "JEANCLAUDE_BIN_DIR cannot be inside source repo: ${JEANCLAUDE_BIN_DIR}"
    ;;
esac

mkdir -p "$JEANCLAUDE_INSTALL_DIR" "$JEANCLAUDE_BIN_DIR"

# ── Copy repo snapshot to install dir ───────────────────────────────────
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude '.git/' \
    --exclude '.codeseeq/' \
    --exclude '.jeanclaude/' \
    --exclude '.claude/' \
    --exclude 'claude-code/' \
    --exclude 'open-responses/' \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude '.DS_Store' \
    --exclude '__MACOSX/' \
    --exclude 'node_modules/' \
    --exclude '.tmp-*/' \
    "$SOURCE_ROOT/" "$JEANCLAUDE_INSTALL_DIR/"
else
  tar -C "$SOURCE_ROOT" \
    --exclude '.git' \
    --exclude '.codeseeq' \
    --exclude '.jeanclaude' \
    --exclude '.claude' \
    --exclude 'claude-code' \
    --exclude 'open-responses' \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude '.DS_Store' \
    --exclude '__MACOSX' \
    --exclude 'node_modules' \
    --exclude '.tmp-*' \
    -cf - . | tar -C "$JEANCLAUDE_INSTALL_DIR" -xf -
fi

chmod +x "$JEANCLAUDE_INSTALL_DIR/jeanclaude" \
        "$JEANCLAUDE_INSTALL_DIR/scripts/install.sh" \
        "$JEANCLAUDE_INSTALL_DIR/bin/jeanclaude" \
        "$JEANCLAUDE_INSTALL_DIR/bin/jeanclaude-standalone" \
        2>/dev/null || true

# ── Create ~/bin/jeanclaude launcher ────────────────────────────────────
launcher="${JEANCLAUDE_BIN_DIR}/jeanclaude"
cat > "$launcher" <<LAUNCHER_EOF
#!/usr/bin/env bash
set -Eeuo pipefail
exec "${JEANCLAUDE_INSTALL_DIR}/jeanclaude" "\$@"
LAUNCHER_EOF
chmod +x "$launcher"

log "installed repo snapshot to ${JEANCLAUDE_INSTALL_DIR}"
log "installed launcher to ${launcher}"

# ── Ensure Claude Code is installed ─────────────────────────────────
log "checking for Claude Code ..."
if command -v claude >/dev/null 2>&1; then
  claude_ver="$(claude --version 2>&1 | head -1 || true)"
  log "claude found: ${claude_ver}"
elif command -v npm >/dev/null 2>&1; then
  log "installing Claude Code (npm install -g @anthropic-ai/claude-code) ..."
  npm install -g @anthropic-ai/claude-code
  claude_ver="$(claude --version 2>&1 | head -1 || true)"
  log "Claude Code installed: ${claude_ver}"
else
  log "npm not found; skipping Claude Code installation."
  log "You will need Claude Code: npm install -g @anthropic-ai/claude-code"
fi
# ── Auto-build image if requested ──────────────────────────────────────
if command -v podman >/dev/null 2>&1 || command -v docker >/dev/null 2>&1; then
  if [[ "${JEANCLAUDE_AUTO_BUILD:-true}" != "false" ]]; then
    log "building Docker/Podman image ..."
    "${JEANCLAUDE_INSTALL_DIR}/jeanclaude" build || log "build failed; you can rebuild later with: jeanclaude build"
  fi
else
  log "no container runtime found; skipping image build"
fi

# ── PATH hint ───────────────────────────────────────────────────────────
case ":${PATH}:" in
  *":${JEANCLAUDE_BIN_DIR}:"*) ;;
  *)
    log "add ${JEANCLAUDE_BIN_DIR} to your PATH to use 'jeanclaude' from anywhere:"
    log "  export PATH=\"${JEANCLAUDE_BIN_DIR}:\$PATH\""
    log "  # or add it to your ~/.zshrc / ~/.bashrc"
    ;;
esac

log "install complete. Run: jeanclaude --version"
