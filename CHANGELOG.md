# Changelog

All notable changes to JeanClaude will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3] — 2026-05-14

### Added
- Auth mode selection: `JEANCLAUDE_AUTH_MODE` env var and `--auth` CLI flag (`subscription`, `api-key`, `oauth-token`, `auth-token`, `auto`)
- Permission mode handling: `JEANCLAUDE_PERMISSION_MODE` env var and `--permission-mode` CLI flag (`safe`, `accept-edits`, `auto`, `dangerous`, `bypassPermissions`)
- Dangerous mode safety preflight: triple opt-in with container/CI detection
- MCP health diagnostics: `scripts/mcp-health-check.sh` with JSON-RPC handshake, HTTP checks, env var resolution
- MCP health integration into startup flow with retry logic
- Startup diagnostics banner showing resolved config (backend, auth, permissions, model, MCP)
- Dry-run mode: `JEANCLAUDE_DRY_RUN=1` prints command and exits without launch
- 18 new wrapper tests (73–90)

### Changed
- `--permission-mode` flag now intercepted and validated by JeanClaude (Claude Code camelCase aliases accepted)
- Permission mode default changed from implicit to explicit `safe` mode
- Updated docs: configuration, dangerous-mode, security-model

### Fixed
- Auth mode deletions apply after CRITICAL_ENV merge (no longer overridden)
- `--permission-mode` + `--yolo` conflict detection works after flag interception
- `--permission-mode bypassPermissions` properly passed through to Claude Code with `--yolo`

## [0.2.1] — 2026-05-12

### Security
- Gateway mode no longer leaks `DEEPSEEK_API_KEY` to Claude child process
- Secret scanner implemented with 6 detection patterns
- Parent Anthropic/Claude auth variables always stripped before launch
- Direct mode always overrides `ANTHROPIC_BASE_URL` to DeepSeek

### Fixed
- Gateway test nesting (tests 9/10 were cancelled inside test 8)
- `RESONSE_API_KEY` typo → `RESPONSE_API_KEY`
- Release check gitignore for absent `.codeseeq/`
- Gateway `resolve` name shadowing
- Gateway startup detection (health polling replaces log text)
- Dockerfile JS pathing (now `/usr/local/bin/` unified)
- Docker healthcheck (no longer requires Open Responses)
- Docker Compose dependency (runner decoupled from Open Responses)
- `.env.example` stale defaults removed
- Model catalog default → `v4-flash`

### Added
- `VERSION` file
- `RELEASE-NOTES.md`
- `scripts/clean-local-artifacts.sh --release` mode
- `scripts/check.sh --release` mode
- Gateway token validation (401 on invalid/missing)
- Key-aware recursive log redaction
- Real SSE streaming relay test
- SSRF blocking expanded to 16 IPv4/IPv6 ranges

[0.2.1]: https://github.com/your-org/jeanclaude/releases/tag/v0.2.1
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] — 2026-05-11

### Added

- **Model profiles** — four curated profiles bundling DeepSeek models with thinking presets:
  - `v4-pro-thinking`: `deepseek-v4-pro` with max-effort thinking
  - `v4-pro`: `deepseek-v4-pro` with thinking disabled
  - `v4-flash-thinking`: `deepseek-v4-flash` with high-effort thinking
  - `v4-flash`: `deepseek-v4-flash` with thinking disabled
- **`JEANCLAUDE_MODEL_PROFILE`** env var (default `v4-flash`) to select the default profile.
- **`--profile`** CLI flag for per-command profile selection: `jeanclaude --profile v4-pro -p "review this"`.
- **Profile validation** — invalid profile names are rejected with a clear error message listing valid options.
- **`jeanclaude models`** command to list available model profiles.
- **Gateway process mode** — run the gateway as a host-native Node.js process (no Docker required).
  - Process lifecycle management (start, stop, PID tracking, health checks).
  - Keepalive option to persist the gateway between commands.
  - State directory: `.jeanclaude/gateway.pid` and `.jeanclaude/gateway.log`.
- **Gateway container mode** — run the gateway inside Docker Compose alongside the runner.
- **Gateway external mode** — connect JeanClaude to a user-managed gateway instance.
- **Auto execution mode** (`JEANCLAUDE_MODE=auto`) — auto-detects gateway availability and falls back to direct.
- **`jeanclaude gateway`** subcommands: `start`, `stop`, `status`, `logs`.
- New environment variables for gateway configuration:
  - `JEANCLAUDE_GATEWAY_MODE` (`process`, `container`, `external`)
  - `JEANCLAUDE_GATEWAY_HOST` (default `0.0.0.0`)
  - `JEANCLAUDE_GATEWAY_PORT` (default `8765`)
  - `JEANCLAUDE_GATEWAY_URL` (default `http://127.0.0.1:8765`)
  - `JEANCLAUDE_GATEWAY_KEEPALIVE` (default `1`)
  - `JEANCLAUDE_GATEWAY_LOG_LEVEL` (default `info`)
  - `JEANCLAUDE_GATEWAY_LOG_FILE`
  - `JEANCLAUDE_GATEWAY_PID_FILE` (default `.jeanclaude/gateway.pid`)
