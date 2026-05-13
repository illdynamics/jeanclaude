# JeanClaude

**Production-grade Claude Code CLI drop-in replacement routing to DeepSeek V4 models.**

Run `jeanclaude` instead of `claude-code`. Same flags, same interactive behavior, same tool calls.
But your prompts go to DeepSeek V4 models via your `DEEPSEEK_API_KEY` — no Anthropic account/API key needed.

**Privacy-first by default.** JeanClaude disables Claude Code nonessential traffic, telemetry,
diagnostics, metrics, feature-flag fetching, feedback, surveys, error reporting, prompt history,
session persistence, personalization/memory, official marketplace auto-install, plugin auto-update,
Claude.ai MCP servers, login/session usage, and all auto-update mechanisms for both Claude Code
and JeanClaude. Model traffic is routed to DeepSeek only. Open Responses/web/document tools may
contact their configured providers only when explicitly enabled.

<p align="center">
  <img src="./jeanclaude.jpg" alt="JeanClaude" width="80%">
</p>

Current version: `0.2.1` (from [`VERSION`](./VERSION)).

Release notes: [`RELEASE-NOTES.md`](./RELEASE-NOTES.md)

## Quickstart

### Option 1: git clone (recommended)

```bash
git clone https://github.com/illdynamics/jeanclaude.git
cd jeanclaude
./jeanclaude install
```

### Option 2: curl one-liner

```bash
curl -fsSL https://raw.githubusercontent.com/illdynamics/jeanclaude/main/scripts/install.sh | bash
```

Note: The curl installer respects `JEANCLAUDE_DISABLE_UPDATES=1` and will refuse to resolve
latest versions when privacy lockdown is enabled.

### Running JeanClaude

```bash
# Set your DeepSeek API key (required)
export DEEPSEEK_API_KEY="sk-your-deepseek-key"

# Run Claude Code via JeanClaude
jeanclaude -Y "explain this repo"

# Print version
jeanclaude --version
```

## Privacy Lockdown (Enabled by Default)

JeanClaude ships with a comprehensive privacy lockdown mode enabled by default.

### What it does

JeanClaude disables Claude Code nonessential traffic by default via documented environment
variables and managed settings. Model traffic is routed to DeepSeek. Open Responses/web/document
tools may contact their configured providers only when explicitly enabled.

- **Routes all model traffic only to DeepSeek** — never to Anthropic
- **Disables Claude Code telemetry, diagnostics, metrics, feature-flag fetching**
- **Disables feedback, surveys, error reporting, GrowthBook**
- **Disables prompt history, session persistence, personalization/memory**
- **Disables official marketplace auto-install, plugin auto-update**
- **Disables Claude.ai MCP servers, login/session usage**
- **Disables all auto-update mechanisms for Claude Code and JeanClaude**
- **Strips all inherited Anthropic API keys, OAuth tokens, and session variables**
- **Uses ephemeral home directories** — no persistent Claude state on disk
- **Sets all OTEL exporters to "none"**
- **Fails closed if ANTHROPIC_BASE_URL points to anthropic.com or claude.ai**

### How to verify

```bash
# Check privacy status
jeanclaude doctor --privacy

# Check environment
env | grep -E "CLAUDE_CODE|DISABLE_|OTEL_|JEANCLAUDE_PRIVACY"

# Packet capture or proxy logs showing no anthropic.com/claude.ai egress
# All traffic should go to api.deepseek.com or your configured gateway
```

### Important notes

- **Anthropic account-level model improvement settings cannot be changed by repo code.**
  If you use a consumer Claude/Claude Code account, disable Model Improvement in
  Claude Privacy Settings at https://claude.ai/settings/privacy.
- **Do not log into Claude Code** if you want zero Claude.ai account linkage.
  JeanClaude strips OAuth tokens but the Claude Code binary itself may still
  have account-level tracking. Use JeanClaude with DEEPSEEK_API_KEY only.
- To disable privacy lockdown (NOT RECOMMENDED):
  ```bash
  export JEANCLAUDE_PRIVACY_LOCKDOWN=0
  export JEANCLAUDE_INSECURE_DISABLE_PRIVACY_LOCKDOWN=1
  ```

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

**Default profile:** `v4-flash`

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

## Configuration

All configuration is done through environment variables in `.env`.

### Core

| Variable | Default | Description |
|---|---|---|
| `DEEPSEEK_API_KEY` | *(required)* | DeepSeek API key for model calls |
| `JEANCLAUDE_MODEL_PROFILE` | `v4-flash` | Model profile: `v4-pro-thinking`, `v4-pro`, `v4-flash-thinking`, `v4-flash` |
| `JEANCLAUDE_MODE` | `direct` | Execution mode: `direct`, `gateway`, or `auto` |
| `JEANCLAUDE_PRIVACY_LOCKDOWN` | `1` | Master privacy switch (enabled by default) |

### Privacy Lockdown

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_PRIVACY_LOCKDOWN` | `1` | Enable privacy lockdown mode |
| `JEANCLAUDE_EPHEMERAL_HOME` | `1` | Use temp directories for each run |
| `JEANCLAUDE_DISABLE_UPDATES` | `1` | Disable JeanClaude auto-updates |
| `JEANCLAUDE_DISABLE_ANTHROPIC_EGRESS` | `1` | Block all Anthropic egress |
| `JEANCLAUDE_DISABLE_GATEWAY_LOG_FILE` | `1` | Disable persistent gateway logs |
| `JEANCLAUDE_GATEWAY_LOG_LEVEL` | `error` | Minimal logging in privacy lockdown |

See [`docs/configuration.md`](./docs/configuration.md) for the complete reference.

## Docker

JeanClaude can run in Docker Compose:

- **`jeanclaude-runner`**: Claude Code with MCP tools and optional gateway
- **`open-responses`**: Open Responses API sidecar
- **`open-responses-integrations`**: Tool integrations service
- **`open-responses-db`**: PostgreSQL/TimescaleDB for memory
- **`open-responses-vectorizer-worker`**: Vector embedding worker
- **`open-responses-migration`**: Database migrations

In privacy lockdown, the Docker image uses ephemeral tmpfs for HOME (no persistent
Claude state), strips all Anthropic auth, and pins Claude Code to an exact version.

```bash
# Build all services
make build

# Start the full stack
docker compose up -d

# Run a command
docker compose run --rm jeanclaude-runner run "explain this repo"
```

See [`docs/docker.md`](./docs/docker.md) for detailed Docker usage.

## Security

JeanClaude authenticates Claude Code only through `DEEPSEEK_API_KEY`. No Anthropic API key
or Anthropic login flow is used. Parent Anthropic auth variables are stripped from the environment.
Claude OAuth tokens are never passed to child processes. In privacy lockdown mode,
ANTHROPIC_BASE_URL is asserted to not point to anthropic.com or claude.ai.

To report a vulnerability, email the maintainers directly. Do not open a public issue.
See [`SECURITY.md`](./SECURITY.md) for the full security policy, dangerous mode risks,
secret redaction policy, gateway security, and supported versions.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

---

**JeanClaude** — Claude Code, powered by DeepSeek, extended with tools. Privacy-first by default.
