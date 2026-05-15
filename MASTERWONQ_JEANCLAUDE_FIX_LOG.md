# MasterWonq JeanClaude Fix Log — Auth, MCP, Permission Mode Implementation

**Date:** 2026-05-14
**Spec:** MasterWonqPrompt 3
**Status:** Complete — all 124 tests pass, all checks green

## Summary

Implemented explicit auth mode selection, proper permission mode handling with safety preflight, MCP health diagnostics, startup diagnostics, and dry-run support in the JeanClaude standalone wrapper.

## Changes Made

### 1. Auth Mode Selection (`bin/jeanclaude-standalone.ts`)

- Added `AuthMode` type: `"auto" | "subscription" | "api-key" | "oauth-token" | "auth-token"`
- Added `resolveAuthMode(cliMode?)` — validates from `JEANCLAUDE_AUTH_MODE` env var or `--auth` CLI flag
- Added `applyAuthModeToChild(childEnv, authMode)` — removes credentials from child env per mode
- `--auth` CLI flag parsed and consumed (not passed to Claude Code)
- Auth mode applied AFTER `CRITICAL_ENV` merge in `runClaude()` so deletions stick
- Doctor output shows current auth mode

### 2. Permission Mode Handling (`bin/jeanclaude-standalone.ts`)

- Added `PermissionMode` type: `"safe" | "auto" | "accept-edits" | "dangerous" | "bypassPermissions"`
- Added `resolvePermissionMode(cliMode?)` — accepts Claude Code camelCase aliases (`acceptEdits` → `accept-edits`)
- `--permission-mode` CLI flag intercepted, validated, and consumed
- Safety preflight for `dangerous` mode:
  - `JEANCLAUDE_DANGEROUS=1` — explicit opt-in
  - `JEANCLAUDE_I_UNDERSTAND_DANGEROUS_MODE=1` — acknowledgement
  - Container/CI detection OR `JEANCLAUDE_ALLOW_HOST_DANGEROUS=1` — host protection
  - Container detection: `/.dockerenv`, `/run/.containerenv`, `/proc/1/cgroup`, `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`
- Backward compatibility: `--yolo` / `-Y` still works, `bypassPermissions` conflict handled

### 3. MCP Health Check (`scripts/mcp-health-check.sh`, `bin/jeanclaude-standalone.ts`)

- New standalone Bash script (`scripts/mcp-health-check.sh`):
  - JSON validation of `.mcp.json`
  - Command existence and PATH checks
  - Env var resolution for `${VAR}` references
  - JSON-RPC 2.0 initialize handshake over stdio (3 retries, exponential backoff)
  - HTTP endpoint health checks
  - Required/optional server policy via `JEANCLAUDE_MCP_REQUIRED`
  - ShellCheck-clean (`set -Eeuo pipefail`)
- Integrated into standalone.ts via `attemptMcpHandshake()` and `checkMcpHealth()`

### 4. Startup Diagnostics (`bin/jeanclaude-standalone.ts`)

- `printStartupDiagnostics()` reports to stderr: backend, auth mode, permission mode, model, MCP status
- Suppressed by `JEANCLAUDE_QUIET=1`
- Runs before launching Claude Code

### 5. Dry-Run Mode (`bin/jeanclaude-standalone.ts`)

- `JEANCLAUDE_DRY_RUN=1` prints resolved command and exits 0 without invoking Claude Code
- Reports: binary path, args, auth mode, base URL, permissions, model, execution mode

### 6. Tests (`tests/wrapper.test.mjs`)

Added 18 new tests (73–90):

| # | Test | Status |
|---|------|--------|
| 73 | subscription mode unsets API key and auth token | pass |
| 74 | api-key mode keeps API key | pass |
| 75 | oauth-token mode unsets API credentials | pass |
| 76 | auth-token mode keeps auth token, unsets API key | pass |
| 77 | auto mode preserves current behavior | pass |
| 78 | --auth CLI flag overrides env var | pass |
| 79 | invalid auth mode exits 1 | pass |
| 80 | --auth flag consumed and not leaked | pass |
| 81 | doctor reports auth and permission modes | pass |
| 82 | safe mode adds no permission flags | pass |
| 83 | accept-edits adds --permission-mode acceptEdits | pass |
| 84 | auto adds --permission-mode auto | pass |
| 85 | --permission-mode CLI overrides env | pass |
| 86 | dangerous mode fails preflight without env vars | pass |
| 87 | dangerous mode passes with env vars + ALLOW_HOST | pass |
| 88 | dry-run prints command and exits 0 | pass |
| 89 | invalid permission mode exits 1 | pass |
| 90 | --yolo/-Y backward compatibility | pass |

### 7. Documentation

- `docs/configuration.md`: Added Auth Mode, updated Permission Mode, added Dry-Run Mode, updated CLI examples
- `docs/dangerous-mode.md`: Added new permission modes, safety preflight requirements, updated permission model summary
- `docs/security-model.md`: Added auth mode layer to defense-in-depth, updated production config

## Bugs Fixed During Implementation

1. **CRITICAL_ENV merge overwrites auth mode deletions**: Moved `applyAuthModeToChild()` to after CRITICAL_ENV merge
2. **--permission-mode interception breaks --yolo conflict detection**: Use already-resolved `cliPermissionMode` instead of re-parsing from spliced `passArgs`
3. **Claude Code camelCase values not recognized**: Added alias mapping (`acceptEdits` → `accept-edits`) to `resolvePermissionMode()`
4. **--permission-mode bypassPermissions not passed through with --yolo**: Re-inject bypassPermissions into passArgs when combined with --yolo
5. **Dry-run test checks stdout instead of stderr**: Fixed to check `stderr` where dry-run output actually goes

## Validation

- `npm test`: 124/124 pass, 0 fail
- `bash scripts/check.sh`: exit 0
- `bash scripts/secret-scan.sh`: exit 0
- `npx esbuild`: clean compilation, no errors

## Files Modified

| File | Changes |
|------|---------|
| `bin/jeanclaude-standalone.ts` | Auth mode, permission mode, MCP health, startup diagnostics, dry-run |
| `bin/jeanclaude-standalone.js` | Recompiled from TypeScript |
| `scripts/mcp-health-check.sh` | New MCP health check Bash script |
| `tests/wrapper.test.mjs` | 18 new tests (73–90) |
| `docs/configuration.md` | Auth mode, permission mode, dry-run docs |
| `docs/dangerous-mode.md` | Safety preflight, new permission modes |
| `docs/security-model.md` | Auth mode layer |
| `MASTERWONQ_JEANCLAUDE_FIX_LOG.md` | This file |
