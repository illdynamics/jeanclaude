# Model Profiles

JeanClaude provides four curated **model profiles** that bundle a DeepSeek model with a thinking preset. Profiles give you one-word selection instead of manually pairing `--model`, `--thinking`, and `--effort`.

## Profile Summary

| Profile | Model | Thinking | Effort | Best For |
|---|---|---|---|---|
| `v4-pro-thinking` | `deepseek-v4-pro` | enabled | `max` | Deep architecture review, complex debugging, hard reasoning |
| `v4-pro` | `deepseek-v4-pro` | disabled | — | High-capability coding without thinking overhead |
| `v4-flash-thinking` | `deepseek-v4-flash` | enabled | `high` | Cost-effective reasoning, mid-complexity analysis |
| `v4-flash` | `deepseek-v4-flash` | disabled | — | Fast edits, simple fixes, interactive coding |

**Default profile:** `v4-pro-thinking`

## Backend Mapping

Each profile resolves to a single DeepSeek model and a thinking configuration:

```text
v4-pro-thinking    → deepseek-v4-pro    + thinking=enabled, effort=max
v4-pro             → deepseek-v4-pro    + thinking=disabled
v4-flash-thinking  → deepseek-v4-flash  + thinking=enabled, effort=high
v4-flash           → deepseek-v4-flash  + thinking=disabled
```

Profiles that enable thinking (`v4-pro-thinking`, `v4-flash-thinking`) also set an effort level:

| Profile | Effort |
|---|---|
| `v4-pro-thinking` | `max` |
| `v4-flash-thinking` | `high` |

There is no `v4-pro-thinking` with `high` effort or `v4-flash-thinking` with `max` effort as a built-in profile. Use explicit `--model deepseek-v4-pro --thinking --effort high` if you need that combination.

## When to Use Each

### `v4-pro-thinking` (Recommended Default)

| Criterion | Assessment |
|---|---|
| Task complexity | High — multi-step architecture, cross-cutting concerns |
| Context size | Large codebases, long conversations |
| Latency tolerance | High — expect longer response times |
| Cost tolerance | Higher — max effort thinking burns more tokens |

Use for: architecture reviews, complex debugging, large refactors, security audits, design discussions where correctness matters more than speed.

### `v4-pro`

| Criterion | Assessment |
|---|---|
| Task complexity | Medium-high — detailed but well-scoped tasks |
| Context size | Medium to large |
| Latency tolerance | Medium |
| Cost tolerance | Medium — pro model without thinking premium |

Use for: detailed PR reviews, code generation, test authoring, documentation writing, any task that needs the pro model's capability but doesn't benefit from extended chain-of-thought.

### `v4-flash-thinking`

| Criterion | Assessment |
|---|---|
| Task complexity | Medium — reasoning helps but doesn't need max effort |
| Context size | Medium |
| Latency tolerance | Medium |
| Cost tolerance | Lower — flash model + high effort is cheaper than pro |

Use for: mid-complexity analysis, debugging moderate issues, explaining code, answering "why" questions about codebase structure. A good balance of reasoning power and cost.

### `v4-flash`

| Criterion | Assessment |
|---|---|
| Task complexity | Low — quick edits, simple transformations |
| Context size | Small to medium |
| Latency tolerance | Low — expect fastest responses |
| Cost tolerance | Lowest — flash model, no thinking |

Use for: quick fixes, simple refactors, adding comments, formatting, generating boilerplate, interactive coding sessions where speed matters.

## Configuration

### Environment Variable

```bash
# In .env
JEANCLAUDE_MODEL_PROFILE=v4-pro-thinking
```

| Variable | Default | Description |
|---|---|---|
| `JEANCLAUDE_MODEL_PROFILE` | `v4-pro-thinking` | Which model profile to use. Must be one of the four valid profiles. |

### CLI Flag

```bash
# Use a specific profile for one command
jeanclaude --profile v4-pro -p "review this PR"

# Interactive session with flash model
jeanclaude --profile v4-flash

# Deep thinking for hard problems
jeanclaude --profile v4-pro-thinking -p "debug this race condition"
```

The `--profile` flag overrides `JEANCLAUDE_MODEL_PROFILE` for that command.

### Legacy Override Compatibility

JeanClaude still supports raw model/thinking/effort flags. These take precedence over profile settings and are used for one-off custom combinations:

```bash
# Raw flags override the profile entirely
jeanclaude --model deepseek-v4-pro --thinking --effort max -p "custom combo"

# This also works but is equivalent to --profile v4-pro
jeanclaude --model deepseek-v4-pro -p "review"
```

## Model Validation

### Valid Profiles

Only these four profile names are accepted:

- `v4-pro-thinking`
- `v4-pro`
- `v4-flash-thinking`
- `v4-flash`

### Rejected Inputs

JeanClaude **rejects** invalid profile names with a clear error message. Examples of what's rejected:

| Input | Rejection Reason |
|---|---|
| `v4-pro-thinknig` | Typo — not a recognized profile |
| `deepseek-v4-pro` | Raw model ID, not a profile name. Use `--model` instead |
| `v4-pro-max` | Not a profile. Use `--profile v4-pro-thinking` for max effort |
| `v4` | Ambiguous — doesn't resolve to a pro/flash + thinking/not combination |
| `opus` | Not a JeanClaude profile. JeanClaude uses DeepSeek models |
| `sonnet` | Not a JeanClaude profile. JeanClaude uses DeepSeek models |
| `haiku` | Not a JeanClaude profile. JeanClaude uses DeepSeek models |
| Empty / unset | Falls back to `JEANCLAUDE_MODEL_PROFILE` default (`v4-pro-thinking`) |

### Validation Message

When an invalid profile is provided, JeanClaude outputs:

```text
Unknown model profile: "<input>". Valid profiles are: v4-pro-thinking, v4-pro, v4-flash-thinking, v4-flash
```

## Deprecated Variables

The following variables are maintained for backward compatibility but are superseded by `JEANCLAUDE_MODEL_PROFILE`:

| Deprecated Variable | Replacement |
|---|---|
| `JEANCLAUDE_MODEL` | `--profile v4-flash` or `JEANCLAUDE_MODEL_PROFILE=v4-flash` |
| `JEANCLAUDE_PRO_MODEL` | `--profile v4-pro` or `JEANCLAUDE_MODEL_PROFILE=v4-pro` |
| `JEANCLAUDE_THINKING` | Built into the profile. `--profile v4-pro-thinking` enables thinking automatically |
| `JEANCLAUDE_REASONING_EFFORT` | Built into the profile. `--profile v4-pro-thinking` sets `effort=max` automatically |

The deprecated variables still work. If both a profile and a deprecated variable are set, **the profile takes precedence** for model selection, and explicit `--thinking`/`--effort` flags override the profile's defaults.

## Related Documentation

- [Thinking Profiles](./thinking-profiles.md) — How thinking works in DeepSeek, effort levels, direct vs gateway control
- [Execution Modes](./execution-modes.md) — Direct, gateway, and auto mode selection
- [Configuration](./configuration.md) — Complete environment variable reference
- [DeepSeek Setup](./deepseek-setup.md) — API key and backend configuration
