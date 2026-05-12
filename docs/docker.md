# Docker Usage

JeanClaude runs entirely in Docker (or Podman) via Docker Compose. This document covers container management, volume mounts, TTY configuration, and dangerous mode in containers.

## Architecture

The `docker-compose.yml` defines six services:

| Service | Purpose | Network |
|---|---|---|
| `jeanclaude-runner` | Claude Code with MCP tools and gateway | Internal + host port |
| `open-responses` | Open Responses API (port 8080) | Internal + `127.0.0.1:8080` |
| `open-responses-integrations` | Tool integrations | Internal only |
| `open-responses-db` | PostgreSQL/TimescaleDB | Internal only |
| `open-responses-vectorizer-worker` | Vector embedding worker | Internal only |
| `open-responses-migration` | Database migrations (run-once) | Internal only |

## Quick Commands

```bash
# Build the image
make build

# Start all services
docker compose up -d

# Run a single command
./bin/jeanclaude run "explain this repo"

# Interactive session
./bin/jeanclaude

# Shell inside the runner
./bin/jeanclaude shell

# Stop all services
docker compose down

# Stop and remove volumes
docker compose down -v
```

## Volume Mounts

### Workspace Mount

Your current directory (`.`) is mounted at `/workspace` inside the JeanClaude runner:

```yaml
volumes:
  - .:/workspace
```

This means Claude Code sees your project files directly. Edits made inside JeanClaude are immediately reflected on your host filesystem.

### Persistent Home

The JeanClaude home directory is stored in a named volume:

```yaml
volumes:
  - jeanclaude-home:/home/jeanclaude
```

This preserves Claude Code settings, conversation history, and MCP configuration across container restarts.

### Custom Mounts

Add additional mounts in `docker-compose.yml` or via Compose override:

```yaml
# docker-compose.override.yml
services:
  jeanclaude-runner:
    volumes:
      - ./my-data:/workspace/data:ro          # Read-only data
      - ~/.ssh:/home/jeanclaude/.ssh:ro        # SSH keys (read-only!)
      - my-cache:/workspace/.cache             # Custom cache volume
```

## TTY and Interactive Mode

JeanClaude requires a TTY for interactive Claude Code sessions. The `./bin/jeanclaude` script handles this automatically:

```bash
# Interactive — TTY allocated automatically
./bin/jeanclaude

# Non-interactive — works without TTY (pipes, CI)
echo "explain this repo" | ./bin/jeanclaude run
```

The Compose service is configured with:

```yaml
stdin_open: true
tty: true
```

If you run `docker compose run` directly without the wrapper script, add `-it`:

```bash
docker compose run --rm -it jeanclaude-runner run "explain this"
```

### CI/CD (No TTY)

In CI environments without a TTY:

```bash
# Set non-interactive mode explicitly
docker compose run --rm -T jeanclaude-runner run "run tests and exit"
```

The `./bin/jeanclaude` wrapper auto-detects non-TTY environments and adds `-T`.

## Podman Support

JeanClaude supports Podman. The scripts auto-detect it:

```bash
# Auto-detected
make build

# Explicit
COMPOSE="podman compose" make build
```

### Rootless Podman Notes

Rootless Podman may require additional configuration for bind mounts:

```bash
# Ensure the mount target exists and is writable by your UID
mkdir -p /workspace
chown $(id -u):$(id -g) /workspace
```

Set `HOST_UID` and `HOST_GID` to match:

```bash
HOST_UID=$(id -u)
HOST_GID=$(id -g)
```

## Environment Variables in Compose

The `docker-compose.yml` passes environment variables from your `.env` file to the services. You can override at runtime:

```bash
# Override model for a single run
JEANCLAUDE_MODEL=deepseek-v4-pro ./bin/jeanclaude run "complex review"

# Or via the wrapper flag
./bin/jeanclaude --model deepseek-v4-pro run "complex review"
```

## Building Custom Images

### Custom Claude Code Version

```bash
CLAUDE_CODE_NPM_VERSION=1.2.3 make build
```

### Custom Base Image

Edit the `Dockerfile` or use build args:

```bash
docker compose build --build-arg JEANCLAUDE_UID=2000 jeanclaude-runner
```

### Multi-Stage Optimizations

The Dockerfile bakes MCP tools and gateway compilation into the image. To skip TypeScript compilation (if using pre-built dist):

```bash
# Copy pre-built tools/dist to tools/dist before build, then:
docker compose build
```

## Networking

### Internal Network

All services communicate over the default Compose network:

```
jeanclaude-runner ──▶ open-responses:8080
                  ──▶ open-responses-db:5432
```

### Host Access

Open Responses is exposed on the host at `127.0.0.1:8080` for debugging:

```bash
curl http://127.0.0.1:8080/v1/responses
```

### Gateway Port (Optional)

The JeanClaude gateway (port 8765) is only used when `JEANCLAUDE_MODE=gateway`. In `direct` mode (default), no gateway port is exposed.

## Dangerous Mode in Containers

Dangerous mode (`--yolo`/`-Y`) combined with Docker provides a safety boundary:

```bash
# Dangerous mode in an isolated, disposable container
docker compose run --rm jeanclaude-runner run --yolo "refactor the entire codebase"
```

**Safety recommendations:**

1. **Use `--rm`:** Always run dangerous mode with `--rm` to dispose of the container.
2. **Limit mounts:** Don't mount `~/.ssh`, production configs, or sensitive host directories.
3. **Ephemeral worktrees:** Clone your repo into a temp worktree:
   ```bash
   git worktree add /tmp/jeanclaude-sandbox
   cd /tmp/jeanclaude-sandbox
   docker compose -f /path/to/jeanclaude/docker-compose.yml run --rm jeanclaude-runner run --yolo "..."
   ```
4. **Network isolation:** For maximum safety, use a dedicated Compose network or `--network none` for no network:
   ```bash
   docker compose run --rm --network none jeanclaude-runner run --yolo "..."
   ```
   (Note: this disables web search and document features that need network access.)

See [`dangerous-mode.md`](./dangerous-mode.md) for full dangerous mode guidance.

## Resource Limits

Add resource constraints in a Compose override:

```yaml
# docker-compose.override.yml
services:
  jeanclaude-runner:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
```

## Logs

```bash
# All services
docker compose logs

# Runner only, follow mode
docker compose logs -f jeanclaude-runner

# Tail recent logs
docker compose logs --tail=100 jeanclaude-runner
```

## Cleanup

```bash
# Stop services, keep volumes
docker compose down

# Stop and remove volumes (resets Claude Code state)
docker compose down -v

# Remove built images
docker compose down --rmi all

# Full cleanup
docker compose down -v --rmi all
docker system prune -f
```

## Health Checks

The JeanClaude runner includes a Docker health check:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD /usr/local/bin/jeanclaude-healthcheck || exit 1
```

Check health status:

```bash
docker compose ps
```

The Open Responses database also has a health check (10s interval, PostgreSQL connectivity check), and the runner depends on Open Responses being started.
