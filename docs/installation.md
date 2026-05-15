# Installation

## Prerequisites

### Required

| Component | Version | Notes |
|---|---|---|
| Docker | 24+ | Or Podman 4+ with `podman compose` |
| Docker Compose | v2 | Bundled with Docker Desktop; `docker compose` (not `docker-compose`) |
| DeepSeek API key | — | From [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| Git | 2+ | For cloning the repository |

### Inside the Container (automatic)

The following are installed automatically inside the Docker image — you do not need them on your host:

- **Node.js 22** (from `node:22-bookworm-slim` base image)
- **Claude Code** (`@anthropic-ai/claude-code`) — installed via `npm install -g` at build time

## Option 1: Git Clone (Recommended)

```bash
git clone https://github.com/your-org/jeanclaude.git
cd jeanclaude
```

## Option 2: Download Archive

Download the latest release archive from the releases page and extract it:

```bash
curl -L -o jeanclaude-v0.2.3.zip https://github.com/illdynamics/jeanclaude/releases/download/v0.2.3/jeanclaude-v0.2.3.zip
unzip jeanclaude-v0.2.3.zip
cd jeanclaude-v0.2.3
```

## Setup

### 1. Create Environment File

```bash
cp .env.example .env
```

### 2. Configure API Keys

Edit `.env` and set at minimum:

```bash
# Required
DEEPSEEK_API_KEY=sk-your-deepseek-key

# Required for Open Responses sidecar
RESPONSE_API_KEY=your-secure-random-key
```

Optional keys (only needed if you enable those features):

```bash
# Web search (requires JEANCLAUDE_WEB_SEARCH=on)
BRAVE_API_KEY=your-brave-search-key

# Rich document processing (requires JEANCLAUDE_DOCUMENTS=on)
UNSTRUCTURED_API_KEY=your-unstructured-key
```

### 3. Build the Docker Image

```bash
make build
```

This command:

1. Builds the `jeanclaude-runner` image from the `Dockerfile`
2. Installs Claude Code globally via npm inside the image
3. Compiles the MCP tools and gateway TypeScript
4. Tags the image as `jeanclaude:dev`

Customize the Claude Code version:

```bash
CLAUDE_CODE_NPM_VERSION=1.0.0 make build
```

### 4. Verify Installation

```bash
./bin/jeanclaude doctor
./bin/jeanclaude ping
```

If both pass, JeanClaude is installed and connected.

## Podman Support

JeanClaude works with Podman. The `./bin/jeanclaude` script auto-detects Podman if Docker is not available:

```bash
# Podman is auto-detected
make build  # uses 'podman compose build'

# Or explicitly
COMPOSE="podman compose" make build
```

Note: Rootless Podman may require additional configuration for bind mounts. See [`docker.md`](./docker.md) for details.

## Installing Claude Code on the Host (Optional)

While not required (Claude Code runs inside the container), you may want Claude Code available on your host for debugging:

```bash
npm install -g @anthropic-ai/claude-code
```

This has no effect on JeanClaude — the container uses its own isolated installation.

## Verification Checklist

After installation, verify each layer:

- [x] `./bin/jeanclaude doctor` — all statuses report correctly
- [x] `./bin/jeanclaude ping` — DeepSeek API responds
- [x] `./bin/jeanclaude "say hello"` — Claude Code completes a prompt
- [x] `./scripts/smoke-deepseek-anthropic-direct.sh` — direct model path works
- [x] `./scripts/smoke-claude-code.sh` — Claude Code integration works
- [x] `./scripts/smoke-open-responses.sh` — Open Responses sidecar works (if enabled)
- [x] `./scripts/check.sh` — all pre-release checks pass
- [x] `./scripts/package.sh --check` — package exclusions are valid
