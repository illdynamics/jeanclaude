# MCP Tools

JeanClaude exposes a suite of local MCP (Model Context Protocol) tools through the `jeanclaude-tools` stdio server. Claude Code discovers and calls these tools for web search, document processing, and Open Responses synthesis.

## Architecture

```
Claude Code
  │
  ├─ MCP client (built-in)
  │    │
  │    └─ stdio ──▶ /opt/jeanclaude/tools/dist/mcp-server.js
  │                   │
  │                   ├─▶ Open Responses sidecar (http://open-responses:8080)
  │                   │     ├─ Brave web search integration
  │                   │     └─ Response synthesis
  │                   │
  │                   ├─▶ Brave Search API (direct fallback)
  │                   ├─▶ Unstructured API (document partitioning)
  │                   └─▶ Local document store (file-based index)
```

## Transport Protocol

The MCP server communicates with Claude Code via **newline-delimited JSON-RPC over stdio**. Each JSON-RPC message is terminated by a newline character.

### JSON-RPC Methods

| Method | Direction | Description |
|---|---|---|
| `initialize` | Client → Server | Capability negotiation at startup |
| `tools/list` | Client → Server | List available tools with their schemas |
| `tools/call` | Client → Server | Execute a tool with parameters |
| `ping` | Client → Server | Health check |

### Message Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "web_search",
    "arguments": {
      "query": "DeepSeek Claude Code integration",
      "max_results": 10
    }
  }
}
```

Response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"results\": [...], \"source\": \"brave\"}"
      }
    ]
  }
}
```

## Tool Reference

### `deterministic_echo`

Deterministic test tool. Returns a hash of the input token for tool-loop verification.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `token` | string | Yes | Input string to echo back deterministically |

**Example:**

```
tools/call: deterministic_echo({ token: "hello-world" })
→ "echo:d41d8cd98f00b204e9800998ecf8427e:hello-world"
```

**Security:** No side effects. Safe to call at any time. Used for smoke testing the MCP tool loop.

---

### `web_search`

Search the web via Brave Search API, with Open Responses orchestration.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | Yes | — | Search query string |
| `max_results` | number | No | 10 | Maximum number of results (1-20) |
| `freshness` | string | No | — | Time filter: `past_day`, `past_week`, `past_month`, `past_year` |

**Prerequisites:**

- `JEANCLAUDE_WEB_SEARCH=on`
- `BRAVE_API_KEY` set in `.env`

**Example:**

```bash
# Via CLI
jeanclaude web-search "latest DeepSeek Claude Code integration"

# In Claude Code session
> Use web_search to find current best practices for Go error handling.
```

**Behavior:**

- Primary path: Open Responses orchestrates the Brave API call, enriches results.
- Fallback path: If Open Responses web tool path fails, falls back to direct Brave API.
- Fallback indicator: Results include `"mode": "brave-fallback"`.

**Response format:**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"results\": [{\"title\": \"...\", \"url\": \"...\", \"description\": \"...\"}], \"source\": \"brave\"}"
  }]
}
```

---

### `web_fetch`

Fetch and extract content from URLs.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `urls` | string[] | Yes | — | Array of URLs to fetch |
| `max_bytes` | number | No | — | Maximum bytes per URL response |

**Prerequisites:**

- `JEANCLAUDE_WEB_SEARCH=on`
- `BRAVE_API_KEY` set in `.env`

**Security (SSRF Controls):**

By default, `web_fetch` blocks requests to:

- Localhost / loopback (`127.0.0.0/8`, `::1`)
- RFC 1918 private IPv4 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- Link-local (`169.254.0.0/16`)
- Non-HTTP(S) protocols (`file://`, `gopher://`, etc.)

To disable these controls (development only):

```bash
JEANCLAUDE_ALLOW_LOCAL_FETCH=1
```

**Example:**

```
> Use web_fetch to get the content of https://example.com/docs/api
```

---

### `document_ingest`

Ingest a document into the local document store for later querying.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `path` | string | Yes | — | Path to the document (must be under `/workspace`) |
| `collection` | string | No | `"default"` | Collection name for organizing documents |

**Prerequisites:**

- `JEANCLAUDE_DOCUMENTS=on`
- `UNSTRUCTURED_API_KEY` set in `.env` (for rich formats)

**Supported formats:**

| Format | Requirements |
|---|---|
| Plaintext (`.txt`, `.md`, source code) | No additional requirements |
| PDF (`.pdf`) | `UNSTRUCTURED_API_KEY` |
| Word (`.docx`) | `UNSTRUCTURED_API_KEY` |
| PowerPoint (`.pptx`) | `UNSTRUCTURED_API_KEY` |
| Images (`.png`, `.jpg`) | `UNSTRUCTURED_API_KEY` |
| HTML (`.html`) | `UNSTRUCTURED_API_KEY` |

**Security guardrails:**

