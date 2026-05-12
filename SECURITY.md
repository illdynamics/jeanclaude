# Security Policy

## Reporting a Vulnerability

**Do not open a public issue.** To report a security vulnerability, email the maintainers directly at:

```
security@jeanclaude.dev
```

(If this address is not yet configured, contact the project maintainers through the repository's private vulnerability reporting channel.)

Please include:

- A clear description of the vulnerability
- Steps to reproduce
- Affected versions
- Any suggested mitigations

We aim to acknowledge reports within 48 hours and provide an initial assessment within 5 business days.

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x | ✅ Supported (security patches) |
| 0.2.x | ✅ Supported (current) |

Only the latest minor release receives security patches. The `main` branch may contain unreleased changes and is not considered stable for production use.

## Authentication Model: DeepSeek-Only

JeanClaude authenticates Claude Code **only** through DeepSeek's Anthropic-compatible endpoint using `DEEPSEEK_API_KEY`. No Anthropic API key or Anthropic login flow is used.

### What JeanClaude Does

1. Reads `DEEPSEEK_API_KEY` from the environment
2. Sets `ANTHROPIC_AUTH_TOKEN=$DEEPSEEK_API_KEY` for Claude Code
3. Sets `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic`
4. Claude Code uses these to authenticate with DeepSeek's API

### Parent Anthropic Auth Stripping

JeanClaude **strips** any pre-existing Anthropic auth variables from the environment before passing them to Claude Code:

| Variable | JeanClaude Behavior |
|---|---|
| `ANTHROPIC_API_KEY` | **Stripped.** Not passed to Claude Code. |
| `ANTHROPIC_AUTH_TOKEN` | **Overwritten** with `DEEPSEEK_API_KEY`. |
| `ANTHROPIC_BASE_URL` | **Overwritten** with `https://api.deepseek.com/anthropic`. |

This ensures Claude Code can never accidentally reach `api.anthropic.com` or use an Anthropic API key. All model traffic goes through DeepSeek.

### No Anthropic Login Flow

JeanClaude does **not** support Anthropic's OAuth login flow (`claude login`). The only supported authentication path is `DEEPSEEK_API_KEY`. If Claude Code attempts an Anthropic login, it will fail because `ANTHROPIC_BASE_URL` points to DeepSeek, not Anthropic.

## Dangerous Mode Risks

JeanClaude supports Claude Code's `--yolo`/`-Y` dangerous mode, which automatically approves all tool calls without prompting.

**Dangerous mode is never enabled by default.** No model profile, thinking profile, or execution mode ever implies dangerous mode. It must be explicitly activated by the operator.

**Dangerous mode should only be used in:**

- Isolated Docker containers with no access to sensitive host resources
- Disposable virtual machines
- Ephemeral Git worktrees with no push access
- CI/CD sandboxes with restricted network egress

**Never use dangerous mode:**

- On production servers
- On machines with access to production secrets, databases, or infrastructure
- With filesystem mounts that expose sensitive host directories
- With `JEANCLAUDE_PERMISSION_MODE` set to `bypassPermissions` outside of sandboxed environments
- In shared environments where other users or services could be affected

By default, JeanClaude's managed settings disable bypass permissions mode (`"disableBypassPermissionsMode": "disable"`). You must explicitly configure and understand the risks before enabling it.

## Secret Redaction Policy

JeanClaude implements secret redaction at multiple layers:

- **Doctor/config output:** API keys are redacted (displayed as `sk-a***b12`).
- **Debug logs:** Sensitive headers and key patterns are redacted where possible.
- **Package builds:** `.env`, `.env.*`, `.claude.json`, `.mcp.local.json`, and build artifacts are excluded from archives.
- **CI checks:** `./scripts/check.sh` runs a secret-pattern scan that rejects commits containing real-looking API keys.
- **MCP subprocess:** Only an allowlisted set of environment variables is passed to the MCP server. `DEEPSEEK_API_KEY` is not passed by default.

**Best practices:**

- Never commit `.env` files. Use `.env.example` as a template.
- Rotate API keys regularly.
- Use environment-specific keys (development keys should not overlap with production).
- Review `./scripts/check.sh` output before committing.

## No Telemetry

JeanClaude does not include any telemetry, analytics, or usage tracking. Specifically:

- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` is set by default.
- `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL=1` is set by default.
- `npm_config_update_notifier=false` is set in the Docker image.
- No data is sent to JeanClaude maintainers, DeepSeek (beyond API calls), or any third party beyond the services you explicitly configure (Open Responses, Brave Search, Unstructured).

The only outbound network traffic JeanClaude generates is:

1. API calls to `https://api.deepseek.com/anthropic` (your model requests)
2. API calls to your configured Open Responses sidecar
3. Web search requests to Brave Search API (if `JEANCLAUDE_WEB_SEARCH=on` and `BRAVE_API_KEY` is set)
4. Document partitioning requests to Unstructured API (if `JEANCLAUDE_DOCUMENTS=on` and `UNSTRUCTURED_API_KEY` is set)

## Gateway Security

### Local-Only Binding

When running in gateway process mode or gateway container mode, the JeanClaude gateway binds to `127.0.0.1` by default. This means:

- The gateway is only reachable from the local machine
- Remote hosts cannot connect to the gateway
- No external exposure of the gateway port

If you bind to `0.0.0.0` (e.g., `JEANCLAUDE_GATEWAY_HOST=0.0.0.0`), the gateway port is exposed to the network. Only do this in trusted environments and use a firewall or VPN.

### External Gateway Mode

When connecting to an external gateway (`JEANCLAUDE_GATEWAY_MODE=external`):

- Use TLS (HTTPS) for the connection
- Authenticate the gateway (e.g., mutual TLS, API key)
- Do not expose the gateway to the public internet

## MCP Environment Allowlist

The MCP server subprocess (`jeanclaude-tools`) receives only these environment variables:

- `JEANCLAUDE_OPEN_RESPONSES_URL`
- `RESPONSE_API_KEY`
- `JEANCLAUDE_WEB_SEARCH`
- `JEANCLAUDE_DOCUMENTS`
- `JEANCLAUDE_DOCUMENT_STORE`
- `BRAVE_API_KEY`
- `UNSTRUCTURED_API_KEY`
- `UNSTRUCTURED_API_URL`

`DEEPSEEK_API_KEY` is **not** passed to MCP by default. The MCP server never makes direct model API calls.

## Web Fetch SSRF Controls

The `web_fetch` MCP tool blocks requests to:

- Localhost / loopback addresses (`127.0.0.0/8`, `::1`)
- RFC 1918 private IPv4 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- Link-local ranges (`169.254.0.0/16`)
- Non-HTTP(S) protocols

These restrictions can only be bypassed by explicitly setting `JEANCLAUDE_ALLOW_LOCAL_FETCH=1`.

## Document Ingestion Guardrails

Document ingestion blocks:

- Paths outside `/workspace`
- `.env`, `.env.*` files
- `*.pem`, `*.key`, `id_rsa`, `id_ed25519` key files
- Paths under `.git/`, `secrets/`, `node_modules/`
- Files exceeding `JEANCLAUDE_MAX_INGEST_BYTES`

## Docker Image Security

- No secrets are baked into Docker images.
- The container runs as a non-root user (`jeanclaude`, UID 10001).
- `tini` is used as the init process for proper signal handling.
- Health checks verify service readiness.
- Images are built from `node:22-bookworm-slim` with minimal additional packages.

## Dependency Management

- Claude Code (`@anthropic-ai/claude-code`) is installed from npm at build time.
- MCP tools use production-only dependencies (`npm prune --omit=dev`).
- Open Responses uses upstream Docker images (`julepai/agents-api`, `julepai/integrations`).

## Responsible Disclosure

We appreciate the security community's efforts in identifying and reporting vulnerabilities. We commit to:

- Not pursuing legal action against researchers who follow responsible disclosure practices.
- Crediting researchers who report valid vulnerabilities (with their permission).
- Providing timely fixes for confirmed vulnerabilities.

Thank you for helping keep JeanClaude and its users secure.
