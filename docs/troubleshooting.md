# Troubleshooting

Common issues and their solutions when running JeanClaude.

## Core Model Path

### Claude Code still hits Anthropic first-party

**Symptom:** Claude Code connects to `api.anthropic.com` instead of DeepSeek.

**Check:**
```bash
./bin/jeanclaude config
```

Expected:
```
anthropic_base_url=https://api.deepseek.com/anthropic
```

**Fix:**
- Verify `JEANCLAUDE_ANTHROPIC_BASE_URL` in `.env`
- Run `./bin/jeanclaude doctor` to confirm routing
- Rebuild: `make build`

### DeepSeek auth failure (401)

**Symptom:** `Error: 401 Unauthorized` or `Invalid API key`.

**Check:**
```bash
./bin/jeanclaude doctor
```

Look for `api_key: missing` in the output.

**Fix:**
- Ensure `DEEPSEEK_API_KEY` is set in `.env`
- Verify the key is active at [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
- Run `./bin/jeanclaude ping` to verify connectivity
- Run `./scripts/smoke-deepseek-anthropic-direct.sh` for a direct API test

### Model not recognized

**Symptom:** `Error: model not found` or similar.

**Check:**
```bash
./bin/jeanclaude config
```

**Fix:**
- Use a supported model: `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-v4-pro (1M context, internal only)`
- Check `JEANCLAUDE_MODEL` in `.env`
- Run `cat config/model-catalog.json` to see supported models

### Rate limiting (429)

**Symptom:** `Error: 429 Too Many Requests`.

**Fix:**
- Reduce concurrency — run one JeanClaude session at a time
- Check [platform.deepseek.com/usage](https://platform.deepseek.com/usage)
- Consider upgrading your DeepSeek plan
- Add retry logic or backoff in your automation

### Network connectivity

**Symptom:** Timeout or connection refused to `api.deepseek.com`.

**Check from inside the container:**

```bash
./bin/jeanclaude shell
curl -I https://api.deepseek.com/anthropic/v1/messages
```

**Fix:**
- Check your host's internet connection
- Check Docker's DNS: `docker compose run --rm jeanclaude-runner shell` then `nslookup api.deepseek.com`
- Check for corporate proxy: set `HTTP_PROXY`/`HTTPS_PROXY` in `.env` and pass to the runner

## Open Responses

### Open Responses down

**Symptom:** MCP tools that depend on Open Responses fail.

**Check:**
```bash
./bin/jeanclaude open-responses status
./bin/jeanclaude open-responses ping
./bin/jeanclaude open-responses logs
```

**Fix:**
- Start services: `docker compose up -d`
- Check database: `docker compose ps open-responses-db`
- Check migrations: `docker compose logs open-responses-migration`
- Restart: `docker compose restart open-responses`

### Wrong Open Responses implementation still referenced

**Symptom:** Legacy `masaicai/open-responses` references or port `6644` in config.

**Check:**
```bash
./scripts/replace-old-openresponses.sh --check
```

**Fix:**
```bash
./scripts/replace-old-openresponses.sh
```

If it fails, manually remove legacy references in JeanClaude-owned files.

### 401 from Open Responses

**Symptom:** Open Responses returns 401 for MCP tool calls.

**Check:**
- Verify `RESPONSE_API_KEY` in `.env`
- Check if Open Responses expects `Bearer` prefix or raw key
- Run `./bin/jeanclaude open-responses ping`

**Fix:**
- The JeanClaude Open Responses client tries `Authorization: Bearer <key>` first, then raw `Authorization: <key>`
- If neither works, check your Open Responses deployment configuration
- Check `AGENTS_API_KEY_HEADER_NAME` in `docker-compose.yml`

### Open Responses logs show auth errors

**Fix:**
```bash
# Restart with fresh env
docker compose down
docker compose up -d

# Check env in container
docker compose exec open-responses env | grep AGENTS_API_KEY
```

## Web Search

### BRAVE_API_KEY missing

**Symptom:** `web_search` fails or reports "unavailable".

**Check:**
```bash
./bin/jeanclaude doctor
```

Look for `brave_api_key: missing` under `web_search`.

**Fix:**
- Set `JEANCLAUDE_WEB_SEARCH=on` in `.env`
- Set `BRAVE_API_KEY=BSA-...` in `.env`
- Get a key at [brave.com/search/api](https://brave.com/search/api/)

### web_search returns no URLs

**Check:**
```bash
./bin/jeanclaude open-responses ping
./bin/jeanclaude open-responses logs
```

**Possible causes:**
- Open Responses sidecar is down
- Brave API key is invalid
- Fallback path active — check for `"mode": "brave-fallback"` in results
- Brave API rate limit reached

### web_fetch blocked by SSRF

**Symptom:** `web_fetch` returns an error about blocked URL.

**Cause:** The URL is in a blocked range (localhost, private IP, link-local, non-HTTP).

**Fix (development only):**
```bash
JEANCLAUDE_ALLOW_LOCAL_FETCH=1
```

## Documents

### UNSTRUCTURED_API_KEY missing

**Symptom:** `document ingest` for PDF/DOCX/PPTX fails.

**Check:**
```bash
./bin/jeanclaude doctor
```

Look for `unstructured_api_key: missing` under `documents`.

**Fix:**
- Set `JEANCLAUDE_DOCUMENTS=on` in `.env`
- Set `UNSTRUCTURED_API_KEY` in `.env`
- Get a key at [unstructured.io](https://unstructured.io/)

### document ingestion fails

**Check:**
- File path is under `/workspace`
- File is not blocked by guardrails (`.env`, `.git/`, `secrets/`, key files)
- File size is under `JEANCLAUDE_MAX_INGEST_BYTES`
- File format is supported

**Common blocked patterns:**
- `.env`, `.env.production`
- `*.pem`, `*.key`, `id_rsa`, `id_ed25519`
- `.git/**`, `secrets/**`, `node_modules/**`

### document_ask has no hits

**Symptom:** `document_ask` returns "no relevant documents found".

**Fix:**
- Ensure documents have been ingested: `jeanclaude document ingest ./path/to/file`
- Check collection name (default is `"default"`)
- Query with different terms
- Check document store hasn't been deleted

### Clear document store

```bash
rm -rf ./.jeanclaude/documents
```

Documents must be re-ingested after clearing.

## MCP Tools

### MCP server not discovered

**Symptom:** Claude Code doesn't see `jeanclaude-tools`.

**Check:**
```bash
./bin/jeanclaude tools list
```

**Fix:**
- Verify `$JEANCLAUDE_CLAUDE_HOME/.mcp.json` exists
- Verify `enabledMcpjsonServers` in `settings.json` contains `jeanclaude-tools`
- Check MCP server binary: `ls /opt/jeanclaude/tools/dist/mcp-server.js` (inside container)
- Run `./bin/jeanclaude doctor` and check the `mcp` section

### thinking + tools 400 errors

**Symptom:** HTTP 400 when thinking is enabled and tools are called.

**Fix:**
- Keep `JEANCLAUDE_THINKING=disabled` for coding-agent safety
- Treat thinking+tools as experimental
- Run `./scripts/smoke-thinking-tool-loop.sh` to test
- Wait for DeepSeek API updates that fix the interaction

### MCP tools smoke test fails

```bash
# Run the full smoke suite
./scripts/smoke-mcp-tool-loop.sh

# Run individual tool test
./bin/jeanclaude tools smoke
```

If the smoke test fails:
- Ensure Open Responses is running and healthy
- Check MCP server logs: `docker compose logs jeanclaude-runner`
- Verify env variables in the MCP server's scope

## Docker

### Container won't start

```bash
# Check logs
docker compose logs jeanclaude-runner

# Check build
docker compose build --no-cache jeanclaude-runner
```

**Common issues:**
- Missing `DEEPSEEK_API_KEY`
- Port conflicts (8080 already in use)
- Docker daemon not running

### Port conflict (8080)

**Fix:**
```bash
# Change the host port
JEANCLAUDE_OPEN_RESPONSES_PUBLIC_URL=http://127.0.0.1:8081
```

In `docker-compose.yml`:
```yaml
ports:
  - "127.0.0.1:8081:8080"
```

### Permissions issues on mounted files

**Symptom:** "Permission denied" when JeanClaude tries to read/write mounted files.

**Fix:**
- Set `HOST_UID` and `HOST_GID` in `.env` to match your user:
  ```bash
  HOST_UID=$(id -u)
  HOST_GID=$(id -g)
  ```
- Ensure files are owned by the matching UID/GID
- For Podman rootless, ensure mount targets exist

## Build and Package

### Build fails

```bash
# Clean rebuild
docker compose build --no-cache

# Check specific stage
docker compose build --progress=plain jeanclaude-runner
```

**Common issues:**
- npm install fails → check network, npm registry access
- TypeScript compilation fails → check `tools/tsconfig.json`
- Docker disk space → `docker system prune -f`

### package check fails

```bash
./scripts/package.sh --check
```

**Fix:**
- Remove forbidden files from repo scope:
  - `.env`, `.env.*` files (except `.env.example`)
  - `.DS_Store` files
  - `node_modules/`, `dist/`, `build/`
  - `.claude/`, `.claude.json`, `.mcp.local.json`
  - `.jeanclaude/documents/`
  - log files, zip files

### check.sh fails

```bash
./scripts/check.sh
```

Each section of `check.sh` reports failures independently. Common fixes:

| Check | Fix |
|---|---|
| bash syntax | Fix syntax errors in `bin/*` or `scripts/*.sh` |
| shellcheck | Install shellcheck: `brew install shellcheck` |
| tools tests | Fix failing tests in `tools/` |
| gateway tests | Fix failing tests in `gateway/` |
| legacy open responses | Run `./scripts/replace-old-openresponses.sh` |
| package exclusions | Remove forbidden files |
| secret scan | Remove leaked API keys from tracked files |

## General

### Nothing works

```bash
# Full diagnostic
./bin/jeanclaude doctor

# Check env file
cat .env | grep -v '^#' | grep -v '^$'

# Rebuild from scratch
docker compose down -v
docker compose build --no-cache
make build

# Run all smokes
./scripts/smoke-all.sh
```

### Still stuck?

- Verify prerequisites: Docker, DeepSeek API key
- Check [`installation.md`](./installation.md) for setup steps
- Check [`configuration.md`](./configuration.md) for all env vars
- Check logs: `docker compose logs`
- Run the doctor: `./bin/jeanclaude doctor`
