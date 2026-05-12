# Architecture

JeanClaude wraps Claude Code and routes it through DeepSeek's Anthropic-compatible API, with a local MCP tools sidecar for web search, document processing, and Open Responses synthesis.

## High-Level Data Flow

```
Operator (host)
  │
  ├─ ./bin/jeanclaude ──▶ docker compose run jeanclaude-runner
  │
  └─▶ Container: jeanclaude-runner
        │
        ├─▶ Claude Code (npm global)
        │     │
        │     ├─ Direct model path ──▶ https://api.deepseek.com/anthropic
        │     │                         └─ POST /v1/messages
        │     │                            Headers: x-api-key, anthropic-version
        │     │
        │     ├─ Gateway path (optional) ──▶ Gateway (8765) ──▶ DeepSeek API
        │     │
        │     └─ MCP path ──▶ stdio ──▶ /opt/jeanclaude/tools/dist/mcp-server.js
        │                              │
        │                              ├─▶ Open Responses (http://open-responses:8080)
        │                              │     ├─ /v1/responses (POST/GET)
        │                              │     ├─ Brave Search integration
        │                              │     └─ Response synthesis
        │                              │
        │                              ├─▶ Brave Search API (direct fallback)
        │                              └─▶ Unstructured API (document partitioning)
        │
        └─▶ Gateway (optional, port 8765)
              └─▶ DeepSeek API (policy enforcement, exact thinking control)
```

## Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Docker Compose                                               │
│                                                              │
│  ┌───────────────────────┐   ┌───────────────────────────┐  │
│  │ jeanclaude-runner     │   │ Open Responses Stack       │  │
│  │                       │   │                            │  │
│  │ • Claude Code         │   │  ┌─────────────────────┐  │  │
│  │ • MCP tools server    │───┤──│ open-responses      │  │  │
│  │ • Gateway (optional)  │   │  │ (port 8080)         │  │  │
│  │ • Health checks       │   │  └────────┬────────────┘  │  │
│  │                       │   │           │               │  │
│  │ Mounts:               │   │  ┌────────▼────────────┐  │  │
│  │  . → /workspace       │   │  │ open-responses-db   │  │  │
│  │  volume → /home       │   │  │ (TimescaleDB PG17)  │  │  │
│  └───────────────────────┘   │  └─────────────────────┘  │  │
│                               │                            │  │
│                               │  ┌─────────────────────┐  │  │
│                               │  │ integrations        │  │  │
│                               │  │ vectorizer-worker   │  │  │
│                               │  │ migration (run-once)│  │  │
│                               │  └─────────────────────┘  │  │
│                               └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Execution Modes

JeanClaude supports four execution modes. See [Execution Modes](./execution-modes.md) for the full guide.

| Mode | Gateway | Docker Required | Description |
|---|---|---|---|
| **Direct** (default) | No | No | Claude Code → DeepSeek directly |
| **Gateway Process** | Yes | No | Host-native gateway on 127.0.0.1:8765 |
| **Gateway Container** | Yes | Yes | Gateway inside Docker alongside runner |
| **Gateway External** | Yes | No | Connects to user-managed gateway |
| **Auto** | Auto-detect | Maybe | Tries gateway, falls back to direct |

## Core LLM Path (Direct Mode, Default)

```
Claude Code → DeepSeek Anthropic API
```

### Environment Mapping

| Claude Code expects | JeanClaude sets |
|---|---|
| `ANTHROPIC_BASE_URL` | `https://api.deepseek.com/anthropic` |
| `ANTHROPIC_AUTH_TOKEN` | `$DEEPSEEK_API_KEY` |
| `ANTHROPIC_MODEL` | Resolved from model profile |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | `deepseek-v4-pro` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `deepseek-v4-pro` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `deepseek-v4-flash` |

### Request Flow

1. Claude Code formulates an Anthropic Messages API request
2. Claude Code reads `ANTHROPIC_BASE_URL` → sends to DeepSeek
3. Claude Code uses `ANTHROPIC_AUTH_TOKEN` as `x-api-key` header
4. DeepSeek processes the request and returns a Messages-format response
5. Claude Code processes the response (streaming, tool calls, text)

No proxy, no middleware, no protocol translation. Claude Code talks directly to DeepSeek.

## Tool Path (MCP)

```
Claude Code → MCP stdio → jeanclaude-tools → Open Responses / Brave / Unstructured
```

### MCP Server

- Binary: `/opt/jeanclaude/tools/dist/mcp-server.js`
- Transport: Newline-delimited JSON-RPC over stdio
- User: Non-root (`jeanclaude`, UID 10001)
- Env: Allowlisted subset only (no `DEEPSEEK_API_KEY`)

