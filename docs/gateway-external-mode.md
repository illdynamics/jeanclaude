# Gateway External Mode

Gateway external mode connects JeanClaude to a **user-managed** gateway instance. You start, stop, and manage the gateway yourself — JeanClaude only connects to it.

## Architecture

```
Your Gateway Instance (any host)
  │
  └── HTTP server on <JEANCLAUDE_GATEWAY_URL>
        ├── /v1/messages           (Anthropic Messages proxy)
        ├── /v1/messages/count_tokens
        └── /healthz               (health check)
        
Claude Code ──▶ Your Gateway ──▶ DeepSeek API
                (via JEANCLAUDE_GATEWAY_URL)
```

JeanClaude does **not** start, stop, or monitor the gateway. It only sets `ANTHROPIC_BASE_URL` to point at your gateway and lets Claude Code talk to it.

## When to Use External Mode

| Scenario | Why External |
|---|---|
| Shared team gateway | One gateway serves multiple developers |
| Existing infrastructure | You already have a reverse proxy, load balancer, or auth layer |
| Custom gateway build | You've modified the gateway beyond what JeanClaude ships |
| Remote deployment | Gateway runs on a different machine than Claude Code |
| Custom lifecycle | You use systemd, Kubernetes, or a process manager to run the gateway |

## Quickstart

### 1. Start Your Gateway

Start the JeanClaude gateway however you manage it:

```bash
# Direct Node.js
node gateway/dist/server.js

# systemd
systemctl start jeanclaude-gateway

# Docker
docker run -p 8765:8765 -e DEEPSEEK_API_KEY=sk-... jeanclaude-gateway

# docker-compose
docker compose up gateway

# Kubernetes
kubectl apply -f gateway-deployment.yaml
```

### 2. Configure JeanClaude

```bash
# .env
JEANCLAUDE_MODE=gateway
JEANCLAUDE_GATEWAY_MODE=external
JEANCLAUDE_GATEWAY_URL=http://10.0.1.5:8765
```

### 3. Verify Connectivity

```bash
# Check gateway is reachable
curl http://10.0.1.5:8765/healthz
# Expected: {"ok": true, "mode": "gateway"}

# Run a command
jeanclaude --jeanclaude-mode gateway --gateway-mode external -p "explain this repo"
```

## Gateway Requirements

Your external gateway must:

1. **Listen on an HTTP port** reachable by Claude Code
2. **Handle `/v1/messages`** — Anthropic Messages API proxy
3. **Handle `/v1/messages/count_tokens`** — Token counting
4. **Handle `/healthz`** — Return `{"ok": true}` for health checks
5. **Have `DEEPSEEK_API_KEY`** configured (or equivalent auth to DeepSeek)
6. **Forward to `https://api.deepseek.com/anthropic`** (or your configured upstream)

The stock JeanClaude gateway (`gateway/src/server.ts`) meets all these requirements.

## Configuration

```bash
# .env
JEANCLAUDE_MODE=gateway
JEANCLAUDE_GATEWAY_MODE=external
JEANCLAUDE_GATEWAY_URL=http://your-gateway-host:8765
```

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_MODE` | `direct` | Set to `gateway` to route through any gateway |
| `JEANCLAUDE_GATEWAY_MODE` | `process` | Set to `external` for user-managed gateway |
| `JEANCLAUDE_GATEWAY_URL` | `http://127.0.0.1:8765` | Full URL of your gateway instance |

Note: `JEANCLAUDE_GATEWAY_HOST`, `JEANCLAUDE_GATEWAY_PORT`, `JEANCLAUDE_GATEWAY_KEEPALIVE`, `JEANCLAUDE_GATEWAY_PID_FILE`, and `JEANCLAUDE_GATEWAY_LOG_FILE` are **ignored** in external mode — the gateway lifecycle is yours to manage.

## Gateway Management Commands (Limited)

In external mode, gateway management commands are limited because JeanClaude doesn't own the gateway lifecycle:

```bash
# This works — just checks connectivity
jeanclaude gateway status

# These print info but don't manage the process
jeanclaude gateway start   # Prints: "External mode: start gateway yourself"
jeanclaude gateway stop    # Prints: "External mode: stop gateway yourself"
jeanclaude gateway logs    # Prints: "External mode: check your own logs"
```

## Security Considerations

### Local-Only Binding (Recommended)

If your gateway and Claude Code run on the same machine, bind to `127.0.0.1`:

```bash
# Gateway config (your side)
JEANCLAUDE_GATEWAY_HOST=127.0.0.1
JEANCLAUDE_GATEWAY_PORT=8765

# JeanClaude config (.env)
JEANCLAUDE_GATEWAY_URL=http://127.0.0.1:8765
```

### Remote Gateway

If the gateway runs on a different machine:

1. **Use a private network** (VPC, VPN, tailnet). Do not expose the gateway to the public internet without authentication.
2. **Add TLS** with a reverse proxy (nginx, Caddy) in front of the gateway.
3. **Add authentication** if multiple users share the gateway.

```text
Claude Code ──TLS──▶ nginx ──▶ Gateway (internal network) ──▶ DeepSeek
```

### API Key Handling

The external gateway holds `DEEPSEEK_API_KEY`. JeanClaude does **not** pass its API key to the gateway in external mode — the gateway must have its own key configured. This means:

- The gateway's API key is used for all DeepSeek requests
- Claude Code's host environment does not need `DEEPSEEK_API_KEY` (though `jeanclaude doctor` will flag it as missing)
- You can use a shared API key for team gateways

## Troubleshooting

### Can't connect to external gateway

```bash
# Check basic connectivity
curl -v http://your-gateway-host:8765/healthz

# Check from inside Docker if applicable
docker compose run --rm jeanclaude-runner curl http://your-gateway-host:8765/healthz
```

### Gateway returns 502

This means your gateway can't reach DeepSeek. Check the gateway's own logs and `DEEPSEEK_API_KEY` configuration on the gateway side.

### Gateway returns 404 for non-standard paths

Some custom gateway builds may not support all endpoints. The stock gateway handles:
- `/v1/messages`
- `/v1/messages/count_tokens`
- `/healthz`

All other paths return 404.

## Related Documentation

- [Gateway Process Mode](./gateway-process-mode.md) — JeanClaude-managed host-native gateway
- [Gateway Container Mode](./gateway-container-mode.md) — JeanClaude-managed Docker gateway
- [Execution Modes](./execution-modes.md) — Overview of all execution modes
- [Configuration](./configuration.md) — Complete environment variable reference
