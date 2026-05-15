# Security Model

This document describes JeanClaude's security architecture — the layers of protection, trust boundaries, and design decisions that keep your keys, code, and data safe.

## Trust Boundaries

```
┌─────────────────────────────────────────────────┐
│ Host Machine                                     │
│  ┌───────────────────────────────────────────┐  │
│  │ Docker                                      │  │
│  │  ┌─────────────────┐  ┌────────────────┐  │  │
│  │  │ jeanclaude-     │  │ Open Responses │  │  │
│  │  │ runner          │  │ services       │  │  │
│  │  │                 │  │                │  │  │
│  │  │ Claude Code ────┼──┤ MCP ──▶ Open   │  │  │
│  │  │        │        │  │        Resp.   │  │  │
│  │  │        ▼        │  │                │  │  │
│  │  │ DeepSeek API    │  │ Brave API      │  │  │
│  │  └─────────────────┘  │ Unstructured   │  │  │
│  │                        └────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  .env (API keys)                                │
│  ./workspace (mounted code)                     │
└─────────────────────────────────────────────────┘
```

### Trust Boundary 1: Host → Container

- API keys live on the host in `.env`
- Keys are passed to the container as environment variables at runtime
- Keys are **never** baked into Docker images
- The container runs as non-root user `jeanclaude` (UID 10001)
- The workspace is mounted read-write by default; use `:ro` for read-only mounts

### Trust Boundary 2: Container → External APIs

- Claude Code → DeepSeek API: authenticated via `x-api-key` header
- MCP tools → Brave Search API: authenticated via API key
- MCP tools → Unstructured API: authenticated via API key
- Open Responses → external providers: authenticated via provider keys

### Trust Boundary 3: Claude Code → MCP Server

- MCP communication is local stdio (no network)
- Only allowlisted environment variables are passed to the MCP subprocess
- `DEEPSEEK_API_KEY` is **not** passed to MCP
- MCP server runs as the same non-root user

### Trust Boundary 4: MCP → Open Responses

- Open Responses runs in a separate container
- Communication over internal Docker network
- Authenticated via `RESPONSE_API_KEY` (bearer token)
- No direct database access from MCP server

## Defense in Depth

### Layer 1: Secret Isolation

| Protection | Mechanism |
|---|---|
| No secrets in images | Runtime-only env vars |
| Secret redaction | Doctor/config output redacts API keys |
| Package exclusion | `.env` files excluded from archives |
| CI scanning | `check.sh` rejects committed secrets |
| MCP allowlist | Only required vars passed to subprocess |
| Key non-propagation | `DEEPSEEK_API_KEY` not passed to MCP |

### Layer 2: Filesystem Controls

| Protection | Mechanism |
|---|---|
| Non-root user | Container runs as UID 10001 |
| Docker HEALTHCHECK | Verifies service readiness |
| Read-only mounts | Option for sensitive host directories |
| Document guardrails | Block `.env`, key files, `.git/`, `secrets/` |
| Path restriction | Document ingestion limited to `/workspace` |
| Size limits | `JEANCLAUDE_MAX_INGEST_BYTES` cap |

### Layer 3: Network Controls

