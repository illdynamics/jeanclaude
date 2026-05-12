# Claude Code Notes

## Install assumptions

JeanClaude runner installs:

```bash
npm i -g @anthropic-ai/claude-code@<version>
```

## Runtime config generation

At container startup, JeanClaude writes:

- `$JEANCLAUDE_CLAUDE_HOME/settings.json`
- `$JEANCLAUDE_CLAUDE_HOME/.mcp.json`
- project copy: `/workspace/.mcp.json`

## Anthropic env routing

JeanClaude sets:

- `ANTHROPIC_BASE_URL`
- `ANTHROPIC_AUTH_TOKEN`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_DEFAULT_*_MODEL`

to route Claude Code to DeepSeek Anthropic-compatible API.

## Managed settings and permissions

Template files are provided under `config/`.
Adjust managed policy and permission mode for your environment before broader rollout.
