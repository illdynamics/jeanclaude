# Configuration

All JeanClaude configuration is done through environment variables. Set them in your `.env` file (copy from `.env.example`).

## Required Variables

| Variable | Description | Example |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API key for model calls | `sk-abc123...` |
| `RESPONSE_API_KEY` | Open Responses sidecar API key | `jrsp-dev-key-...` |

## Model Profile Configuration

The recommended way to configure models is through a **model profile**. A profile bundles a model with a thinking preset.

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_MODEL_PROFILE` | `v4-flash` | Model profile: `v4-pro-thinking`, `v4-pro`, `v4-flash-thinking`, or `v4-flash` |

```bash
# .env
JEANCLAUDE_MODEL_PROFILE=v4-flash
```

See [Model Profiles](./model-profiles.md) for detailed profile descriptions, backend mappings, and when to use each.

## Execution Mode

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_MODE` | `direct` | Execution mode: `direct`, `gateway`, or `auto` |

- **`direct`:** Claude Code talks to DeepSeek directly — no gateway, no Docker, no middleware.
- **`gateway`:** Routes through the JeanClaude gateway for policy enforcement and exact thinking control.
- **`auto`:** Auto-detects whether a gateway is reachable and chooses `gateway` if so, `direct` otherwise.

See [Execution Modes](./execution-modes.md) for the full mode guide.

## Gateway Configuration

When `JEANCLAUDE_MODE=gateway`, these variables control the gateway:

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_GATEWAY_MODE` | `process` | Gateway sub-mode: `process`, `container`, or `external` |
| `JEANCLAUDE_GATEWAY_HOST` | `0.0.0.0` | Interface the gateway listens on |
| `JEANCLAUDE_GATEWAY_PORT` | `8765` | Port the gateway listens on |
| `JEANCLAUDE_GATEWAY_URL` | `http://127.0.0.1:8765` | Full URL for gateway connection (used in external mode) |
| `JEANCLAUDE_GATEWAY_KEEPALIVE` | `1` | Keep gateway process running between commands (process mode) |
| `JEANCLAUDE_GATEWAY_LOG_LEVEL` | `info` | Gateway log verbosity: `debug`, `info`, `warn`, `error` |
| `JEANCLAUDE_GATEWAY_LOG_FILE` | *(stderr)* | Path to gateway log file |
| `JEANCLAUDE_GATEWAY_PID_FILE` | `.jeanclaude/gateway.pid` | PID file for gateway process management |

See the gateway mode docs for per-mode details:
- [Gateway Process Mode](./gateway-process-mode.md)
- [Gateway Container Mode](./gateway-container-mode.md)
- [Gateway External Mode](./gateway-external-mode.md)

## Legacy Model Configuration (Deprecated)

