# JeanClaude Release Notes

## v0.2.3 — 2026-05-15

### Managed Settings Auto-Relaxation for Dangerous Mode
- **`-Y`/`--yolo` now rewrites `managed-settings.json`** to set `allowManagedPermissionRulesOnly: false` and `permissions: { grant: ["**"] }`, ensuring Claude Code's managed permission rules don't conflict with the bypass
- **`CLAUDE_CODE_PERMISSION_MODE=bypassPermissions`** set as child-process env var when `-Y`/`--yolo` or `--permission-mode bypassPermissions` is active — provides environment-level enforcement alongside the CLI flag
- `CLAUDE_CODE_PERMISSION_MODE` added to `CRITICAL_ENV` propagation list so the env var always reaches the Claude Code child process
- Same treatment for `--permission-mode bypassPermissions` (non-`-Y` path)

### Bug Fixes
- `-Y`/`--yolo` no longer silently ignored by Claude Code v2.1.x managed settings — managed settings are now relaxed to allow full permission bypass
- Managed settings no longer block `--dangerously-skip-permissions` at the Claude Code level

### Auth Mode Selection
- Explicit auth mode via `JEANCLAUDE_AUTH_MODE` env var or `--auth` CLI flag
- Five modes: `subscription`, `api-key`, `oauth-token`, `auth-token`, `auto`
- `subscription` mode removes Anthropic credentials from child Claude Code process — stops the repeated "ANTHROPIC_API_KEY not set" prompt for DeepSeek subscription users
- Auth mode only affects child process environment, never changes DeepSeek routing

### Permission Mode Rework
- New permission modes via `JEANCLAUDE_PERMISSION_MODE` env var or `--permission-mode` CLI flag
- Five modes: `safe` (default), `accept-edits`, `auto`, `dangerous`, `bypassPermissions`
- Safe by default — no permission bypass flags passed to Claude Code
- Dangerous mode safety preflight: requires `JEANCLAUDE_DANGEROUS=1` + `JEANCLAUDE_I_UNDERSTAND_DANGEROUS_MODE=1` + container/CI detection or `JEANCLAUDE_ALLOW_HOST_DANGEROUS=1`
- Container detection: `/.dockerenv`, `/run/.containerenv`, `/proc/1/cgroup`, CI environment variables
- Claude Code camelCase aliases accepted (`acceptEdits` → `accept-edits`)
- Backward compatible — `--yolo` / `-Y` still work, `bypassPermissions` still honored

### MCP Health Diagnostics
- New `scripts/mcp-health-check.sh` standalone diagnostics script
- JSON-RPC 2.0 initialize handshake over stdio (3 retries, exponential backoff)
- HTTP endpoint health checks for URL-type MCP servers
- Required/optional server policy via `JEANCLAUDE_MCP_REQUIRED`
- Env var resolution for `${VAR}` references in MCP server config
- Integrated into startup: MCP health checked before launching Claude Code

### Startup Diagnostics
- Startup banner prints resolved config to stderr: backend, auth mode, permission mode, model, MCP status
- Suppressed by `JEANCLAUDE_QUIET=1`

### Dry-Run Mode
- `JEANCLAUDE_DRY_RUN=1` prints resolved command, auth, permissions, model, execution mode and exits 0
- No Claude Code process spawned — safe inspection of what would run

### Tests
- 18 new tests (73–90) covering auth modes, permission modes, dry-run, dangerous mode preflight
- Total test suite: 124 tests, 0 failures

### Bug Fixes
- Auth mode deletions no longer overwritten by CRITICAL_ENV merge (apply order fixed)
- `--permission-mode` + `--yolo` conflict detection fixed after flag interception
- `--permission-mode bypassPermissions` properly passed through to Claude Code when combined with `--yolo`

### Docs
- `docs/configuration.md`: Auth mode, updated permission modes, dry-run mode, CLI examples
- `docs/dangerous-mode.md`: Safety preflight requirements, new permission modes, updated interaction matrix
- `docs/security-model.md`: Auth mode layer added to defense-in-depth

---

## v0.2.1 — 2026-05-12

### Licensing
- Project relicensed under **Apache License 2.0** — added `LICENSE`, `NOTICE`, and `license` field to `package.json`

### Security Fixes
- **Gateway mode no longer leaks `DEEPSEEK_API_KEY` to Claude child process** — child receives only local gateway token, gateway process handles upstream auth
- Secret scanner implemented — detects real API keys, bearer tokens, and credential patterns across the repo
- Parent Anthropic/Claude auth variables are now always stripped before launching Claude Code
- Direct mode always overrides `ANTHROPIC_BASE_URL` to DeepSeek endpoint, never inherits from parent


### Model Defaults
- **Default profile changed from `v4-pro-thinking` to `v4-flash`** — faster interactive experience by default; use `--profile v4-pro-thinking` for deep reasoning tasks
- Model catalog default updated to match (now `v4-flash`)
- All documentation updated to reflect new default

### Bug Fixes
- Gateway test nesting fixed — tests 9 and 10 now run independently (were nested inside test 8)
- `RESONSE_API_KEY` typo fixed to `RESPONSE_API_KEY` across all config files
- Release check gitignore verification fixed for absent `.codeseeq/` directory
- Gateway process startup now uses health polling instead of fragile log text matching
- Gateway `resolve` name shadowing fixed — `path.resolve` no longer collides with Promise callback

### Docker
- JS runtime now copied to `/usr/local/bin/` next to shell launcher (pathing unified)
- Healthcheck simplified — no longer requires Open Responses in direct mode
- Docker Compose runner no longer depends on Open Responses service
- Removed `COPY tests/` from production Dockerfile (excluded by `.dockerignore`)

### Packaging
- Release packages now exclude `.codeseeq/`, `.jeanclaude/`, `claude-code/`, `open-responses/`, and all runtime state
- Package check verifies zero banned entries in generated archives
- `scripts/clean-local-artifacts.sh` with `--release` and `--remove-runtime-state` flags
- `scripts/check.sh --release` mode for pre-publish validation

### Gateway
- Local token validation with 401 on invalid/missing tokens
- Health endpoint (`/healthz`) tokenless on localhost
- Key-aware recursive redaction in logs — safe fields (host, port, url) preserved
- Real SSE streaming relay test (7 tests)
- Gateway token now properly passed to gateway process via `JEANCLAUDE_GATEWAY_TOKEN`

### Docs & Config
- Model catalog default changed to `v4-pro-thinking` (consistent with wrapper default)
- `.env.example` cleaned — stale defaults commented out, canonical env vars only
- All docs now reference only the four user-facing model profiles
- `RELEASE-NOTES.md` created (this file)
- `VERSION` file added with current version string

---

## v0.2.0 — 2026-05-11

### Initial Production Release

- Standalone CLI wrapper (`jeanclaude`) as drop-in replacement for `claude`
- Direct DeepSeek Anthropic-compatible mode (default, no gateway required)
- Four model profiles: `v4-flash`, `v4-flash-thinking`, `v4-pro`, `v4-pro-thinking`
- `--yolo` / `-Y` dangerous mode aliases
- Gateway process mode with local token auth
- MCP tools sidecar with namespaced tools (`jeanclaude_web_search`, etc.)
- Docker/devcontainer support with unified wrapper logic
- Release packaging with zero banned entries
- 82 automated tests (72 wrapper + 10 gateway)
