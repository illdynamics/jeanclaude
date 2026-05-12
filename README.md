# JeanClaude

**Production-grade Gemini CLI drop-in replacement routing to DeepSeek V4 models.**
Run demoni instead of gemini. Same flags, same interactive behavior, same tool calls. But your prompts go to DeepSeek V4 models via your DEEPSEEK_API_KEY — no Google account needed.

<p align="center">
  <img src="./jeanclaude.jpg" alt="JeanClaude" width="80%">
</p>

Current version: `0.2.1` (from [`VERSION`](./VERSION)).

Release notes: [`RELEASE-NOTES.md`](./RELEASE-NOTES.md)

## Quickstart

### Option 1: curl one-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/illdynamics/jeanclaude/main/scripts/install.sh | bash
```

This downloads the latest release zip, extracts it, and runs `./jeanclaude install`
which copies jeanclaude to `~/.config/jeanclaude`, creates a `~/bin/jeanclaude`
launcher, and builds the Docker/Podman image.  After install, `jeanclaude` works
from anywhere (if `~/bin` is on your `PATH`).

### Option 2: git clone

```bash
git clone https://github.com/illdynamics/jeanclaude.git
cd jeanclaude
./jeanclaude install
```

### Running JeanClaude

```bash
# Set your DeepSeek API key (required)
export DEEPSEEK_API_KEY="sk-your-deepseek-key"

# Run Claude Code via JeanClaude
jeanclaude -Y "explain this repo"

# Print version
jeanclaude --version


## Architecture

```
Claude Code ──▶ DeepSeek Anthropic API (direct mode, default)
       │
       ├──▶ Gateway (127.0.0.1:8765, optional) ──▶ DeepSeek API
       │
       └──▶ MCP (jeanclaude-tools) ──▶ Open Responses ──▶ Brave / Unstructured
```

- **Direct mode (default):** Claude Code talks to `https://api.deepseek.com/anthropic` — no proxy, no middleware, no Docker required.
- **Gateway modes (optional advanced):** Route through a local JeanClaude gateway for exact thinking policy enforcement and request observability.
- **Tool path:** Claude Code's MCP client connects to the `jeanclaude-tools` stdio server, which calls Open Responses for web search, document retrieval, and response synthesis.
- **Containerized:** Everything can run in Docker Compose with isolated services.

## Model Profiles

JeanClaude provides four curated **model profiles** that bundle a DeepSeek model with a thinking preset:

| Profile | Model | Thinking | Best For |
|---|---|---|---|
| `v4-pro-thinking` | `deepseek-v4-pro` | enabled, `max` | Deep architecture review, complex debugging, hard reasoning |
| `v4-pro` | `deepseek-v4-pro` | disabled | High-capability coding without thinking overhead |
| `v4-flash-thinking` | `deepseek-v4-flash` | enabled, `high` | Cost-effective reasoning, mid-complexity analysis |
| `v4-flash` | `deepseek-v4-flash` | disabled | Fast edits, simple fixes, interactive coding |

**Default profile:** `v4-pro-thinking`

```bash
# Set default profile
JEANCLAUDE_MODEL_PROFILE=v4-pro

# Per-command override
jeanclaude --profile v4-flash -p "quick fix"
jeanclaude --profile v4-pro-thinking -p "deep architecture review"
```

See [`docs/model-profiles.md`](./docs/model-profiles.md) for the full profile guide.

## Execution Modes

JeanClaude supports four execution modes. Direct mode is the default and simplest — no gateway, no Docker.

| Mode | Gateway | Docker | Thinking Control |
|---|---|---|---|
| **Direct** (default) | No | No | Best-effort |
| **Gateway Process** | Yes | No | Exact |
| **Gateway Container** | Yes | Yes | Exact |
| **Gateway External** | Yes | No | Exact |
| **Auto** | Auto-detect | Maybe | Depends |

### Direct Mode (Default)

Direct mode does not require a local gateway. Claude Code connects to DeepSeek's API directly.

```bash
jeanclaude -p "explain this repo"
```

### Gateway Modes (Optional Advanced)

Gateway modes are optional advanced modes. Use them when you need exact thinking policy enforcement or request observability.

```bash
# Gateway process mode (host-native, no Docker)
jeanclaude --jeanclaude-mode gateway --gateway-mode process -p "policy-enforced task"

# Gateway container mode (Docker)
jeanclaude --jeanclaude-mode gateway --gateway-mode container -p "dockerized"

# Auto mode (detects gateway, falls back to direct)
jeanclaude --jeanclaude-mode auto -p "adapt to environment"
```

See [`docs/execution-modes.md`](./docs/execution-modes.md) for the full mode guide.

### Running JeanClaude

```bash
# Set your DeepSeek API key (required)
export DEEPSEEK_API_KEY="sk-your-deepseek-key"

# Run Claude Code via JeanClaude
jeanclaude -Y "explain this repo"

# Print version
jeanclaude --version

# Show help
jeanclaude help

# List model profiles
jeanclaude models
```

See [`docs/quickstart.md`](./docs/quickstart.md) for a full walkthrough.

