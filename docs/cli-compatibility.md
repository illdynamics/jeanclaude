# Claude Code CLI Compatibility

JeanClaude wraps Claude Code and preserves CLI compatibility. This document explains what passes through, what's added, and any differences.

## How JeanClaude Wraps Claude Code

JeanClaude uses Docker Compose to run Claude Code inside a container. The `./bin/jeanclaude` script manages container lifecycle and passes commands through:

```
./bin/jeanclaude <jeanclaude-flags> <subcommand> <claude-code-args>
```

## Claude Code Features Preserved

All standard Claude Code features work through JeanClaude:

| Feature | Status | Notes |
|---|---|---|
| Interactive sessions | ✅ | `./bin/jeanclaude` |
| Prompt mode (`-p`) | ✅ | `./bin/jeanclaude run "..."` |
| Tool use | ✅ | Via MCP and Claude Code built-in tools |
| File editing | ✅ | Mounted workspace is read-write |
| Git awareness | ✅ | `includeGitInstructions: true` |
| Custom instructions | ✅ | CLAUDE.md support |
| Hooks | ⚠️ | Disabled by default (`disableAllHooks: true`) |
| Skills | ⚠️ | Shell execution disabled (`disableSkillShellExecution: true`) |
| Remote control | ⚠️ | Disabled by default (`disableRemoteControl: true`) |
| Memory | ⚠️ | Disabled by default (`autoMemoryEnabled: false`) |
| Official marketplace | ⚠️ | Auto-install disabled |

### Why Some Features Are Disabled

JeanClaude disables certain Claude Code features by default for security and predictability:

- **Hooks**: Claude Code hooks can execute arbitrary commands. Disabled to prevent supply-chain risks.
- **Skill shell execution**: Skills that run shell commands are disabled.
- **Remote control**: Prevents external control of the JeanClaude instance.
- **Memory**: Long-term memory requires filesystem writes beyond the workspace.
- **Marketplace auto-install**: Prevents automatic installation of unvetted plugins.

These can be re-enabled by modifying `config/settings.template.json` if you understand the risks.

## JeanClaude-Specific Commands

JeanClaude adds these subcommands on top of Claude Code:

| Command | Description |
|---|---|
| `doctor` | Full environment diagnostics |
| `ping` | DeepSeek API connectivity test |
| `config` | Print current configuration |
| `shell` | Bash shell inside the container |
| `open-responses status` | Open Responses service status |
| `open-responses logs` | Open Responses logs |
| `open-responses ping` | Open Responses health check |
| `tools list` | List available MCP tools |
| `tools smoke` | Smoke test MCP tools |
| `web-search "query"` | Direct web search via CLI |
| `document ingest <path>` | Ingest a document |
| `document ask "question"` | Ask about ingested documents |
| `document query "query"` | Query document store |

## CLI Examples

### Direct Claude Code Passthrough

```bash
# JeanClaude passthrough
./bin/jeanclaude claude --help
./bin/jeanclaude claude --version
./bin/jeanclaude claude -p "explain this file"
./bin/jeanclaude claude --yolo -p "refactor all tests"  # dangerous mode
```

### JeanClaude Convenience Wrappers

```bash
# Interactive session (equivalent to 'claude' with no args)
./bin/jeanclaude

# Single prompt (equivalent to 'claude -p')
./bin/jeanclaude "explain this repo"

# Prompt with explicit -p
./bin/jeanclaude run -p "write tests"

# Run subcommand
./bin/jeanclaude run "explain this"
```

### Model and Thinking Flags

```bash
# JeanClaude flags before the subcommand
./bin/jeanclaude --model deepseek-v4-pro -p "complex review"
./bin/jeanclaude --thinking --effort max -p "deep analysis"
./bin/jeanclaude --no-thinking -p "quick fix"
```

### Dangerous Mode

```bash
# Through Claude Code passthrough
./bin/jeanclaude claude --yolo -p "refactor everything"

# Short form
./bin/jeanclaude claude -Y "deploy to staging"
```

## Environment Variables vs Claude Code

JeanClaude sets these Claude Code environment variables automatically:

