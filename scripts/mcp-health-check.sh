#!/usr/bin/env bash
set -Eeuo pipefail

# mcp-health-check.sh — Verify MCP server configuration and connectivity.
#
# Checks:
#   1. .mcp.json exists and is valid JSON
#   2. For each configured MCP server:
#      a. Command exists in PATH or is an absolute path
#      b. Runtime (node, python, etc.) is available
#      c. Required env vars are set
#      d. For stdio servers: attempt JSON-RPC initialize handshake
#      e. For HTTP servers: health-check the URL
#
# Usage:
#   ./scripts/mcp-health-check.sh [mcp_config_path]
#   JEANCLAUDE_MCP_CONFIG=./.mcp.json ./scripts/mcp-health-check.sh
#   JEANCLAUDE_MCP_REQUIRED=jeanclaude-tools ./scripts/mcp-health-check.sh
#
# Exit codes:
#   0 = all required servers healthy, optional servers may be down
#   1 = one or more required servers failed
#   2 = config file missing or invalid
#   3 = unexpected error

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

MCP_CONFIG="${JEANCLAUDE_MCP_CONFIG:-${1:-}}"
if [[ -z "$MCP_CONFIG" ]]; then
  for candidate in ".mcp.json" "$HOME/.claude/.mcp.json" "${CLAUDE_CONFIG_DIR:-}/.mcp.json"; do
    if [[ -f "$candidate" ]]; then
      MCP_CONFIG="$candidate"
      break
    fi
  done
fi

if [[ -z "$MCP_CONFIG" ]] || [[ ! -f "$MCP_CONFIG" ]]; then
  echo "[mcp-health] INFO: no MCP config found (skipped)" >&2
  exit 0
fi

REQUIRED_SERVERS="${JEANCLAUDE_MCP_REQUIRED:-}"

# Validate JSON
if ! python3 -c "import json; json.load(open('$MCP_CONFIG'))" 2>/dev/null; then
  echo "[mcp-health] FAIL: $MCP_CONFIG is not valid JSON" >&2
  exit 2
fi

failures=0
warnings=0