### MCP Configuration

Generated at container startup and placed at:
- `$JEANCLAUDE_CLAUDE_HOME/.mcp.json` (user config)
- `/workspace/.mcp.json` (project-level discovery)

Claude Code discovers MCP servers from these locations and connects via stdio.

### Tool Flow

1. Claude Code calls an MCP tool (e.g., `web_search`)
2. MCP server receives the call via JSON-RPC
3. MCP server routes to the appropriate handler:
   - `web_search` → Open Responses → Brave Search API (or direct fallback)
   - `web_fetch` → Direct HTTP fetch with SSRF guards
   - `document_ingest` → Local document store (+ Unstructured API for rich formats)
   - `document_query` → Local document store search
   - `document_ask` → Document store retrieval → Open Responses synthesis
   - `open_responses_response` → Open Responses tool-backed synthesis
4. Result is returned to Claude Code via JSON-RPC response

## Gateway Path (Optional)

```
Claude Code → JeanClaude gateway (8765) → DeepSeek API
```

The gateway provides an optional policy enforcement and observability layer between Claude Code and DeepSeek:

- **Thinking policy enforcement:** Rewrites every request to guarantee your configured thinking and effort levels
- **Request/response inspection:** Full visibility into traffic
- **Health checks:** `/healthz` endpoint for readiness probing
- **Protocol endpoints:** `/v1/messages`, `/v1/messages/count_tokens`

Gateway mode is optional. Default mode is `direct` — the gateway is not used unless `JEANCLAUDE_MODE=gateway` or `JEANCLAUDE_MODE=auto` with a reachable gateway.

The gateway can run in three sub-modes:

| Sub-mode | Manager | Location |
|---|---|---|
| **Process** | JeanClaude | Host-native Node.js process |
| **Container** | JeanClaude | Inside Docker Compose |
| **External** | You | Any reachable host |

See the gateway mode docs for per-mode details:
- [Gateway Process Mode](./gateway-process-mode.md)
- [Gateway Container Mode](./gateway-container-mode.md)
- [Gateway External Mode](./gateway-external-mode.md)

### Gateway Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/v1/messages` | POST | Anthropic Messages API proxy |
| `/v1/messages/count_tokens` | POST | Token counting passthrough |
| `/healthz` | GET | Health check (`{"ok": true, "mode": "gateway"}`) |

All other paths return 404.

### Gateway Request Flow

```
1. Claude Code → POST /v1/messages → Gateway (127.0.0.1:8765)
2. Gateway reads request body, applies thinking policy
3. Gateway → POST /v1/messages → DeepSeek (api.deepseek.com/anthropic)
4. DeepSeek → Streaming response → Gateway
5. Gateway relays response (streaming, tool calls, text) → Claude Code
```

The gateway does **not** modify model selection, messages content, tool definitions/results, or system prompts. It only enforces thinking policy and relays everything else verbatim.

## State Directories

JeanClaude maintains runtime state under `.jeanclaude/` in the project root:

```text
.jeanclaude/
  ├── gateway.pid       # Gateway process PID (process mode)
  └── gateway.log       # Gateway logs (when file logging is enabled)

/home/jeanclaude/.claude/
  ├── settings.json     # Claude Code settings (generated at startup)
  └── .mcp.json         # MCP server registration

/workspace/.jeanclaude/
  └── documents/        # Document store index and chunks
```

## Compose Services

| Service | Role | Network |
|---|---|---|
| `jeanclaude-runner` | Claude Code + MCP tools + gateway | Internal + host |
| `open-responses` | Open Responses API (port 8080) | Internal + `127.0.0.1:8080` |
| `open-responses-integrations` | Tool integration service | Internal only |
| `open-responses-db` | PostgreSQL/TimescaleDB (PG17) | Internal only |
| `open-responses-vectorizer-worker` | pgai vector embedding worker | Internal only |
| `open-responses-migration` | Database migration runner (run-once) | Internal only |

### Service Dependencies

```
jeanclaude-runner
  └── open-responses (condition: service_started)

open-responses
  ├── open-responses-db (condition: service_healthy)
  └── open-responses-integrations (condition: service_started)

open-responses-migration
  └── open-responses-db (condition: service_healthy)
```

## Startup Sequence

