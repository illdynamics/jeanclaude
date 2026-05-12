# JeanClaude Release Notes

## v0.2.1 — 2026-05-12

### Licensing
- Project relicensed under **Apache License 2.0** — added `LICENSE`, `NOTICE`, and `license` field to `package.json`

### Security Fixes
- **Gateway mode no longer leaks `DEEPSEEK_API_KEY` to Claude child process** — child receives only local gateway token, gateway process handles upstream auth
- Secret scanner implemented — detects real API keys, bearer tokens, and credential patterns across the repo
- Parent Anthropic/Claude auth variables are now always stripped before launching Claude Code
- Direct mode always overrides `ANTHROPIC_BASE_URL` to DeepSeek endpoint, never inherits from parent

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