| Protection | Mechanism |
|---|---|
| SSRF prevention | `web_fetch` blocks localhost, RFC1918, link-local |
| Protocol restriction | `web_fetch` only allows HTTP(S) |
| Internal network | Open Responses on Docker internal network |
| Host-only port | Open Responses bound to `127.0.0.1:8080` |
| No telemetry | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` |
| Marketplace isolation | `CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL=1` |

### Layer 4: Permission Controls

| Protection | Mechanism |
|---|---|
| Auth mode | `JEANCLAUDE_AUTH_MODE` controls which credentials reach child Claude Code |
| Permission mode | `JEANCLAUDE_PERMISSION_MODE=safe` (default), `accept-edits`, `auto`, `dangerous` |
| Bypass env var | `CLAUDE_CODE_PERMISSION_MODE=bypassPermissions` set on child process when `-Y`/`--permission-mode bypassPermissions` active |
| Managed settings relaxation | `managed-settings.json` rewritten with `allowManagedPermissionRulesOnly: false` + `grant: ["**"]` when bypass active |
| Dangerous mode preflight | Triple opt-in: `JEANCLAUDE_DANGEROUS=1`, `JEANCLAUDE_I_UNDERSTAND_DANGEROUS_MODE=1`, container/CI or `JEANCLAUDE_ALLOW_HOST_DANGEROUS=1` |
| Container detection | `/.dockerenv`, `/run/.containerenv`, `/proc/1/cgroup`, CI vars |
| Managed settings | `disableBypassPermissionsMode: disable` by default |
| Bash restrictions | Deny `rm -rf /`, `sudo`, `curl | sh` |
| Git restrictions | Require approval for `git push`, force operations |
| Tool approval | Interactive prompts for filesystem and network tools |
| Dangerous mode | Documented risks; only for isolated environments |

### Layer 5: Operational Controls

| Protection | Mechanism |
|---|---|
| tini init | Proper signal handling, zombie reaping |
| Health checks | Container and database health monitoring |
| Image pinning | Reproducible builds with versioned base images |
| Production pruning | `npm prune --omit=dev` removes dev dependencies |
| Minimal packages | Only essential system packages in image |
| Build args | Configurable UID/GID, Claude Code version |

## Attack Surface Analysis

### What Claude Code Can Access

| Resource | Access | Controlled By |
|---|---|---|
| Mounted workspace | Read-write (default) | Volume mount configuration |
| DeepSeek API | Full (direct) | `DEEPSEEK_API_KEY` |
| MCP tools | Available tools only | `JEANCLAUDE_WEB_SEARCH`, `JEANCLAUDE_DOCUMENTS` |
| Open Responses | Via MCP, authenticated | `RESPONSE_API_KEY` |
| Brave Search | Via MCP or Open Responses | `BRAVE_API_KEY` |
| Unstructured API | Via MCP | `UNSTRUCTURED_API_KEY` |
| Host filesystem | Only mounted paths | Volume configuration |
| Host network | Container network only | Docker network config |
| Other containers | Docker network only | Compose network isolation |

### What Claude Code Cannot Access

- Host files outside mounted volumes
- Other Docker containers (without explicit network config)
- Host processes
- Docker socket (unless explicitly mounted — **don't do this**)
- `DEEPSEEK_API_KEY` from MCP context
- Open Responses database directly
- Host environment variables not passed to container

## Threat Scenarios

### Scenario: Malicious Model Output

**Threat:** DeepSeek model produces output designed to exploit the system.

**Mitigations:**
- Container isolation limits blast radius
- Non-root user prevents system-level changes
- Permission prompts require human approval (in non-yolo mode)
- Managed settings can force approval for dangerous operations

### Scenario: SSRF via web_fetch

**Threat:** Attacker crafts a prompt that causes `web_fetch` to access internal services.

**Mitigations:**
- Localhost/loopback blocked
- RFC 1918 private ranges blocked
- Link-local blocked
- Non-HTTP(S) blocked
- Requires explicit `JEANCLAUDE_ALLOW_LOCAL_FETCH=1` to disable

### Scenario: Secret Exfiltration via Document Ingestion

**Threat:** Claude Code ingests `.env` or key files into the document store, then exfiltrates.

**Mitigations:**
- `.env`, key files, `.git/`, `secrets/` blocked from ingestion
- Document store is local, not networked
- No automatic upload of document store contents

### Scenario: Container Escape

**Threat:** Attacker exploits a container runtime vulnerability.

**Mitigations:**
- Non-root user in container
- No privileged mode
- No host PID namespace access
- Minimal system packages
- Regular base image updates

## Configuring for Production

For production deployments, tighten these settings:

```bash
# .env
JEANCLAUDE_AUTH_MODE=auto                 # Or subscription if no Anthropic keys
JEANCLAUDE_PERMISSION_MODE=safe           # Never use dangerous on host
JEANCLAUDE_THINKING=disabled              # Conservative for coding-agent safety
JEANCLAUDE_MODE=direct                    # Avoid gateway unless needed
JEANCLAUDE_WEB_SEARCH=off                 # Enable only if needed
JEANCLAUDE_DOCUMENTS=off                  # Enable only if needed
JEANCLAUDE_ALLOW_LOCAL_FETCH=0            # Keep SSRF protections
JEANCLAUDE_LOG_LEVEL=warn                 # Minimize log output
JEANCLAUDE_DEBUG_BODY=0                   # Never debug response bodies
MEMORY_STORE_PASSWORD=<strong-random>     # Change from default
RESPONSE_API_KEY=<strong-random>          # Change from default

# Managed settings
# Keep disableBypassPermissionsMode: disable
```

### Additional Production Hardening

1. **Use read-only mounts for sensitive data:**
   ```yaml
   volumes:
     - ./config:/workspace/config:ro
   ```

2. **Restrict network egress** at the firewall level to only allowed API endpoints.

3. **Run in an isolated network:**
   ```yaml
   networks:
     jeanclaude-net:
       internal: true
   ```

4. **Pin all image digests** in `docker-compose.yml`:
   ```yaml
   open-responses:
     image: julepai/agents-api@sha256:abc123...
   ```

5. **Regularly rotate API keys** and update the `.env` file.

6. **Audit container logs** for unexpected behavior.

## See Also

- [`SECURITY.md`](../SECURITY.md) — Vulnerability reporting and security policy
- [`dangerous-mode.md`](./dangerous-mode.md) — Dangerous mode risks and safety patterns
- [`configuration.md`](./configuration.md) — All security-related env vars
- [`docker.md`](./docker.md) — Container isolation and volume mounts
