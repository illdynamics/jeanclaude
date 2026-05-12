# Gateway Container Mode

Gateway container mode runs the JeanClaude gateway **inside a Docker container** as part of the JeanClaude Docker Compose stack.

## Architecture

```
docker compose
  │
  ├── jeanclaude-runner
  │     ├── Claude Code
  │     │     │
  │     │     └── ANTHROPIC_BASE_URL=http://127.0.0.1:8765
  │     │
  │     └── Gateway (Node.js, port 8765)
  │           │
  │           └── Forwarding to https://api.deepseek.com/anthropic
  │
  ├── open-responses
  ├── open-responses-db
  └── ... (other services)
```

The gateway runs in the same container as Claude Code (or optionally in its own service container), listening on `127.0.0.1:8765`. Claude Code connects locally within the container.

## When to Use Container Mode

| Scenario | Why Container |
|---|---|
| Already using Docker Compose | Natural fit with the existing stack |
| CI/CD pipelines | Container isolation, reproducible builds |
| Team environments | Consistent gateway behavior across developers |
| Sandboxed operation | Gateway is contained, not running on host |
| No host Node.js | Gateway runs in the container with its own Node.js |

## Quickstart

```bash
# 1. Configure .env
cat >> .env << 'EOF'
JEANCLAUDE_MODE=gateway
JEANCLAUDE_GATEWAY_MODE=container
DEEPSEEK_API_KEY=sk-your-key
EOF

# 2. Build (if not already)
make build

# 3. Start gateway in container
jeanclaude gateway start --gateway-mode container

# Or start the full stack with gateway
docker compose up -d

# 4. Verify
jeanclaude gateway status

# 5. Run through gateway
jeanclaude --jeanclaude-mode gateway --gateway-mode container -p "explain this repo"

# 6. Stop
jeanclaude gateway stop
# Or: docker compose stop
```

## Docker Integration

### With docker-compose.yml (Existing Stack)

Container mode integrates with the existing JeanClaude Compose stack. The gateway runs inside the `jeanclaude-runner` container:

```yaml
# Relevant parts of docker-compose.yml
services:
  jeanclaude-runner:
    build: .
    ports:
      - "8765:8765"  # Gateway port
    environment:
      JEANCLAUDE_MODE: gateway
      JEANCLAUDE_GATEWAY_MODE: container
      DEEPSEEK_API_KEY: ${DEEPSEEK_API_KEY}
      JEANCLAUDE_GATEWAY_HOST: 0.0.0.0
      JEANCLAUDE_GATEWAY_PORT: 8765
      JEANCLAUDE_THINKING: ${JEANCLAUDE_THINKING:-disabled}
      JEANCLAUDE_REASONING_EFFORT: ${JEANCLAUDE_REASONING_EFFORT:-high}
```

### Standalone Gateway Container

For dedicated gateway deployments, you can run the gateway in its own container:

```bash
# Build gateway image
docker build -f gateway/Dockerfile -t jeanclaude-gateway .

# Run gateway container
docker run -d \
  --name jeanclaude-gateway \
  -p 8765:8765 \
  -e DEEPSEEK_API_KEY=sk-... \
  -e JEANCLAUDE_GATEWAY_HOST=0.0.0.0 \
  -e JEANCLAUDE_GATEWAY_PORT=8765 \
  jeanclaude-gateway

# Check health
curl http://127.0.0.1:8765/healthz

# Then configure JeanClaude to use it
JEANCLAUDE_GATEWAY_URL=http://127.0.0.1:8765 jeanclaude --jeanclaude-mode gateway --gateway-mode external -p "test"
```

## Thinking Policy Enforcement

Same as process mode — the containerized gateway rewrites every request to enforce thinking policy:

```text
JEANCLAUDE_THINKING=enabled  →  Injects thinking directive
JEANCLAUDE_THINKING=disabled →  Ensures thinking is disabled
```

The gateway inside the container has access to the same environment variables as process mode. See [Thinking Profiles](./thinking-profiles.md) for details.

## Container-Specific Considerations

### Port Mapping

The gateway listens on `JEANCLAUDE_GATEWAY_HOST:JEANCLAUDE_GATEWAY_PORT` inside the container. For Claude Code running in the same container, `127.0.0.1:8765` works without port mapping.

If you need to access the gateway from the host (e.g., `jeanclaude gateway status` from the host CLI), ensure the port is mapped in `docker-compose.yml`:

```yaml
ports:
  - "8765:8765"
```

### Health Checks

The containerized gateway supports Docker health checks:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://127.0.0.1:8765/healthz"]
  interval: 10s
  timeout: 5s
  retries: 3
```

### Logs

Gateway logs go to the container's stdout/stderr by default. Access them with:

```bash
# If gateway is in jeanclaude-runner
docker compose logs jeanclaude-runner | grep gateway

# If gateway has its own container
docker logs jeanclaude-gateway
```

### Non-Root User

The containerized gateway runs as the `jeanclaude` user (UID 10001), same as the rest of the runner. No root privileges needed.

## Configuration

```bash
# .env
JEANCLAUDE_MODE=gateway
JEANCLAUDE_GATEWAY_MODE=container
JEANCLAUDE_GATEWAY_HOST=0.0.0.0
JEANCLAUDE_GATEWAY_PORT=8765
JEANCLAUDE_GATEWAY_LOG_LEVEL=info
```

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_MODE` | `direct` | Set to `gateway` |
| `JEANCLAUDE_GATEWAY_MODE` | `process` | Set to `container` |
| `JEANCLAUDE_GATEWAY_HOST` | `0.0.0.0` | Gateway listen interface inside container |
| `JEANCLAUDE_GATEWAY_PORT` | `8765` | Gateway listen port |
| `JEANCLAUDE_GATEWAY_LOG_LEVEL` | `info` | Gateway log verbosity |

## Lifecycle

### Start with Compose

```bash
# Start full stack (gateway starts with jeanclaude-runner)
docker compose up -d

# Start just the runner (includes gateway)
docker compose up -d jeanclaude-runner
```

### Stop

```bash
# Stop full stack
docker compose stop

# Stop just the runner
docker compose stop jeanclaude-runner
```

### Restart

```bash
docker compose restart jeanclaude-runner
```

### Remove

```bash
# Stop and remove containers
docker compose down

# Remove volumes too (destroys Claude Code state)
docker compose down -v
```

## Troubleshooting

### Port already in use

```bash
# Check if 8765 is taken
lsof -i :8765

# If it's a stale container
docker compose down
```

### Gateway not reachable inside container

```bash
# Shell into the runner
docker compose exec jeanclaude-runner bash

# Check gateway from inside
curl http://127.0.0.1:8765/healthz
```

### Container build issues

```bash
# Rebuild from scratch
docker compose build --no-cache jeanclaude-runner

# Or full rebuild
make build
```

### Gateway logs show auth errors

The container needs `DEEPSEEK_API_KEY` in its environment. Verify the compose file passes it through:

```bash
docker compose config | grep DEEPSEEK_API_KEY
```

## Related Documentation

- [Gateway Process Mode](./gateway-process-mode.md) — Host-native gateway (no Docker)
- [Gateway External Mode](./gateway-external-mode.md) — User-managed gateway
- [Execution Modes](./execution-modes.md) — Overview of all execution modes
- [Docker Usage](./docker.md) — Full Docker Compose guide
- [Configuration](./configuration.md) — Complete environment variable reference
