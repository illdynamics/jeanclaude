#!/usr/bin/env bash
# shellcheck shell=bash

jeanclaude_dotenv_key_allowed() {
  case "$1" in
    DEEPSEEK_API_KEY|RESPONSE_API_KEY|BRAVE_API_KEY|UNSTRUCTURED_API_KEY|UNSTRUCTURED_API_URL|OPENAI_API_KEY|ANTHROPIC_API_KEY|OPENROUTER_API_KEY|EMBEDDING_MODEL_ID|MEMORY_STORE_PASSWORD|HOST_UID|HOST_GID|CLAUDE_CODE_NPM_VERSION|OPEN_RESPONSES_IMAGE|OPEN_RESPONSES_TAG|RESPONSE_API_KEY_HEADER_NAME|JEANCLAUDE_BRIDGE_MODE|JEANCLAUDE_*|OPEN_RESPONSES_*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

jeanclaude_trim_leading_ws() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  printf '%s' "$value"
}

jeanclaude_trim_trailing_ws() {
  local value="$1"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

jeanclaude_decode_env_value() {
  local value="$1"

  if [[ "$value" == \"*\" && "$value" == *\" && "${#value}" -ge 2 ]]; then
    value="${value:1:${#value}-2}"
    value="${value//\\\"/\"}"
    value="${value//\\\\/\\}"
    printf '%s' "$value"
    return 0
  fi

  if [[ "$value" == \'*\' && "$value" == *\' && "${#value}" -ge 2 ]]; then
    value="${value:1:${#value}-2}"
    printf '%s' "$value"
    return 0
  fi

  printf '%s' "$value"
}

jeanclaude_load_dotenv() {
  # Allow callers to skip dotenv loading entirely
  if [[ "${JEANCLAUDE_NO_DOTENV:-}" == "1" ]]; then
    return 0
  fi

  local env_file="${1:-.env}"
  [[ -f "$env_file" ]] || return 0

  local line trimmed key raw value
  while IFS= read -r line || [[ -n "$line" ]]; do
    # Strip Windows-style carriage returns
    line="${line%$'\r'}"

    trimmed="$(jeanclaude_trim_leading_ws "$line")"

    # Skip blank lines
    [[ -z "$trimmed" ]] && continue

    # Skip comment lines
    [[ "$trimmed" == \#* ]] && continue

    # Strip optional "export" prefix
    if [[ "$trimmed" == export[[:space:]]* ]]; then
      trimmed="${trimmed#export}"
      trimmed="$(jeanclaude_trim_leading_ws "$trimmed")"
    fi

    # Parse KEY=VALUE
    if [[ "$trimmed" =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      raw="${BASH_REMATCH[2]}"
      raw="$(jeanclaude_trim_leading_ws "$raw")"

      # Strip inline comments (only for unquoted values)
      if [[ "$raw" != \"* && "$raw" != \'* ]]; then
        raw="${raw%%#*}"
        raw="$(jeanclaude_trim_trailing_ws "$raw")"
      fi

      value="$(jeanclaude_decode_env_value "$raw")"

      # Only set if key is in the allowed list AND the variable is
      # not already set in the environment (don't override existing env vars).
      if jeanclaude_dotenv_key_allowed "$key" && [[ -z "${!key+x}" ]]; then
        printf -v "$key" '%s' "$value"
        export "$key"
      fi
    fi
  done < "$env_file"
}