- **Deprecated aliases** section in config docs — `JEANCLAUDE_MODEL`, `JEANCLAUDE_PRO_MODEL`, `JEANCLAUDE_THINKING`, `JEANCLAUDE_REASONING_EFFORT` still work but are superseded by profiles.
- New documentation:
  - `docs/model-profiles.md` — model profiles guide with when-to-use guidance.
  - `docs/thinking-profiles.md` — thinking profiles, effort levels, direct vs gateway control.
  - `docs/execution-modes.md` — direct, gateway, and auto mode selection guide.
  - `docs/gateway-process-mode.md` — host-native gateway setup and management.
  - `docs/gateway-container-mode.md` — Docker gateway setup.
  - `docs/gateway-external-mode.md` — user-managed gateway connection.
- DeepSeek-only authentication hardening: parent `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are stripped; only `DEEPSEEK_API_KEY` is used.

### Changed

- **Default model profile** changed from `deepseek-v4-flash` (thinking disabled) to `v4-flash` (fast, no thinking).
- **`JEANCLAUDE_MODE`** now supports `auto` in addition to `direct` and `gateway`.
- Updated `docs/configuration.md` with all new env vars and deprecated aliases section.
- Updated `docs/architecture.md` with execution modes, gateway modes, state directories, and model profiles.
- Updated `docs/deepseek-setup.md` with model profile selection and per-profile guidance.
- Updated `docs/dangerous-mode.md` with explicit note that dangerous mode is never enabled by any default, profile, or mode.
- Updated `README.md` with model profiles, execution modes, gateway modes, and new CLI examples.
- Updated `SECURITY.md` with DeepSeek-only auth, parent env stripping, gateway local-only binding, and no Anthropic login flow.
- Expanded documentation table of contents with all new docs.

### Preserved

- All v0.2.1 features remain fully supported (Claude Code direct path, MCP tools, Open Responses, Docker Compose, smoke tests, security guardrails).
- Legacy env vars (`JEANCLAUDE_MODEL`, `JEANCLAUDE_PRO_MODEL`, `JEANCLAUDE_THINKING`, `JEANCLAUDE_REASONING_EFFORT`) continue to work alongside profiles.

## [0.2.1] — 2026-05-11

### Added

- **Initial release** of JeanClaude, an independent wrapper around Claude Code.
- Direct model path: Claude Code → DeepSeek Anthropic-compatible Messages API at `https://api.deepseek.com/anthropic`.
- MCP tools sidecar (`jeanclaude-tools`) with stdio JSON-RPC transport:
  - `deterministic_echo` — deterministic test tool for tool-loop validation.
  - `web_search` — Brave Search API integration via Open Responses.
  - `web_fetch` — URL content fetching with SSRF guardrails.
  - `document_ingest` — Document ingestion with plaintext and Unstructured-backed rich-format support.
  - `document_query` — Semantic document retrieval from local document store.
  - `document_ask` — Question answering over ingested documents via Open Responses.
  - `open_responses_response` — Direct Open Responses tool synthesis.
- Open Responses sidecar integration with Docker Compose (API, integrations, TimescaleDB, vectorizer worker, migrations).
- Docker Compose deployment with service isolation.
- Claude Code settings generation with DeepSeek model routing, thinking toggle, and MCP configuration.
- Model switching: `deepseek-v4-flash` (default), `deepseek-v4-pro`, `deepseek-v4-pro[1m]`.
- Extended thinking support with configurable effort levels (`high`, `max`).
- CLI wrapper (`./bin/jeanclaude`) with subcommands: `doctor`, `ping`, `run`, `claude`, `shell`, `config`, `serve`, `open-responses`, `tools`, `web-search`, `document`.
- Health check and doctor diagnostics.
- Pre-release check pipeline: `./scripts/check.sh`, `./scripts/package.sh --check`.
- Smoke test suite for model path, Claude Code integration, Open Responses, MCP tool loop, thinking+tools, web search, and document processing.
- Secret pattern scanning in CI checks.
- Package exclusion enforcement (no `.env`, `.claude`, build artifacts, or sensitive files in archives).
- Security guardrails:
  - MCP env allowlist (only required vars passed to subprocess).
  - `web_fetch` SSRF protections (localhost, RFC1918, link-local blocking).
  - Document ingestion path and pattern restrictions.
  - Secret redaction in debug output.
  - No secrets baked into Docker images.
- `.env.example` environment template with all configurable options.
- Model catalog (`config/model-catalog.json`) with supported models and reasoning effort tiers.
- Managed settings template with permission mode configuration.
- Drone CI pipeline for container builds.

[0.2.1]: https://github.com/your-org/jeanclaude/releases/tag/v0.2.1
[0.2.1]: https://github.com/your-org/jeanclaude/releases/tag/v0.2.1
