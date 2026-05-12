# DeepSeek Setup

JeanClaude uses the [DeepSeek Anthropic-compatible Messages API](https://api.deepseek.com/anthropic) as its core model backend. This document covers getting a DeepSeek API key, choosing a model profile, configuring JeanClaude, and verifying connectivity.

## Why DeepSeek?

DeepSeek provides an Anthropic-compatible Messages API endpoint. Claude Code speaks the Anthropic Messages protocol natively. JeanClaude routes Claude Code's requests to DeepSeek's endpoint by setting `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic` — no proxy, no protocol translation, no middleware.

This means Claude Code (including its system prompts, tool-use patterns, and streaming) works against DeepSeek models with full fidelity to the Anthropic Messages format.

## Getting an API Key

1. Go to [platform.deepseek.com](https://platform.deepseek.com)
2. Sign up or log in
3. Navigate to **API Keys** ([platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys))
4. Click **Create new API key**
5. Copy the key (it starts with `sk-`)

## Configuring JeanClaude

### 1. Set the API Key

In your `.env` file:

```bash
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
```

### 2. Choose a Model Profile

JeanClaude provides four curated model profiles. Pick one:

```bash
# Recommended default — pro model with max-effort thinking
JEANCLAUDE_MODEL_PROFILE=v4-pro-thinking

# Pro model, no thinking (faster, cheaper)
JEANCLAUDE_MODEL_PROFILE=v4-pro

# Flash model with high-effort thinking (balanced)
JEANCLAUDE_MODEL_PROFILE=v4-flash-thinking

# Flash model, no thinking (fastest, cheapest)
JEANCLAUDE_MODEL_PROFILE=v4-flash
```

| Profile | Model | Thinking | Best For |
|---|---|---|---|
| `v4-pro-thinking` | `deepseek-v4-pro` | enabled, `max` | Architecture reviews, complex debugging, hard reasoning |
| `v4-pro` | `deepseek-v4-pro` | disabled | High-capability coding without thinking overhead |
| `v4-flash-thinking` | `deepseek-v4-flash` | enabled, `high` | Cost-effective reasoning, mid-complexity analysis |
| `v4-flash` | `deepseek-v4-flash` | disabled | Fast edits, simple fixes, interactive coding |

See [Model Profiles](./model-profiles.md) for detailed guidance on when to use each profile.

### 3. Verify the Endpoint

```bash
JEANCLAUDE_ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
```

This is the default and should not need changing unless you use a proxy.

## Testing the Connection

### Doctor Check

```bash
./bin/jeanclaude doctor
```

Look for the `api_key` line — it should show a redacted key (e.g., `sk-***...x1z`), not `missing`.

### Ping Test

```bash
./bin/jeanclaude ping
```

This sends a simple message to the DeepSeek API and verifies the response. Expected output:

```
jeanclaude-ping-ok
```

### Direct API Smoke Test

```bash
./scripts/smoke-deepseek-anthropic-direct.sh
```

This test hits the DeepSeek Anthropic endpoint directly (outside Claude Code) to verify the API key, endpoint, and model are all working.

### Full Claude Code Test

```bash
./bin/jeanclaude "say hello and confirm you are running through DeepSeek"
```

The response should mention DeepSeek or the model name you configured.

## How the Routing Works

JeanClaude authenticates Claude Code through DeepSeek's Anthropic-compatible endpoint using `DEEPSEEK_API_KEY`. It sets these environment variables inside the container:

```bash
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_AUTH_TOKEN=<DEEPSEEK_API_KEY>
ANTHROPIC_MODEL=deepseek-v4-pro          # Resolved from your profile
ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro
ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro
ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash
```

Claude Code reads these variables at startup and routes all model calls to the configured endpoint. The request format is standard Anthropic Messages:

```
POST https://api.deepseek.com/anthropic/v1/messages
Headers:
  x-api-key: <DEEPSEEK_API_KEY>
  anthropic-version: 2023-06-01
Body:
  {
    "model": "deepseek-v4-pro",
    "max_tokens": 256,
    "messages": [...]
  }
```

No Anthropic API key or Anthropic login flow is used. JeanClaude strips any parent `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` that might exist in the environment, ensuring only `DEEPSEEK_API_KEY` is used for auth.

## Model Selection Guide

JeanClaude offers two selection approaches:

### Profiles (Recommended)

```bash
# Set in .env
JEANCLAUDE_MODEL_PROFILE=v4-pro-thinking

# Per-command override
jeanclaude --profile v4-flash -p "quick fix"
jeanclaude --profile v4-pro -p "review this PR"
jeanclaude --profile v4-pro-thinking -p "hard architecture review"
jeanclaude --profile v4-flash-thinking -p "moderate debugging"
```

### Raw Model IDs (Legacy)

```bash
# Per-command with model + thinking flags
jeanclaude --model deepseek-v4-pro --thinking --effort max -p "hard review"
jeanclaude --model deepseek-v4-flash --no-thinking -p "quick fix"

# One-off with 1M context window
jeanclaude --model deepseek-v4-pro (1M context, internal only) -p "analyze this huge codebase"
```

### Per-Command Quick Reference

| Task | Profile/Command |
|---|---|
| Deep architecture review | `--profile v4-pro-thinking` |
| PR review, code generation | `--profile v4-pro` |
| Moderate debugging, explanation | `--profile v4-flash-thinking` |
| Quick edits, boilerplate | `--profile v4-flash` |
| Custom combo | `--model deepseek-v4-pro --thinking --effort high` |

## Thinking (Extended Reasoning)

DeepSeek models support extended thinking, which allows the model to spend more tokens on chain-of-thought reasoning before producing output. With model profiles, thinking is set automatically:

| Profile | Thinking | Effort |
|---|---|---|
| `v4-pro-thinking` | enabled | `max` |
| `v4-pro` | disabled | — |
| `v4-flash-thinking` | enabled | `high` |
| `v4-flash` | disabled | — |

Override per-command:

```bash
jeanclaude --profile v4-pro --thinking --effort max -p "pro model with max thinking"
jeanclaude --profile v4-pro-thinking --no-thinking -p "pro model without thinking"
```

### Thinking Limitations

- **Tools + Thinking:** Some DeepSeek API versions return HTTP 400 when thinking is enabled alongside tool calls. Test with `smoke-thinking-tool-loop.sh` before enabling in production.
- **Latency:** Extended thinking increases response time significantly. Use it for complex architecture and debugging, not for quick edits.
- **Cost:** Thinking tokens count toward your DeepSeek usage. Higher effort = more tokens.
- **Direct vs Gateway:** In direct mode, thinking is best-effort (DeepSeek decides). In gateway mode, the gateway enforces exact thinking policy on every request.

See [Thinking Profiles](./thinking-profiles.md) for full details.

## Troubleshooting

### Auth Failure

```
Error: 401 Unauthorized
```

- Check `DEEPSEEK_API_KEY` in `.env`
- Verify the key is active at [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys)
- Run `./bin/jeanclaude doctor` to confirm the key is detected
- Ensure no stray `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` env vars are present — JeanClaude strips these

### Model Not Recognized

```
Error: model not found
```

- Use a valid profile: `v4-pro-thinking`, `v4-pro`, `v4-flash-thinking`, `v4-flash`
- Or a raw model ID: `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-v4-pro (1M context, internal only)`
- Run `./bin/jeanclaude config` to see the current model
- Run `jeanclaude models` to list available profiles

### Invalid Profile

```
Unknown model profile: "opus". Valid profiles are: v4-pro-thinking, v4-pro, v4-flash-thinking, v4-flash
```

- Anthropic model names (`opus`, `sonnet`, `haiku`) are not valid JeanClaude profiles
- Use JeanClaude profiles that map to DeepSeek models
- See [Model Profiles](./model-profiles.md) for the full list

### Rate Limiting

```
Error: 429 Too Many Requests
```

- DeepSeek applies rate limits based on your account tier
- Reduce concurrency (one JeanClaude session at a time)
- Check your usage at [platform.deepseek.com/usage](https://platform.deepseek.com/usage)
- Consider upgrading your DeepSeek plan

### Network Issues

```bash
# Test connectivity from inside the container
./bin/jeanclaude shell
curl -I https://api.deepseek.com/anthropic/v1/messages
```

### Claude Code Still Uses Anthropic

If Claude Code somehow reaches `api.anthropic.com` instead of DeepSeek:

```bash
./bin/jeanclaude config
```

Verify `anthropic_base_url=https://api.deepseek.com/anthropic`. If not, check your `.env` and rebuild:

```bash
make build
```

## Billing and Usage

JeanClaude sends no additional requests beyond what Claude Code generates. Your DeepSeek usage depends on:

- Profile choice (pro vs flash, thinking vs no thinking)
- Thinking effort level (high vs max)
- Conversation length and context size
- Tool call patterns

Monitor your usage at [platform.deepseek.com/usage](https://platform.deepseek.com/usage).

## Related Documentation

- [Model Profiles](./model-profiles.md) — Complete profile guide with when-to-use guidance
- [Thinking Profiles](./thinking-profiles.md) — How thinking works in direct vs gateway modes
- [Configuration](./configuration.md) — Complete environment variable reference
- [Architecture](./architecture.md) — Architecture and data flow
