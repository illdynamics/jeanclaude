#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "$repo_root"

if [[ ! -d ./open-responses ]]; then
  echo "[inspect-open-responses:error] ./open-responses is missing" >&2
  exit 1
fi

echo "[inspect-open-responses] git remotes"
git -C ./open-responses remote -v || true

echo
echo "[inspect-open-responses] head"
git -C ./open-responses show -s --format='%H %cI %s' HEAD

echo
echo "[inspect-open-responses] package"
if [[ -f ./open-responses/package.json ]]; then
  cat ./open-responses/package.json
fi

echo
echo "[inspect-open-responses] key source hints"
rg -n "RESPONSES_API_KEY|AGENTS_API_KEY|BRAVE_API_KEY|UNSTRUCTURED_API_KEY|RESPONSES_API_PORT|responses-compose.yaml" ./open-responses/main.go || true

echo
echo "[inspect-open-responses] compose template section"
sed -n '1260,1375p' ./open-responses/main.go || true
