# MCP Tools

JeanClaude exposes local MCP tools through `jeanclaude-tools`.

## Tool list

- `deterministic_echo(token)`
- `web_search(query, max_results?, freshness?)`
- `web_fetch(urls, max_bytes?)`
- `document_ingest(path, collection?)`
- `document_query(query, collection?, max_results?)`
- `document_ask(question, collection?)`
- `open_responses_response(input, tools?)`

## Example prompts

```bash
jeanclaude run "Use web_search to find current DeepSeek Claude Code docs, cite URLs."
jeanclaude document ingest ./docs/foo.pdf
jeanclaude document ask "What does foo.pdf require?"
```

## Behavior notes

- `web_search` requires `JEANCLAUDE_WEB_SEARCH=on`.
- `document_ingest` requires `JEANCLAUDE_DOCUMENTS=on`.
- `web_fetch` rejects local/private hosts by default.
- `document_ask` refuses when retrieval has no hits.