| JeanClaude Config | Claude Code Env |
|---|---|
| `JEANCLAUDE_ANTHROPIC_BASE_URL` | `ANTHROPIC_BASE_URL` |
| `DEEPSEEK_API_KEY` | `ANTHROPIC_AUTH_TOKEN` |
| `JEANCLAUDE_MODEL` | `ANTHROPIC_MODEL` |
| `JEANCLAUDE_PRO_MODEL` | `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL` |
| `deepseek-v4-flash` | `ANTHROPIC_DEFAULT_HAIKU_MODEL` |
| `JEANCLAUDE_REASONING_EFFORT` | `CLAUDE_CODE_EFFORT_LEVEL` |
| *(thinking disabled)* | `CLAUDE_CODE_DISABLE_THINKING=1` |

Additional Claude Code settings:

```bash
CLAUDE_CODE_MCP_ALLOWLIST_ENV=1
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL=1
```

## Differences from Native Claude Code

### Model Names

Claude Code natively uses Anthropic model names (`claude-sonnet-4-20250514`, etc.). JeanClaude maps these to DeepSeek models:

| Claude Code Internal Model | JeanClaude Mapping |
|---|---|
| Opus | `deepseek-v4-pro` |
| Sonnet | `deepseek-v4-pro` |
| Haiku | `deepseek-v4-flash` |

### API Endpoint

Native Claude Code → `https://api.anthropic.com/v1/messages`
JeanClaude → `https://api.deepseek.com/anthropic/v1/messages`

### Auth Header

Native Claude Code: `x-api-key: <ANTHROPIC_API_KEY>`
JeanClaude: `x-api-key: <DEEPSEEK_API_KEY>`

### Streaming

Claude Code streaming (SSE) works with DeepSeek's endpoint. No protocol translation needed.

### Tool Use

Claude Code's native tool-use format (function calls in content blocks) is fully supported by DeepSeek's Anthropic-compatible endpoint. JeanClaude extends this with additional MCP tools.

### System Prompts

Claude Code's system prompts are passed through unmodified. DeepSeek models handle them via the `system` field in the Anthropic Messages format.

## Limitations

### Not Supported

- **Anthropic-specific features**: Prompt caching, citations, extended thinking with tools (may vary by DeepSeek API version)
- **Claude Code official marketplace**: Auto-install disabled; use only `jeanclaude-tools` MCP server
- **Claude Code remote control**: Disabled by default

### Experimental

- **Thinking + tools**: Some DeepSeek API versions return 400 errors when thinking is enabled with tool calls. Keep `JEANCLAUDE_THINKING=disabled` and test with `smoke-thinking-tool-loop.sh`.
- **Streaming behavior**: Minor differences in SSE framing between Anthropic and DeepSeek implementations.

## Compatibility Matrix

| Feature | Claude Code (Anthropic) | JeanClaude (DeepSeek) |
|---|---|---|
| Interactive chat | ✅ | ✅ |
| `-p` prompt mode | ✅ | ✅ |
| File read/write | ✅ | ✅ |
| Git operations | ✅ | ✅ |
| Bash commands | ✅ | ✅ |
| MCP tools | ✅ | ✅ (jeanclaude-tools) |
| Tool use (function calling) | ✅ | ✅ |
| Streaming | ✅ | ✅ |
| System prompts | ✅ | ✅ |
| Extended thinking | ✅ | ⚠️ (experimental with tools) |
| Prompt caching | ✅ | ❌ |
| Citations | ✅ | ❌ |
| Official marketplace | ✅ | ❌ (disabled) |
| Hooks | ✅ | ❌ (disabled by default) |
| Remote control | ✅ | ❌ (disabled by default) |
| Memory | ✅ | ❌ (disabled by default) |

## Upgrading Claude Code

To use a newer version of Claude Code:

```bash
# Rebuild with specific version
CLAUDE_CODE_NPM_VERSION=1.2.3 make build

# Or use latest
CLAUDE_CODE_NPM_VERSION=latest make build
```

Test thoroughly after upgrading — a new Claude Code version may change behavior, settings format, or MCP protocol expectations.

See the [Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) for upstream changes.
