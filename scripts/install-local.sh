#!/usr/bin/env bash
# ── Legacy stub ─────────────────────────────────────────────────────────
# install-local.sh content has been baked directly into the root
# jeanclaude script. This file remains as a compatibility shim.
# ─────────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

SELF_PATH="$(cd -P "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(cd -P "${SELF_PATH}/.." && pwd)"

exec "${SOURCE_ROOT}/jeanclaude" install "$@"
