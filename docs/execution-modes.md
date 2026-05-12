# Execution Modes

JeanClaude supports four execution modes that control how Claude Code connects to the DeepSeek API. Each mode offers different tradeoffs between simplicity, control, and observability.

## Mode Overview

| Mode | Gateway | Docker Required | Thinking Control | Observability |
|---|---|---|---|---|
| **Direct** (default) | No | No | Best-effort | Limited |
| **Gateway Process** | Yes (host-native) | No | Exact | High |
| **Gateway Container** | Yes (Docker) | Yes | Exact | High |
| **Gateway External** | Yes (user-managed) | No | Exact | High |
| **Auto** | Auto-selected | Maybe | Depends | Depends |

## Direct Mode (Default)

```
Claude Code ──▶ DeepSeek Anthropic API (https://api.deepseek.com/anthropic)
```

**Direct mode** is the default and simplest execution mode. Claude Code talks to DeepSeek's Anthropic-compatible API directly — no proxy, no gateway, no Docker, no middleware.

### Characteristics

- **No gateway required.** Claude Code sends requests straight to `api.deepseek.com`.
- **No Docker required.** Works with a host-installed `claude` binary via `./bin/jeanclaude-standalone`.
- **Best-effort thinking.** Claude Code requests thinking; DeepSeek may or may not return reasoning content.
- **Limited observability.** No per-request logging or policy enforcement between Claude Code and DeepSeek.

### When to Use

- You want the simplest possible setup
- You don't need custom policy enforcement
- You don't need deterministic thinking control
- You're running JeanClaude standalone (not in Docker)

### Configuration

```bash
# .env
JEANCLAUDE_MODE=direct
```

Or per-command:

```bash
jeanclaude --jeanclaude-mode direct -p "do something"
```

### What Direct Mode Is NOT

- **Not proxied.** Claude Code connects to DeepSeek directly. There is no man-in-the-middle.
- **Not policy-enforced.** Requests are not inspected, modified, or logged by JeanClaude.
- **Not thinking-guaranteed.** Thinking behavior depends on DeepSeek's response, not JeanClaude's configuration.

## Gateway Process Mode (Host-Native)

```
Claude Code ──▶ JeanClaude Gateway (localhost:8765) ──▶ DeepSeek API
```

The gateway runs as a **host-native Node.js process**. No Docker required. JeanClaude starts and manages the gateway process itself.

### Characteristics

- **Host-native Node.js process.** The gateway runs directly on your machine, managed by JeanClaude.
- **Exact thinking control.** The gateway rewrites every request to enforce your thinking policy.
- **Request inspection.** All traffic passes through a local HTTP server on `127.0.0.1:8765`.
- **No Docker.** Works with a host-installed gateway (`gateway/src/server.ts` compiled to JS).

### When to Use

- You want exact thinking control without Docker overhead
- You need per-request policy enforcement
- You want local observability (logs, request inspection)
- You're debugging thinking + tool call interactions

See [Gateway Process Mode](./gateway-process-mode.md) for full setup and usage.

## Gateway Container Mode (Docker)

```
Claude Code ──▶ JeanClaude Gateway (container:8765) ──▶ DeepSeek API
```

The gateway runs **inside a Docker container** alongside the JeanClaude runner. The containerized gateway provides isolation and is the mode originally designed in the Docker Compose stack.

### Characteristics

- **Dockerized.** Gateway runs in the `jeanclaude-runner` container or a dedicated gateway container.
- **Exact thinking control.** Same policy enforcement as process mode.
- **Container isolation.** Gateway runs as non-root user, network-isolated from host.
- **Compose integration.** Part of the full JeanClaude Docker Compose stack.

### When to Use

- You're already using JeanClaude's Docker Compose setup
- You want container-level isolation for the gateway
- You're running JeanClaude in CI/CD or sandboxed environments

See [Gateway Container Mode](./gateway-container-mode.md) for full setup and usage.

## Gateway External Mode (User-Managed)

```
Claude Code ──▶ External Gateway (JEANCLAUDE_GATEWAY_URL) ──▶ DeepSeek API
```

