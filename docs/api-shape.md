# API Shape

## DeepSeek Anthropic direct path

Endpoint:

- `POST https://api.deepseek.com/anthropic/v1/messages`

Headers:

- `x-api-key: <DEEPSEEK_API_KEY>`
- `anthropic-version: 2023-06-01`

Body pattern:

```json
{
  "model": "deepseek-v4-flash",
  "max_tokens": 256,
  "messages": [
    {"role": "user", "content": "..."}
  ]
}
```

## Open Responses sidecar path

Endpoints used:

- `POST /v1/responses`
- `GET /v1/responses`

Body pattern:

```json
{
  "model": "deepseek/deepseek-v4-flash",
  "input": "...",
  "tools": [],
  "tool_choice": "auto"
}
```

## MCP server methods

- `initialize`
- `tools/list`
- `tools/call`
- `ping`

Transport in this repo is newline-delimited JSON-RPC over stdio.
