# Security

## Secrets

- Never bake `DEEPSEEK_API_KEY`, `BRAVE_API_KEY`, `UNSTRUCTURED_API_KEY`, `RESPONSE_API_KEY` into images.
- Runtime-only secrets.
- No secret writes to generated Claude settings or MCP config templates.
- Doctor/config output uses redaction.

## MCP env allowlist

MCP subprocess receives only:

- `JEANCLAUDE_OPEN_RESPONSES_URL`
- `RESPONSE_API_KEY`
- `JEANCLAUDE_WEB_SEARCH`
- `JEANCLAUDE_DOCUMENTS`
- `JEANCLAUDE_DOCUMENT_STORE`
- `BRAVE_API_KEY`
- `UNSTRUCTURED_API_KEY`
- `UNSTRUCTURED_API_URL`

`DEEPSEEK_API_KEY` is not passed to MCP by default.

## Web fetch SSRF controls

`web_fetch` blocks:

- localhost / loopback
- RFC1918 private IPv4 ranges
- link-local ranges
- non-http(s) protocols

unless `JEANCLAUDE_ALLOW_LOCAL_FETCH=1` is explicitly set.

## Document ingestion restrictions

- workspace-only paths
- blocked secret-like file patterns
- blocked repo internals (`.git/`, `secrets/`, etc.)
- file-size limit enforcement

## Packaging

`./scripts/package.sh --check` enforces exclusion of:

- `.env*`
- `.claude*`
- `.mcp.local.json`
- `.jeanclaude/documents/`
- build artifacts/logs

## Logs

Debug logs redact sensitive keys/headers where possible.
