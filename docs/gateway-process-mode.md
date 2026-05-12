# Gateway Process Mode

Gateway process mode runs the JeanClaude gateway as a **host-native Node.js process** managed by JeanClaude. No Docker required.

## Architecture

```
jeanclaude CLI
  │
  ├── Starts gateway process (Node.js)
  │     │
  │     └── HTTP server on 127.0.0.1:8765
  │           ├── /v1/messages           (Anthropic Messages proxy)
  │           ├── /v1/messages/count_tokens
  │           └── /healthz               (health check)
  │
  └── Sets ANTHROPIC_BASE_URL=http://127.0.0.1:8765
        │
        └── Claude Code → Gateway → DeepSeek API
```

Claude Code connects to the gateway at `http://127.0.0.1:8765`. The gateway forwards requests to `https://api.deepseek.com/anthropic`, applying thinking policy on every request.

## Quickstart

```bash
# 1. Start the gateway
jeanclaude gateway start --gateway-mode process

# 2. Verify it's running
jeanclaude gateway status
# Expected: {"ok": true, "mode": "gateway"}

# 3. Run a command through the gateway
jeanclaude --jeanclaude-mode gateway --gateway-mode process -p "explain this repo"

# 4. Stop when done
jeanclaude gateway stop
```

## How Process Management Works

JeanClaude manages the gateway lifecycle:

1. **Start:** JeanClaude spawns `node gateway/dist/server.js` as a child process
2. **PID tracking:** The process PID is written to `JEANCLAUDE_GATEWAY_PID_FILE` (default: `.jeanclaude/gateway.pid`)
3. **Health check:** JeanClaude polls `http://127.0.0.1:8765/healthz` until the gateway responds `200 OK`
4. **Keepalive:** If `JEANCLAUDE_GATEWAY_KEEPALIVE=1` (default), the gateway stays running between commands
5. **Stop:** `jeanclaude gateway stop` sends SIGTERM to the tracked PID

### Keepalive vs Ephemeral

| Setting | Behavior |
|---|---|
| `JEANCLAUDE_GATEWAY_KEEPALIVE=1` (default) | Gateway stays running between commands. Faster for repeated use. |
| `JEANCLAUDE_GATEWAY_KEEPALIVE=0` | Gateway starts fresh for each command, exits when done. Cleaner but slower. |

## Thinking Policy Enforcement

The gateway rewrites every `/v1/messages` request body to enforce your thinking configuration:

```text
JEANCLAUDE_THINKING=enabled  →  Injects {"thinking": {"type": "enabled"}}
JEANCLAUDE_THINKING=disabled →  Ensures {"thinking": {"type": "disabled"}}
```

Effort level is set from `JEANCLAUDE_REASONING_EFFORT` (default: `high`).

This means your thinking policy is **deterministic** — the gateway guarantees what DeepSeek receives, regardless of what Claude Code might request.

See [Thinking Profiles](./thinking-profiles.md) for details on how thinking works.

## Request Flow

```text
1. Claude Code → POST /v1/messages → Gateway (127.0.0.1:8765)
2. Gateway reads request body, applies thinking policy
3. Gateway → POST /v1/messages → DeepSeek (api.deepseek.com/anthropic)
4. DeepSeek → Streaming response → Gateway
5. Gateway relays response (streaming, tool calls, text) → Claude Code
```

The gateway does **not** modify:
- Model selection
- Messages content
- Tool definitions or tool results
- System prompts

The gateway **only** enforces the thinking policy and relays everything else verbatim.

## Logging

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_GATEWAY_LOG_LEVEL` | `info` | Gateway log verbosity: `debug`, `info`, `warn`, `error` |
| `JEANCLAUDE_GATEWAY_LOG_FILE` | *(stderr)* | Write gateway logs to a file. Defaults to stderr. |

```bash
# Debug gateway traffic
JEANCLAUDE_GATEWAY_LOG_LEVEL=debug jeanclaude gateway start

# Log to file
JEANCLAUDE_GATEWAY_LOG_FILE=/tmp/jeanclaude-gateway.log jeanclaude gateway start
```

## Environment Configuration

```bash
# .env
JEANCLAUDE_MODE=gateway
JEANCLAUDE_GATEWAY_MODE=process
JEANCLAUDE_GATEWAY_HOST=127.0.0.1
JEANCLAUDE_GATEWAY_PORT=8765
JEANCLAUDE_GATEWAY_KEEPALIVE=1
JEANCLAUDE_GATEWAY_LOG_LEVEL=info
JEANCLAUDE_GATEWAY_PID_FILE=.jeanclaude/gateway.pid
```

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_MODE` | `direct` | Set to `gateway` to route through the gateway |
| `JEANCLAUDE_GATEWAY_MODE` | `process` | Gateway sub-mode: `process`, `container`, or `external` |
| `JEANCLAUDE_GATEWAY_HOST` | `0.0.0.0` | Interface the gateway listens on. Set to `127.0.0.1` for local-only. |
| `JEANCLAUDE_GATEWAY_PORT` | `8765` | Port the gateway listens on |
| `JEANCLAUDE_GATEWAY_KEEPALIVE` | `1` | Keep gateway running between commands |
| `JEANCLAUDE_GATEWAY_LOG_LEVEL` | `info` | Gateway log verbosity |
| `JEANCLAUDE_GATEWAY_LOG_FILE` | *(stderr)* | Path to log file |
| `JEANCLAUDE_GATEWAY_PID_FILE` | `.jeanclaude/gateway.pid` | PID file for process management |

## State Directory

Process mode stores state under `.jeanclaude/` in the project root:

```text
.jeanclaude/
  ├── gateway.pid       # Gateway process PID
  └── gateway.log       # Gateway logs (if JEANCLAUDE_GATEWAY_LOG_FILE not overridden)
```

## Troubleshooting

### Gateway won't start

```bash
# Check if port is in use
lsof -i :8765

# Kill stale gateway
kill $(cat .jeanclaude/gateway.pid) 2>/dev/null
rm .jeanclaude/gateway.pid

# Start fresh
jeanclaude gateway start --gateway-mode process
```

### Gateway starts but Claude Code can't connect

```bash
# Check gateway health
curl http://127.0.0.1:8765/healthz

# Check gateway is listening
jeanclaude gateway status

# Verify ANTHROPIC_BASE_URL
jeanclaude config | grep ANTHROPIC_BASE_URL
# Should show: ANTHROPIC_BASE_URL=http://127.0.0.1:8765
```

### Gateway returns 502 errors

This means the gateway can't reach DeepSeek:

```bash
# Check DeepSeek connectivity from host
curl -I https://api.deepseek.com/anthropic/v1/messages

# Check DEEPSEEK_API_KEY is set
jeanclaude doctor | grep "DeepSeek API key"

# Enable debug logging
JEANCLAUDE_GATEWAY_LOG_LEVEL=debug jeanclaude gateway start
```

## Related Documentation

- [Execution Modes](./execution-modes.md) — Overview of all execution modes
- [Gateway Container Mode](./gateway-container-mode.md) — Running the gateway in Docker
- [Gateway External Mode](./gateway-external-mode.md) — Connecting to a user-managed gateway
- [Thinking Profiles](./thinking-profiles.md) — How the gateway enforces thinking policy
- [Configuration](./configuration.md) — Complete environment variable reference
