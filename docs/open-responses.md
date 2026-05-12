# Open Responses Integration

JeanClaude uses [Open Responses](https://github.com/open-responses/open-responses) as a local sidecar backplane for tool orchestration, web search synthesis, and document-based question answering.

## What Open Responses Does

Open Responses provides:

- **Tool-backed response synthesis:** Send a prompt with available tools, get a response that can call those tools.
- **Web search orchestration:** Proxies and enriches Brave Search API calls.
- **Document Q&A:** Synthesizes answers from ingested document chunks retrieved from the local document store.
- **Multi-provider support:** Can route to DeepSeek, OpenAI, Anthropic, and OpenRouter models for tool synthesis.

## Architecture

```
Claude Code
  │
  └─ MCP (jeanclaude-tools)
       │
       └─ HTTP ──▶ Open Responses API (http://open-responses:8080)
                     │
                     ├─ /v1/responses (POST) — create a response
                     ├─ /v1/responses (GET)  — retrieve response status
                     │
                     ├─▶ Brave Search API (web search integration)
                     ├─▶ Model providers (DeepSeek, OpenAI, etc.)
                     └─▶ PostgreSQL/TimescaleDB (memory/state)
```

## Compose Services

JeanClaude runs Open Responses as a set of Docker Compose services:

| Service | Image | Role |
|---|---|---|
| `open-responses` | `julepai/agents-api` | Core API server (port 8080) |
| `open-responses-integrations` | `julepai/integrations` | Tool integration service |
| `open-responses-db` | `timescale/timescaledb-ha:pg17` | PostgreSQL with TimescaleDB for state/memory |
| `open-responses-vectorizer-worker` | `timescale/pgai-vectorizer-worker` | Vector embedding worker for semantic search |
| `open-responses-migration` | `migrate/migrate` | Database migration runner |

## Configuration

### Essential Env

```bash
# API key for Open Responses auth
RESPONSE_API_KEY=your-secure-random-key

# Container network URL (how JeanClaude's MCP server reaches it)
JEANCLAUDE_OPEN_RESPONSES_URL=http://open-responses:8080

# Host-accessible URL (for debugging from outside the container)
JEANCLAUDE_OPEN_RESPONSES_PUBLIC_URL=http://127.0.0.1:8080
```

### Provider Configuration

Open Responses needs at least one model provider to function:

```bash
# DeepSeek (recommended — matches your JeanClaude setup)
DEEPSEEK_API_KEY=sk-your-deepseek-key

# Optional additional providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
OPENROUTER_API_KEY=sk-...
```

### Model Override

By default, Open Responses uses the same model preference as JeanClaude. To use a different model for tool synthesis:

```bash
JEANCLAUDE_OPEN_RESPONSES_MODEL=deepseek/deepseek-v4-pro
```

### Database Password

```bash
MEMORY_STORE_PASSWORD=your-strong-password-here
```

**Change the default** `obviously_not_a_safe_password` for any non-development environment.

### Service Images

```bash
OPEN_RESPONSES_IMAGE=julepai/agents-api
OPEN_RESPONSES_TAG=responses-latest
```

## Authentication

JeanClaude's Open Responses client uses bearer token authentication:

- **Primary attempt:** `Authorization: Bearer <RESPONSE_API_KEY>`
- **Fallback attempt:** `Authorization: <RESPONSE_API_KEY>` (raw key as header value)

This dual attempt pattern accommodates different Open Responses deployment configurations.

### Environment Mapping

JeanClaude maps its env to Open Responses expectations:

| JeanClaude Env | Open Responses Env |
|---|---|
| `RESPONSE_API_KEY` | `AGENTS_API_KEY` |
| *(configured in compose)* | `AGENTS_API_KEY_HEADER_NAME=Authorization` |

## Managing Open Responses

### Start All Services

```bash
docker compose up -d
```

Or just the Open Responses stack:

```bash
docker compose up -d open-responses open-responses-integrations open-responses-db open-responses-migration open-responses-vectorizer-worker
```

### Status Check

```bash
./bin/jeanclaude open-responses status
```

Shows container status for all Open Responses services.

### Logs

```bash
./bin/jeanclaude open-responses logs
# Follow mode
./bin/jeanclaude open-responses logs -f
```

### Ping

```bash
./bin/jeanclaude open-responses ping
```

Sends a health check request through the MCP client to the Open Responses API.

### Inspection Script

```bash
./scripts/inspect-open-responses.sh
```

Dumps detailed information about the running Open Responses configuration.

## Web Search via Open Responses

When `JEANCLAUDE_WEB_SEARCH=on` and `BRAVE_API_KEY` is set:

1. Claude Code calls `web_search` MCP tool
2. The MCP server calls Open Responses with a search tool definition
3. Open Responses orchestrates the Brave Search API call
4. Results are returned with enrichment metadata

**Fallback behavior:** If Open Responses' web tool path fails, the MCP server falls back to calling the Brave Search API directly. Results include `"mode": "brave-fallback"` to indicate the fallback path was used.

## Document Q&A via Open Responses

When `JEANCLAUDE_DOCUMENTS=on`:

1. Documents are ingested via `document_ingest` → stored in local document store
2. `document_ask` retrieves relevant chunks from the store
3. Retrieved chunks + question are sent to Open Responses for synthesis
4. The synthesized answer is returned to Claude Code

## Testing

```bash
# Open Responses smoke test
./scripts/smoke-open-responses.sh

# Web search through Open Responses
./scripts/smoke-open-responses-web-search.sh

# Document processing through Open Responses
./scripts/smoke-open-responses-document-input.sh

# Full inspection
./scripts/inspect-open-responses.sh
```

## Troubleshooting

### Open Responses Won't Start

```bash
# Check logs
docker compose logs open-responses

# Check database health
docker compose ps open-responses-db
```

Common issues:
- Database migration failed → check `open-responses-migration` logs
- Port conflict → change `RESPONSES_API_PORT` or `JEANCLAUDE_OPEN_RESPONSES_PUBLIC_URL`
- Missing API key → verify `RESPONSE_API_KEY` and at least one provider key

### 401 Unauthorized

- Verify `RESPONSE_API_KEY` matches between `.env` and Open Responses config
- Check if Open Responses expects `Bearer` prefix or raw key
- Run `./bin/jeanclaude open-responses ping` to test auth

### web_search Returns No Results

- Verify `BRAVE_API_KEY` is valid
- Check Open Responses logs: `./bin/jeanclaude open-responses logs`
- The MCP server will fall back to direct Brave API — check for `"mode": "brave-fallback"` in results

### Slow Responses

- Open Responses may be cold-starting (database, migrations, model loading)
- First request after startup can take 10-30 seconds
- Subsequent requests should be faster
- Check `open-responses-vectorizer-worker` status if document operations are slow

## Updating Open Responses

1. Pull latest images:
   ```bash
   docker compose pull open-responses open-responses-integrations
   ```

2. Update image tags in `.env`:
   ```bash
   OPEN_RESPONSES_TAG=responses-latest
   ```

3. Rebuild and restart:
   ```bash
   docker compose up -d --force-recreate
   ```

4. Run smoke tests:
   ```bash
   ./scripts/smoke-open-responses.sh
   ```

## Reference

- Upstream repository: [github.com/open-responses/open-responses](https://github.com/open-responses/open-responses)
- JeanClaude's local reference copy: `./open-responses/` (for inspection, not runtime)
- Container images: `julepai/agents-api`, `julepai/integrations`