# Extract server names
SERVER_NAMES=$(python3 -c "
import json, sys
cfg = json.load(open('$MCP_CONFIG'))
servers = cfg.get('mcpServers', {})
for name in servers:
    print(name)
" 2>/dev/null || echo "")

if [[ -z "$SERVER_NAMES" ]]; then
  echo "[mcp-health] INFO: no MCP servers configured" >&2
  exit 0
fi

for name in $SERVER_NAMES; do
  server_json=$(python3 -c "
import json
cfg = json.load(open('$MCP_CONFIG'))
s = cfg['mcpServers'].get('$name', {})
print(json.dumps(s))
" 2>/dev/null || echo "")

  server_type=$(echo "$server_json" | python3 -c "
import json,sys; print(json.load(sys.stdin).get('type','stdio'))
" 2>/dev/null || echo "stdio")

  command_val=$(echo "$server_json" | python3 -c "
import json,sys; print(json.load(sys.stdin).get('command',''))
" 2>/dev/null || echo "")

  args_val=$(echo "$server_json" | python3 -c "
import json,sys; print(' '.join(json.load(sys.stdin).get('args',[])))
" 2>/dev/null || echo "")

  status_label="optional"
  if echo ",$REQUIRED_SERVERS," | grep -q ",$name,"; then
    status_label="REQUIRED"
  fi

  prefix="[mcp-health] [$name/$status_label]"

  # Check: command configured
  if [[ -z "$command_val" ]]; then
    echo "$prefix FAIL: no command configured" >&2
    if [[ "$status_label" == "REQUIRED" ]]; then failures=$((failures + 1)); else warnings=$((warnings + 1)); fi
    continue
  fi

  # Check: command exists in PATH or is an absolute path
  if [[ "$command_val" == /* ]]; then
    if [[ ! -x "$command_val" ]]; then
      echo "$prefix FAIL: command '$command_val' not found or not executable" >&2
      if [[ "$status_label" == "REQUIRED" ]]; then failures=$((failures + 1)); else warnings=$((warnings + 1)); fi
      continue
    fi
  else
    if ! command -v "$command_val" > /dev/null 2>&1; then
      echo "$prefix FAIL: command '$command_val' not found in PATH" >&2
      if [[ "$status_label" == "REQUIRED" ]]; then failures=$((failures + 1)); else warnings=$((warnings + 1)); fi
      continue
    fi
  fi

  # Check: referenced env vars
  env_defs=$(echo "$server_json" | python3 -c "
import json,sys
s = json.load(sys.stdin)
env = s.get('env', {})
for k in env:
    print(k + '=' + str(env[k]))
" 2>/dev/null || echo "")

  while IFS= read -r env_line; do
    [[ -z "$env_line" ]] && continue
    env_key="${env_line%%=*}"
    env_val="${env_line#*=}"

    if echo "$env_val" | grep -q '^\$'; then
      ref_var="${env_val#\$}"
      if [[ -z "${!ref_var:-}" ]]; then
        echo "$prefix WARN: referenced env var $ref_var is not set (needed for $env_key)" >&2
        warnings=$((warnings + 1))
      fi
    fi
  done <<< "$env_defs"

  # Check: stdio handshake
  if [[ "$server_type" == "stdio" ]]; then
    # Build env for the test (export referenced vars)
    while IFS= read -r env_line; do
      [[ -z "$env_line" ]] && continue
      env_key="${env_line%%=*}"
      env_val="${env_line#*=}"
      if echo "$env_val" | grep -q '^\$'; then
        ref_var="${env_val#\$}"
        if [[ -n "${!ref_var:-}" ]]; then
          export "$env_key"="${!ref_var}"
        fi
      else
        export "$env_key"="$env_val"
      fi
    done <<< "$env_defs"

    handshake_req='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"jeanclaude-healthcheck","version":"1.0"}}}'

    if [[ -n "$args_val" ]]; then
      # shellcheck disable=SC2086
      response=$(echo "$handshake_req" | timeout 5 "$command_val" $args_val 2>/dev/null || echo "TIMEOUT_OR_ERROR")
    else
      response=$(echo "$handshake_req" | timeout 5 "$command_val" 2>/dev/null || echo "TIMEOUT_OR_ERROR")
    fi

    if [[ "$response" == "TIMEOUT_OR_ERROR" ]]; then
      echo "$prefix FAIL: JSON-RPC initialize handshake failed (timeout or error)" >&2
      if [[ "$status_label" == "REQUIRED" ]]; then failures=$((failures + 1)); else warnings=$((warnings + 1)); fi
    else
      if echo "$response" | python3 -c "import json,sys; d=json.loads(sys.stdin.read()); assert 'result' in d or 'error' in d" 2>/dev/null; then
        echo "$prefix OK: handshake successful"
      else
        echo "$prefix FAIL: invalid JSON-RPC response" >&2
        if [[ "$status_label" == "REQUIRED" ]]; then failures=$((failures + 1)); else warnings=$((warnings + 1)); fi
      fi
    fi

  elif [[ "$server_type" == "http" ]] || [[ "$server_type" == "sse" ]] || [[ "$server_type" == "url" ]]; then
    url=$(echo "$server_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('url',''))" 2>/dev/null || echo "")
    if [[ -n "$url" ]]; then
      if curl -sf --max-time 5 "$url" > /dev/null 2>&1; then
        echo "$prefix OK: HTTP endpoint reachable at $url"
      else
        curl_exit=$?
        echo "$prefix FAIL: HTTP endpoint unreachable at $url (curl exit $curl_exit)" >&2
        if [[ "$status_label" == "REQUIRED" ]]; then failures=$((failures + 1)); else warnings=$((warnings + 1)); fi
      fi
    else
      echo "$prefix WARN: no URL configured for $server_type server" >&2
      warnings=$((warnings + 1))
    fi
  else
    echo "$prefix INFO: unknown type '$server_type' — command found, skipping deep check" >&2
  fi
done

if (( failures > 0 )); then
  echo "[mcp-health] FAILED: $failures required server(s) unhealthy, $warnings warning(s)" >&2
  exit 1
fi

if (( warnings > 0 )); then
  echo "[mcp-health] WARN: $warnings issues(s), all required servers OK" >&2
  exit 0
fi

echo "[mcp-health] OK: all servers healthy" >&2
exit 0