## Installation

### Prerequisites

- **Docker** or **Podman** (for container mode — optional but recommended)
- **Node.js 22+** (Claude Code requires it; installed inside the Docker image)
- A **DeepSeek API key** — set `DEEPSEEK_API_KEY` in your environment

The `./jeanclaude install` command handles everything else:
- Copies the repo snapshot to `~/.config/jeanclaude`
- Creates a `~/bin/jeanclaude` launcher (add to `PATH` for global access)
- Auto-builds the Docker/Podman image

### Standalone Mode (No Docker)

```bash
# Install Claude Code globally
npm install -g @anthropic-ai/claude-code

# Run JeanClaude standalone
jeanclaude -Y "explain this repo"
```

### Commands

```bash
jeanclaude build       # Build/rebuild the Docker/Podman image
jeanclaude install     # Install or reinstall locally
jeanclaude help        # Show help
jeanclaude doctor      # Check configuration
jeanclaude models      # List model profiles
jeanclaude --version   # Print version
```

See [`docs/installation.md`](./docs/installation.md) for detailed setup.

## Configuration

All configuration is done through environment variables in `.env`.

### Core

| Variable | Default | Description |
|---|---|---|
| `DEEPSEEK_API_KEY` | *(required)* | DeepSeek API key for model calls |
| `JEANCLAUDE_MODEL_PROFILE` | `v4-pro-thinking` | Model profile: `v4-pro-thinking`, `v4-pro`, `v4-flash-thinking`, `v4-flash` |
| `JEANCLAUDE_MODE` | `direct` | Execution mode: `direct`, `gateway`, or `auto` |

### Gateway (when `JEANCLAUDE_MODE=gateway`)

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_GATEWAY_MODE` | `process` | Gateway sub-mode: `process`, `container`, `external` |
| `JEANCLAUDE_GATEWAY_HOST` | `0.0.0.0` | Gateway listen address |
| `JEANCLAUDE_GATEWAY_PORT` | `8765` | Gateway listen port |
| `JEANCLAUDE_GATEWAY_URL` | `http://127.0.0.1:8765` | Full URL for gateway connection |

### Features

| Variable | Default | Description |
|---|---|---|
| `RESPONSE_API_KEY` | `jrsp-local-dev-key` | Open Responses sidecar API key |
| `JEANCLAUDE_OPEN_RESPONSES_URL` | `http://open-responses:8080` | Open Responses container URL |
| `JEANCLAUDE_WEB_SEARCH` | `off` | Enable web search (`on` / `off`) |
| `BRAVE_API_KEY` | — | Brave Search API key |
| `JEANCLAUDE_DOCUMENTS` | `off` | Enable document processing (`on` / `off`) |
| `JEANCLAUDE_PERMISSION_MODE` | `default` | Permission mode for Claude Code |

See [`docs/configuration.md`](./docs/configuration.md) for the complete reference.

## CLI Usage

```bash
# Interactive session (uses default profile v4-pro-thinking)
jeanclaude

# Single prompt (non-interactive)
jeanclaude "explain this repo"

# Prompt with explicit -p flag
jeanclaude -p "write tests for the MCP server"

# Use a model profile
jeanclaude --profile v4-pro -p "review this PR"
jeanclaude --profile v4-flash -p "quick fix"
jeanclaude --profile v4-pro-thinking -p "deep architecture review"
jeanclaude --profile v4-flash-thinking -p "moderate debugging"

# Legacy model flag (still works)
jeanclaude --model deepseek-v4-pro -p "fix this architecture issue"

# Enable/disable thinking
jeanclaude --thinking --effort max -p "deep debug this concurrency failure"
jeanclaude --no-thinking -p "quick edit"

# Execution modes
jeanclaude --jeanclaude-mode gateway --gateway-mode process -p "policy-enforced"
jeanclaude --jeanclaude-mode auto -p "auto-detect environment"

# Gateway management
jeanclaude gateway start --gateway-mode process
jeanclaude gateway status
jeanclaude gateway stop
jeanclaude gateway logs

# Model listing
jeanclaude models

# Run Claude Code commands directly
jeanclaude claude --help
jeanclaude claude --version

# Doctor check
jeanclaude doctor

# Print current configuration
jeanclaude config

# Container shell
jeanclaude shell

# Web search
jeanclaude web-search "latest DeepSeek Claude Code integration"

# Document workflow
jeanclaude document ingest ./docs/design.pdf
jeanclaude document ask "What does the design doc require?"
jeanclaude document query "authentication flow"

# Open Responses management
jeanclaude open-responses status
jeanclaude open-responses logs
jeanclaude open-responses ping

# MCP tools
jeanclaude tools list
jeanclaude tools smoke
```

## DeepSeek Setup

JeanClaude authenticates Claude Code through DeepSeek's Anthropic-compatible endpoint using `DEEPSEEK_API_KEY`. No Anthropic API key or Anthropic login flow is used.

