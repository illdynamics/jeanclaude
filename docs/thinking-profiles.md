# Thinking Profiles

JeanClaude supports DeepSeek's extended thinking (chain-of-thought reasoning) through its model profile system. This document explains what thinking does, how it's controlled, and the differences between direct and gateway mode thinking behavior.

## What Thinking Does in DeepSeek

Extended thinking allows the model to spend more tokens on internal chain-of-thought reasoning before producing its visible output. The model works through the problem step by step internally, which improves results on complex tasks at the cost of increased latency and token consumption.

DeepSeek supports two thinking formats:

**Anthropic-style** (used by Claude Code / JeanClaude):
```json
{
  "thinking": {"type": "enabled"},
  "output_config": {"effort": "high"}
}
```

**OpenAI-style** (also supported by the DeepSeek API):
```json
{
  "thinking": {"type": "enabled"},
  "reasoning_effort": "high"
}
```

JeanClaude uses the Anthropic-style since it routes through Claude Code.

## Thinking-Enabled vs Thinking-Disabled Profiles

JeanClaude's four model profiles are split into two thinking-enabled and two thinking-disabled:

| Profile | Thinking | Effort |
|---|---|---|
| `v4-pro-thinking` | ✅ enabled | `max` |
| `v4-flash-thinking` | ✅ enabled | `high` |
| `v4-pro` | ❌ disabled | — |
| `v4-flash` | ❌ disabled | — |

**Thinking-enabled profiles** spend extra tokens on internal reasoning. The model may return `reasoning_content` blocks alongside its normal output. These blocks are preserved across tool-call turns when needed (see Tool Loop Caveats below).

**Thinking-disabled profiles** skip the reasoning phase entirely. Responses are faster and cheaper. Use these for well-scoped tasks where deep reasoning doesn't add value.

## Effort Levels

DeepSeek supports two public effort levels:

| Level | Description | Token Impact |
|---|---|---|
| `high` | Moderate chain-of-thought depth | Moderate increase |
| `max` | Maximum reasoning depth | Significant increase |

### Which Profile Uses Which

| Profile | Effort | Rationale |
|---|---|---|
| `v4-pro-thinking` | `max` | Pro model benefits most from maximum reasoning depth |
| `v4-flash-thinking` | `high` | Flash model + max effort would be cost-prohibitive; high balances cost and quality |

### Custom Effort Combinations

Built-in profiles don't cover every combination. Use raw flags for custom setups:

```bash
# v4-pro with high effort (not a built-in profile)
jeanclaude --model deepseek-v4-pro --thinking --effort high -p "complex review"

# v4-flash with max effort (not a built-in profile)
jeanclaude --model deepseek-v4-flash --thinking --effort max -p "deep analysis on a budget"

# No thinking at all
jeanclaude --no-thinking -p "quick fix"
```

## Direct Mode: Best-Effort Thinking

In **direct mode** (default), Claude Code communicates with DeepSeek's API directly. Claude Code owns the Anthropic message/tool loop, including thinking state management.

**Behavior:**

- Claude Code may request thinking in its Anthropic messages
- DeepSeek may or may not return `reasoning_content` — this is a **best-effort** feature in direct mode
- If DeepSeek returns reasoning content, Claude Code preserves it across tool-call turns (when needed)
- If DeepSeek does not return reasoning content, JeanClaude does not insert or fabricate it

**Key limitation:** Direct mode provides no guarantee that thinking is actually applied, because DeepSeek controls whether reasoning content is returned. Claude Code requests it; DeepSeek decides whether to honor it.

```text
Direct mode thinking = Claude Code asks, DeepSeek decides (best-effort)
```

## Gateway Mode: Exact Thinking Control

In **gateway mode**, the JeanClaude gateway sits between Claude Code and DeepSeek. The gateway can enforce an exact thinking policy on every request.

**Behavior:**

- The gateway reads `JEANCLAUDE_THINKING` and `JEANCLAUDE_REASONING_EFFORT`
- On each `/v1/messages` request, the gateway **rewrites the request body** to enforce the configured thinking policy
- If `JEANCLAUDE_THINKING=enabled`, the gateway injects `"thinking": {"type": "enabled"}` into every request
- If `JEANCLAUDE_THINKING=disabled`, the gateway ensures thinking is disabled in every request
- The effort level is set to `JEANCLAUDE_REASONING_EFFORT` (default `high`)

```text
Gateway mode thinking = Gateway enforces exact policy on every request
```

This gives you deterministic control — what you configure is what DeepSeek receives, regardless of what Claude Code might request.

## Tool Loop Caveats

The most challenging interaction is **thinking + tool calls**:

- When thinking is enabled and Claude Code uses tools, DeepSeek may return `reasoning_content` that must be carried forward into the next turn
- If this reasoning content is lost or malformed in transit, DeepSeek may return HTTP 400 errors
- Claude Code handles this preservation in direct mode, but tool-loop + thinking remains experimental

**Recommendations:**

1. **Test before enabling:** Run `scripts/smoke-thinking-tool-loop.sh` to verify thinking + tools works in your environment
2. **Default conservative:** JeanClaude's previous default was `JEANCLAUDE_THINKING=disabled`. The new default (`v4-flash`) does not enable thinking but you can switch to `v4-pro` if you encounter tool-loop issues
3. **Gateway as fallback:** If direct mode thinking + tools fails, switch to gateway mode where the gateway can strip or patch thinking directives

## Per-Command Overrides

```bash
# Enable thinking for one command
jeanclaude --thinking -p "solve this hard problem"

# Disable thinking for one command (even with a thinking-enabled profile)
jeanclaude --no-thinking -p "quick edit"

# Custom effort
jeanclaude --thinking --effort max -p "deep analysis"

# Combine with profile override
jeanclaude --profile v4-flash --thinking --effort high -p "reason on the cheap"
```

Command-line flags override both the profile default and the environment variable.

## Latency and Cost Considerations

| Configuration | Relative Latency | Relative Cost |
|---|---|---|
| `v4-flash` (no thinking) | ★ (fastest) | ★ (cheapest) |
| `v4-flash-thinking` (high effort) | ★★ | ★★ |
| `v4-pro` (no thinking) | ★★ | ★★★ |
| `v4-pro-thinking` (max effort) | ★★★★ (slowest) | ★★★★ (most expensive) |

Thinking tokens count toward your DeepSeek usage. `max` effort can significantly increase token consumption — use it only for problems where the quality improvement justifies the cost.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_THINKING` | Set by profile | `enabled` or `disabled`. Override with `--thinking`/`--no-thinking` |
| `JEANCLAUDE_REASONING_EFFORT` | Set by profile | `high` or `max`. Override with `--effort` |

When using a model profile, these variables are set automatically. You rarely need to set them manually unless you're using raw model flags.

## Related Documentation

- [Model Profiles](./model-profiles.md) — How profiles bundle models with thinking presets
- [Execution Modes](./execution-modes.md) — Direct vs gateway mode thinking behavior
- [Gateway Process Mode](./gateway-process-mode.md) — Running the gateway for exact thinking control
- [DeepSeek Setup](./deepseek-setup.md) — API key and backend configuration
