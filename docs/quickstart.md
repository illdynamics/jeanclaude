# Quickstart

Get JeanClaude running in 5 minutes.

## 1. Prerequisites

You need:

- **Docker** (or Podman with `podman compose`)
- **A DeepSeek API key** — get one at [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)

That's it. Node.js and Claude Code are installed inside the Docker image.

## 2. Clone and Configure

```bash
git clone https://github.com/your-org/jeanclaude.git
cd jeanclaude
```

Copy the environment template:

```bash
cp .env.example .env
```

Edit `.env` and set your DeepSeek API key:

```bash
DEEPSEEK_API_KEY=sk-your-actual-key-here
```

The defaults are sensible — `deepseek-v4-flash` model, direct routing, thinking disabled, web search and documents off.

## 3. Build

```bash
make build
```

This builds the JeanClaude runner image with Claude Code installed. The first build downloads base images and npm packages — it may take a minute or two.

If you use Podman instead of Docker:

```bash
COMPOSE=podman compose make build
```

The Makefile auto-detects Podman if Docker is not available.

## 4. Verify

Run the doctor to check your configuration:

```bash
./bin/jeanclaude doctor
```

You should see:

```
JeanClaude doctor
-----------------
mode: direct
model: deepseek-v4-flash
api_key: sk-***... (redacted)
open_responses:
  status: up
web_search:
  enabled: off
documents:
  enabled: off
mcp:
  jeanclaude-tools: configured
```

Ping the DeepSeek API to confirm connectivity:

```bash
./bin/jeanclaude ping
```

Should return `jeanclaude-ping-ok`.

## 5. Run

### Interactive session

```bash
./bin/jeanclaude
```

This drops you into Claude Code (backed by DeepSeek) inside the container, mounted at your current directory.

### Single prompt

```bash
./bin/jeanclaude "explain this repo"
```

The prompt runs, prints the response, and exits.

### With thinking enabled

```bash
./bin/jeanclaude --thinking --effort max -p "deep debug this issue"
```

### Using the pro model

```bash
./bin/jeanclaude --model deepseek-v4-pro -p "design a scalable architecture"
```

## Next Steps

- Enable web search: set `JEANCLAUDE_WEB_SEARCH=on` and `BRAVE_API_KEY` in `.env`
- Enable document processing: set `JEANCLAUDE_DOCUMENTS=on` and `UNSTRUCTURED_API_KEY`
- Read [`configuration.md`](./configuration.md) for all options
- Read [`deepseek-setup.md`](./deepseek-setup.md) for DeepSeek API details
- Read [`docker.md`](./docker.md) for advanced Docker usage
- Run `./bin/jeanclaude --help` for all CLI commands
- Run `./scripts/smoke-all.sh` to validate your setup end-to-end