1. `docker compose up` starts all services
2. `open-responses-db` starts first, becomes healthy
3. `open-responses-migration` runs database migrations, exits
4. `open-responses-integrations` starts
5. `open-responses` starts, becomes ready
6. `jeanclaude-runner` entrypoint runs:
   - Validates environment
   - Resolves model profile → sets Anthropic env vars for Claude Code
   - Starts gateway if `JEANCLAUDE_MODE=gateway` and `JEANCLAUDE_GATEWAY_MODE=process`
   - Writes `settings.json` and `.mcp.json`
   - Waits for Open Responses (up to 45s timeout)
   - Executes the requested command

## Model Profiles

JeanClaude uses four model profiles that bundle a DeepSeek model with a thinking preset:

| Profile | Model | Thinking |
|---|---|---|
| `v4-pro-thinking` | `deepseek-v4-pro` | enabled, effort `max` |
| `v4-pro` | `deepseek-v4-pro` | disabled |
| `v4-flash-thinking` | `deepseek-v4-flash` | enabled, effort `high` |
| `v4-flash` | `deepseek-v4-flash` | disabled |

Default: `v4-flash`. See [Model Profiles](./model-profiles.md) for the full guide.

## Model Catalog

Defined in `config/model-catalog.json`:

```json
{
  "profiles": {
    "v4-flash": { "internal": "deepseek/deepseek-v4-flash" },
    "v4-flash-thinking": { "internal": "deepseek/deepseek-v4-flash", "reasoningEffort": "high" },
    "v4-pro": { "internal": "deepseek/deepseek-v4-pro" },
    "v4-pro-thinking": { "internal": "deepseek/deepseek-v4-pro", "reasoningEffort": "high" }
  },
  "default": "v4-flash",
  "reasoningEfforts": ["high", "max"],
  "thinkingDefault": "disabled"
}
```

## Security Posture

- **No secrets in images**: All API keys are runtime-only, passed via environment.
- **Non-root user**: Container runs as UID 10001.
- **MCP env allowlist**: Only required variables passed to MCP subprocess.
- **SSRF prevention**: `web_fetch` blocks localhost, RFC1918, link-local, non-HTTP.
- **Document guardrails**: `.env`, key files, `.git/`, `secrets/` blocked from ingestion.
- **Secret redaction**: API keys redacted in debug/config output.
- **Package hygiene**: `.env`, `.claude`, build artifacts excluded from archives.
- **No telemetry**: `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`.
- **Managed settings**: `disableBypassPermissionsMode: disable` by default.
- **Gateway local-only binding**: Gateway binds to `127.0.0.1` by default; no external exposure.
- **DeepSeek-only auth**: Only `DEEPSEEK_API_KEY` is used; parent Anthropic auth variables are stripped.

See [`security-model.md`](./security-model.md) for complete security architecture.

## Claude Code Settings

Generated at `$JEANCLAUDE_CLAUDE_HOME/settings.json` at container startup:

```json
{
  "model": "deepseek-v4-pro",
  "availableModels": ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-v4-pro (1M context, internal only)"],
  "autoMemoryEnabled": false,
  "includeGitInstructions": true,
  "disableRemoteControl": true,
  "disableAllHooks": true,
  "disableSkillShellExecution": true,
  "enabledMcpjsonServers": ["jeanclaude-tools"],
  "permissions": {
    "deny": ["Bash(rm -rf /)", "Bash(sudo *)", "Bash(curl * | sh)", ...],
    "ask": ["Bash(git push *)", "Bash(docker *)", "Bash(kubectl *)", ...],
    "allow": ["Read", "Glob", "Grep", "LS", "Edit", "Write", ...]
  }
}
```

The model in settings reflects the resolved profile (e.g., `v4-flash` resolves to `deepseek-v4-flash`).

## Related Documentation

- [Configuration Reference](./configuration.md) — All environment variables
- [Model Profiles](./model-profiles.md) — Profile guide and selection
- [Thinking Profiles](./thinking-profiles.md) — Extended thinking guide
- [Execution Modes](./execution-modes.md) — Direct, gateway, and auto modes
- [Gateway Process Mode](./gateway-process-mode.md) — Host-native gateway
- [Gateway Container Mode](./gateway-container-mode.md) — Docker gateway
- [Gateway External Mode](./gateway-external-mode.md) — User-managed gateway
- [DeepSeek Setup](./deepseek-setup.md) — Model backend setup
- [MCP Tools](./mcp-tools.md) — Tool reference
- [Open Responses](./open-responses.md) — Sidecar integration
- [Security Model](./security-model.md) — Security architecture
- [Docker Usage](./docker.md) — Container management
- [CLI Compatibility](./cli-compatibility.md) — Claude Code CLI mapping