1. Get an API key from [platform.deepseek.com](https://platform.deepseek.com/api_keys)
2. Set `DEEPSEEK_API_KEY=sk-...` in `.env`
3. Choose a model profile: `JEANCLAUDE_MODEL_PROFILE=v4-pro-thinking`
4. Run `./bin/jeanclaude doctor` and `./bin/jeanclaude ping`

See [`docs/deepseek-setup.md`](./docs/deepseek-setup.md) for detailed setup and profile selection guidance.

## Dangerous Mode

JeanClaude supports Claude Code's `--yolo`/`-Y` dangerous mode, which bypasses all permission prompts and automatically approves all tool calls.

```bash
# Dangerous mode: auto-approve all operations
jeanclaude --yolo -p "refactor the entire codebase"

# Short form
jeanclaude -Y "deploy to production"
```

**⚠️ WARNING:** Dangerous mode is never enabled by default, and no model profile, thinking profile, or execution mode ever enables it. It must be explicitly activated by the operator. Dangerous mode should only be used in isolated containers, disposable VMs, or ephemeral worktrees. It gives Claude Code unrestricted filesystem access and command execution. Never use dangerous mode on production systems or with sensitive data.

See [`docs/dangerous-mode.md`](./docs/dangerous-mode.md) for full details and safety guidance.

## Docker

JeanClaude can run in Docker Compose:

- **`jeanclaude-runner`**: Claude Code with MCP tools and optional gateway
- **`open-responses`**: Open Responses API sidecar
- **`open-responses-integrations`**: Tool integrations service
- **`open-responses-db`**: PostgreSQL/TimescaleDB for memory
- **`open-responses-vectorizer-worker`**: Vector embedding worker
- **`open-responses-migration`**: Database migrations

```bash
# Build all services
make build

# Start the full stack
docker compose up -d

# Run a command
docker compose run --rm jeanclaude-runner run "explain this repo"
```

Key mounts:
- `.` → `/workspace` (your project root)
- `jeanclaude-home` → `/home/jeanclaude` (persistent Claude Code state)

See [`docs/docker.md`](./docs/docker.md) for detailed Docker usage.

## Documentation

| Document | Description |
|---|---|
| [`docs/quickstart.md`](./docs/quickstart.md) | 5-minute getting started guide |
| [`docs/installation.md`](./docs/installation.md) | Full installation instructions |
| [`docs/configuration.md`](./docs/configuration.md) | Complete environment variable reference |
| [`docs/architecture.md`](./docs/architecture.md) | Architecture and data flow |
| [`docs/model-profiles.md`](./docs/model-profiles.md) | Model profiles guide |
| [`docs/thinking-profiles.md`](./docs/thinking-profiles.md) | Thinking profiles and effort levels |
| [`docs/execution-modes.md`](./docs/execution-modes.md) | Direct, gateway, and auto mode guide |
| [`docs/gateway-process-mode.md`](./docs/gateway-process-mode.md) | Gateway process mode (host-native) |
| [`docs/gateway-container-mode.md`](./docs/gateway-container-mode.md) | Gateway container mode (Docker) |
| [`docs/gateway-external-mode.md`](./docs/gateway-external-mode.md) | Gateway external mode (user-managed) |
| [`docs/deepseek-setup.md`](./docs/deepseek-setup.md) | DeepSeek API key and profile configuration |
| [`docs/mcp-tools.md`](./docs/mcp-tools.md) | MCP tools reference |
| [`docs/open-responses.md`](./docs/open-responses.md) | Open Responses sidecar setup |
| [`docs/docker.md`](./docs/docker.md) | Docker usage guide |
| [`docs/cli-compatibility.md`](./docs/cli-compatibility.md) | Claude Code CLI compatibility |
| [`docs/dangerous-mode.md`](./docs/dangerous-mode.md) | Dangerous mode explanation and safety |
| [`docs/troubleshooting.md`](./docs/troubleshooting.md) | Common issues and solutions |
| [`docs/security-model.md`](./docs/security-model.md) | Security architecture |

## Smoke Tests

```bash
# Run all smoke tests
./scripts/smoke-all.sh

# Individual tests
./scripts/smoke-deepseek-anthropic-direct.sh
./scripts/smoke-claude-code.sh
./scripts/smoke-open-responses.sh
./scripts/smoke-mcp-tool-loop.sh
./scripts/smoke-thinking-tool-loop.sh
./scripts/smoke-open-responses-web-search.sh
./scripts/smoke-open-responses-document-input.sh

# Pre-release checks
./scripts/check.sh
./scripts/package.sh --check
```

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for guidelines. Please ensure all pre-release checks pass before submitting:

```bash
./scripts/check.sh
./scripts/package.sh --check
```

## Security

JeanClaude authenticates Claude Code only through `DEEPSEEK_API_KEY`. No Anthropic API key or Anthropic login flow is used. Parent Anthropic auth variables are stripped from the environment.

To report a vulnerability, email the maintainers directly. Do not open a public issue. See [`SECURITY.md`](./SECURITY.md) for the full security policy, dangerous mode risks, secret redaction policy, gateway security, and supported versions.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details (if included) or refer to the project repository.

---

**JeanClaude** — Claude Code, powered by DeepSeek, extended with tools.