The gateway runs **outside JeanClaude's control** — you start, stop, and manage it yourself. JeanClaude connects to it via `JEANCLAUDE_GATEWAY_URL`.

### Characteristics

- **User-managed.** You control the gateway lifecycle (start, stop, restart, monitoring).
- **Any host.** The gateway can run on any reachable host or port.
- **Exact thinking control.** Policy enforcement happens at your gateway.
- **No process management.** JeanClaude does not start or stop the gateway.

### When to Use

- You have an existing gateway deployment (e.g., shared team gateway)
- You want to run the gateway on a different machine than Claude Code
- You need custom gateway configuration beyond what JeanClaude provides
- You're integrating with external infrastructure (load balancers, auth proxies)

See [Gateway External Mode](./gateway-external-mode.md) for full setup and usage.

## Auto Mode

```
Auto-detect: Try direct → fall back to gateway if configured
```

**Auto mode** lets JeanClaude decide the best execution path:

1. If a gateway is reachable at `JEANCLAUDE_GATEWAY_URL` (or `127.0.0.1:8765`), use gateway mode
2. Otherwise, fall back to direct mode

### When to Use

- You want JeanClaude to "just work" regardless of environment
- You switch between gateway and direct mode frequently
- You're writing scripts that should adapt to the available setup

### Configuration

```bash
# .env
JEANCLAUDE_MODE=auto
```

## Mode Selection Diagram

```text
JEANCLAUDE_MODE=?
│
├── direct ──────────▶ Claude Code → DeepSeek API (no gateway)
│
├── gateway ─────────▶ JEANCLAUDE_GATEWAY_MODE=?
│   │                   │
│   │                   ├── process ──▶ Start gateway as host process
│   │                   ├── container ─▶ Start gateway in Docker
│   │                   └── external ──▶ Connect to JEANCLAUDE_GATEWAY_URL
│   │
│   └─────────────────▶ Claude Code → Gateway (8765) → DeepSeek API
│
└── auto ────────────▶ Gateway reachable?
                        │
                        ├── Yes → Gateway mode
                        └── No  → Direct mode
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_MODE` | `direct` | Execution mode: `direct`, `gateway`, or `auto` |
| `JEANCLAUDE_GATEWAY_MODE` | `process` | Gateway mode when `JEANCLAUDE_MODE=gateway`: `process`, `container`, or `external` |
| `JEANCLAUDE_GATEWAY_HOST` | `0.0.0.0` | Gateway listen address |
| `JEANCLAUDE_GATEWAY_PORT` | `8765` | Gateway listen port |
| `JEANCLAUDE_GATEWAY_URL` | `http://127.0.0.1:8765` | Full URL for gateway connection (external mode) |

## CLI Flags

```bash
# Select execution mode
jeanclaude --jeanclaude-mode direct -p "quick task"
jeanclaude --jeanclaude-mode gateway --gateway-mode process -p "policy-enforced task"
jeanclaude --jeanclaude-mode auto -p "auto-detect"

# Gateway subcommands
jeanclaude gateway start     # Start gateway (process or container mode)
jeanclaude gateway stop      # Stop gateway
jeanclaude gateway status    # Check gateway health
jeanclaude gateway logs      # Show gateway logs
```

## Mode Decision Guide

| Your Situation | Recommended Mode |
|---|---|
| "I just want it to work" | `direct` (default) |
| "I need exact thinking control" | `gateway` with `--gateway-mode process` |
| "I'm using Docker Compose stack" | `gateway` with `--gateway-mode container` |
| "I have an existing gateway deployment" | `gateway` with `--gateway-mode external` |
| "I switch environments often" | `auto` |
| "I want maximum simplicity" | `direct` |
| "I want maximum observability" | `gateway` (any sub-mode) |

## Related Documentation

- [Gateway Process Mode](./gateway-process-mode.md) — Running the gateway as a host-native process
- [Gateway Container Mode](./gateway-container-mode.md) — Running the gateway in Docker
- [Gateway External Mode](./gateway-external-mode.md) — Connecting to a user-managed gateway
- [Model Profiles](./model-profiles.md) — Model and thinking profile selection
- [Thinking Profiles](./thinking-profiles.md) — How thinking works in each mode