These variables are maintained for backward compatibility but are superseded by `JEANCLAUDE_MODEL_PROFILE`. See the [deprecated aliases](#deprecated-aliases) section below.

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_MODEL` | `deepseek-v4-flash` | (Deprecated) Default model for Claude Code |
| `JEANCLAUDE_PRO_MODEL` | `deepseek-v4-pro` | (Deprecated) Premium model for complex tasks |
| `JEANCLAUDE_ANTHROPIC_BASE_URL` | `https://api.deepseek.com/anthropic` | Anthropic-compatible API endpoint |

### Supported Models (Raw)

When using raw model selection instead of profiles:

| Model ID | Description |
|---|---|
| `deepseek-v4-flash` | Fast, cost-effective. Best for interactive coding, refactoring, tests. |
| `deepseek-v4-pro` | Higher capability. Use for architecture reviews, complex debugging, design work. |
| `deepseek-v4-pro (1M context, internal only)` | Pro model with 1M token context window. For very large codebases or long conversations. |

## Thinking Configuration

When using raw model selection (not profiles), these control thinking:

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_THINKING` | `disabled` | Extended thinking toggle. `enabled` or `disabled`. |
| `JEANCLAUDE_REASONING_EFFORT` | `high` | Reasoning depth when thinking is enabled. `high` or `max`. |

When using model profiles, thinking and effort are set automatically by the profile. Use `--thinking`/`--no-thinking`/`--effort` CLI flags to override.

Extended thinking allows Claude Code to spend more tokens on chain-of-thought reasoning before producing output. This improves results on complex problems but increases latency and cost.

**⚠️ Note:** Thinking with tools is experimental. Keep `JEANCLAUDE_THINKING=disabled` unless `smoke-thinking-tool-loop.sh` passes in your environment. Some DeepSeek API versions return 400 errors when thinking is enabled alongside tool calls.

See [Thinking Profiles](./thinking-profiles.md) for full details on how thinking works in direct vs gateway modes.

## Open Responses (Sidecar)

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_OPEN_RESPONSES_URL` | `http://open-responses:8080` | Container-network URL for the Open Responses sidecar. |
| `JEANCLAUDE_OPEN_RESPONSES_PUBLIC_URL` | `http://127.0.0.1:8080` | Host-accessible URL for the Open Responses sidecar. Used for debugging from outside the container. |
| `JEANCLAUDE_OPEN_RESPONSES_MODEL` | *(auto)* | Override the model used for tool synthesis. Defaults to your `JEANCLAUDE_MODEL` preference. Format: `provider/model`, e.g., `deepseek/deepseek-v4-flash`. |
| `JEANCLAUDE_OPEN_RESPONSES_READY_TIMEOUT` | `45` | Maximum seconds to wait for Open Responses to become ready. |
| `OPEN_RESPONSES_IMAGE` | `julepai/agents-api` | Docker image for the Open Responses API service. |
| `OPEN_RESPONSES_TAG` | `responses-latest` | Docker image tag for Open Responses services. |

## Web Search

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_WEB_SEARCH` | `off` | Enable web search via MCP. Set to `on` to activate `web_search` and `web_fetch` tools. |
| `BRAVE_API_KEY` | — | Brave Search API key. Required when `JEANCLAUDE_WEB_SEARCH=on`. Get one at [brave.com/search/api](https://brave.com/search/api/). |
| `JEANCLAUDE_ALLOW_LOCAL_FETCH` | — | Set to `1` to disable SSRF protections on `web_fetch` (allows fetching localhost and private IPs). **Only for development.** |

## Document Processing

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_DOCUMENTS` | `off` | Enable document ingestion and querying via MCP. Set to `on` to activate `document_ingest`, `document_query`, and `document_ask`. |
| `UNSTRUCTURED_API_KEY` | — | Unstructured API key. Required for rich-format partitioning (PDF, DOCX, PPTX, images). Get one at [unstructured.io](https://unstructured.io/). |
| `UNSTRUCTURED_API_URL` | `https://api.unstructuredapp.io/general/v0/general` | Unstructured API endpoint. |
| `JEANCLAUDE_DOCUMENT_STORE` | `/workspace/.jeanclaude/documents` | Local path for the document index and chunk storage. |
| `JEANCLAUDE_MAX_INGEST_BYTES` | *(built-in)* | Maximum file size for document ingestion. Files exceeding this are rejected. |

## Permission Mode

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_PERMISSION_MODE` | `default` | Claude Code permission mode. `default` uses the configured permissions in `settings.json`. `bypassPermissions` disables all permission prompts (equivalent to `--yolo`). **Only use in sandboxed environments.** |

See [`dangerous-mode.md`](./dangerous-mode.md) for important safety warnings.

## Debug and Logging

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_LOG_LEVEL` | `info` | Log verbosity. Supported: `debug`, `info`, `warn`, `error`. |
| `JEANCLAUDE_DEBUG_BODY` | `0` | Set to `1` to include response bodies in debug output. Secrets are redacted where possible. |

## Docker Build

| Variable | Default | Description |
|---|---|---|
| `CLAUDE_CODE_NPM_VERSION` | `latest` | Claude Code npm version to install in the image. Pin to a specific version for reproducibility. |
| `HOST_UID` | `1000` | Host user ID for bind mount permissions. |
| `HOST_GID` | `1000` | Host group ID for bind mount permissions. |

## Open Responses Provider Env (Advanced)

These are passed through to the Open Responses sidecar for multi-provider support. Only needed if you use providers other than DeepSeek through the Open Responses tool path.

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | OpenAI API key for Open Responses provider. |
| `ANTHROPIC_API_KEY` | — | Anthropic API key for Open Responses provider. |
| `OPENROUTER_API_KEY` | — | OpenRouter API key for multi-provider routing. |
| `EMBEDDING_MODEL_ID` | `openai/text-embedding-3-large` | Embedding model for document vectorization. |
| `MEMORY_STORE_PASSWORD` | `obviously_not_a_safe_password` | PostgreSQL password for the Open Responses database. **Change this for production.** |

## Deprecated Aliases

The following variables are maintained for backward compatibility. They still work but are superseded by newer variables.

| Deprecated Variable | Superseded By | Notes |
|---|---|---|
| `JEANCLAUDE_MODEL` | `JEANCLAUDE_MODEL_PROFILE` | Use `JEANCLAUDE_MODEL_PROFILE=v4-flash` instead of `JEANCLAUDE_MODEL=deepseek-v4-flash` |
| `JEANCLAUDE_PRO_MODEL` | `JEANCLAUDE_MODEL_PROFILE` | Use `JEANCLAUDE_MODEL_PROFILE=v4-pro` instead of `JEANCLAUDE_PRO_MODEL=deepseek-v4-pro` |
| `JEANCLAUDE_THINKING` | Built into profile | Set by profile. Override with `--thinking`/`--no-thinking` CLI flags |
| `JEANCLAUDE_REASONING_EFFORT` | Built into profile | Set by profile. Override with `--effort` CLI flag |

If both a deprecated variable and its replacement are set, the replacement takes precedence.

## CLI Overrides

Some variables can be overridden at runtime via CLI flags:

```bash
# Model profile
jeanclaude --profile v4-pro -p "review this"

# Legacy model override
jeanclaude --model deepseek-v4-pro -p "review this"

# Enable thinking
jeanclaude --thinking -p "solve this hard problem"

# Disable thinking
jeanclaude --no-thinking -p "quick fix"

# Set effort level
jeanclaude --effort max -p "deep analysis"

# Execution mode
jeanclaude --jeanclaude-mode gateway --gateway-mode process -p "policy-enforced"

# Gateway management
jeanclaude gateway start
jeanclaude gateway status
jeanclaude gateway stop
jeanclaude gateway logs

# List available models
jeanclaude models
```

## Example: Full Production .env

```bash
# Required
DEEPSEEK_API_KEY=sk-prod-deepseek-key
RESPONSE_API_KEY=a8f3c9e1b4d2076f5a3c8e9d1b4f6072

# Model Profile (recommended)
JEANCLAUDE_MODEL_PROFILE=v4-flash

# Execution Mode
JEANCLAUDE_MODE=direct

# Sidecar
JEANCLAUDE_OPEN_RESPONSES_URL=http://open-responses:8080
JEANCLAUDE_OPEN_RESPONSES_PUBLIC_URL=http://127.0.0.1:8080

# Features (enable as needed)
JEANCLAUDE_WEB_SEARCH=on
BRAVE_API_KEY=BSA-your-brave-key
JEANCLAUDE_DOCUMENTS=on
UNSTRUCTURED_API_KEY=your-unstructured-key

# Security
JEANCLAUDE_PERMISSION_MODE=default
MEMORY_STORE_PASSWORD=strong-random-password-here

# Debug
JEANCLAUDE_LOG_LEVEL=warn
JEANCLAUDE_DEBUG_BODY=0
```