- Paths outside `/workspace` are blocked
- `.env`, `.env.*` files are blocked
- Key files (`*.pem`, `*.key`, `id_rsa`, `id_ed25519`) are blocked
- Paths under `.git/`, `secrets/`, `node_modules/` are blocked
- Files exceeding `JEANCLAUDE_MAX_INGEST_BYTES` are blocked

**Example:**

```bash
# Via CLI
jeanclaude document ingest ./docs/architecture-proposal.pdf

# Via CLI with custom collection
jeanclaude document ingest ./docs/sprint-notes.md --collection sprints

# In Claude Code session
> Ingest ./docs/api-spec.pdf and summarize its requirements.
```

**Chunk metadata stored:**

- `document_id` — unique document identifier
- `chunk_id` / `chunk_index` — position within document
- `source_path` — original file path
- `collection` — collection name
- `score` — relevance score (set at query time)

---

### `document_query`

Query the local document store for relevant chunks.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | Yes | — | Search query |
| `collection` | string | No | `"default"` | Collection to search |
| `max_results` | number | No | 5 | Maximum number of chunks to return |

**Prerequisites:**

- `JEANCLAUDE_DOCUMENTS=on`
- Documents must have been ingested first via `document_ingest`

**Example:**

```bash
# Via CLI
jeanclaude document query "authentication flow"

# In Claude Code session
> Use document_query to find all references to "rate limiting" in ingested docs.
```

---

### `document_ask`

Answer a question based on ingested documents, using Open Responses for synthesis.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `question` | string | Yes | — | Question to answer |
| `collection` | string | No | `"default"` | Collection to search |

**Prerequisites:**

- `JEANCLAUDE_DOCUMENTS=on`
- Documents must have been ingested first
- Open Responses must be running

**Behavior:**

- Retrieves relevant chunks from the document store
- Sends chunks + question to Open Responses for synthesis
- Refuses when retrieval has zero hits

**Example:**

```bash
# Via CLI
jeanclaude document ask "What does the architecture proposal require for auth?"

# In Claude Code session
> Use document_ask to answer: what are the rate limits specified in our API docs?
```

---

### `open_responses_response`

Send a prompt with optional tools to Open Responses for synthesis. This is the general-purpose tool for using Open Responses as a reasoning backend.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `input` | string | Yes | — | Prompt or question text |
| `tools` | object[] | No | — | Array of tool definitions for the response |

**Prerequisites:**

- Open Responses must be running
- `RESPONSE_API_KEY` set in `.env`

**Example:**

```
> Use open_responses_response to analyze the trade-offs between microservices and monoliths.
```

## Enabling and Disabling Tools

Tools are enabled/disabled via environment variables:

```bash
# Web search tools
JEANCLAUDE_WEB_SEARCH=on       # → web_search, web_fetch available
JEANCLAUDE_WEB_SEARCH=off      # → web_search, web_fetch skipped

# Document tools
JEANCLAUDE_DOCUMENTS=on        # → document_* tools available
JEANCLAUDE_DOCUMENTS=off       # → document_* tools skipped
```

The MCP server always advertises `deterministic_echo` and `open_responses_response` (when Open Responses is up). Web and document tools appear in the tool list only when their feature flags are `on`.

## Testing MCP Tools

```bash
# List available tools
./bin/jeanclaude tools list

# Run smoke tests on all tools
./bin/jeanclaude tools smoke

# Full MCP tool-loop smoke test
./scripts/smoke-mcp-tool-loop.sh

# Web search smoke test
./scripts/smoke-web-search.sh

# Thinking + tools smoke test
./scripts/smoke-thinking-tool-loop.sh
```

## MCP Configuration

The MCP server is configured in `$JEANCLAUDE_CLAUDE_HOME/.mcp.json` (generated at container startup) and copied to `/workspace/.mcp.json`:

```json
{
  "mcpServers": {
    "jeanclaude-tools": {
      "type": "stdio",
      "command": "node",
      "args": ["/opt/jeanclaude/tools/dist/mcp-server.js"],
      "env": {
        "JEANCLAUDE_OPEN_RESPONSES_URL": "...",
        "RESPONSE_API_KEY": "...",
        "JEANCLAUDE_WEB_SEARCH": "...",
        "JEANCLAUDE_DOCUMENTS": "...",
        "JEANCLAUDE_DOCUMENT_STORE": "...",
        "BRAVE_API_KEY": "...",
        "UNSTRUCTURED_API_KEY": "...",
        "UNSTRUCTURED_API_URL": "..."
      }
    }
  }
}
```

Only the allowlisted environment variables are passed to the MCP subprocess. `DEEPSEEK_API_KEY` is not passed — the MCP server never makes direct model API calls.

## Extending MCP Tools

To add a new MCP tool:

1. Implement the tool in `tools/src/` (TypeScript)
2. Register it in `tools/src/mcp-server.ts`
3. Build: `cd tools && npm run build`
4. Rebuild the Docker image: `make build`

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for contribution guidelines.
