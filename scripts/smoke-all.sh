#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "$repo_root"

./scripts/check.sh
./scripts/smoke-deepseek-anthropic-direct.sh
./scripts/smoke-claude-code.sh
./scripts/smoke-open-responses.sh
./scripts/smoke-mcp-tool-loop.sh
./scripts/smoke-thinking-tool-loop.sh
./scripts/smoke-open-responses-web-search.sh
./scripts/smoke-open-responses-document-input.sh
./scripts/package.sh --check
