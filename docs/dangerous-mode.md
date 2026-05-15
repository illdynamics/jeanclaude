# Dangerous Mode

Dangerous mode (invoked with `--yolo` or `-Y`) automatically approves all Claude Code tool calls without prompting. This document explains what it does, what it doesn't do, when to use it, and the critical safety warnings.

## Important: Dangerous Mode Is Never Enabled by Default

Dangerous mode is **never** enabled by any default setting, model profile, or execution mode. It must be explicitly activated by the operator:

- The `--yolo` / `-Y` CLI flag (per-command)
- Setting `JEANCLAUDE_PERMISSION_MODE=bypassPermissions` in `.env` (all sessions)
- Changing managed settings to `"disableBypassPermissionsMode": "allow"`

**No model profile, thinking profile, or execution mode ever implies dangerous mode.** Profiles like `v4-pro-thinking` or modes like `gateway` do not change your permission configuration.

## What Dangerous Mode Is

Dangerous mode is Claude Code's built-in `--yolo` flag. When enabled, Claude Code does not prompt for permission before executing:

- Bash commands (`rm`, `git`, `docker`, `npm`, etc.)
- File writes and edits
- Network requests (fetch, curl)
- Any other tool that would normally require interactive approval

In normal mode, Claude Code asks "Allow this command?" before each tool call. In dangerous mode, it skips the prompt and executes immediately.

## Permission Modes (New)

JeanClaude v0.2.3+ supports explicit permission modes via `JEANCLAUDE_PERMISSION_MODE` or `--permission-mode`:

| Mode | Description |
|---|---|
| `safe` (default) | Interactive prompts for all tool calls |
| `accept-edits` | Auto-approve file edits, prompt for bash/network |
| `auto` | Auto-approve safe operations |
| `dangerous` | Full bypass — requires safety preflight |
| `bypassPermissions` | Backward compat alias |

## Dangerous Mode Safety Preflight

Starting in v0.2.1, `JEANCLAUDE_PERMISSION_MODE=dangerous` requires a **triple opt-in** safety preflight:

1. **`JEANCLAUDE_DANGEROUS=1`** — Explicitly opts into dangerous mode
2. **`JEANCLAUDE_I_UNDERSTAND_DANGEROUS_MODE=1`** — Acknowledges understanding of the risks
3. **Running in container/CI OR `JEANCLAUDE_ALLOW_HOST_DANGEROUS=1`** — Prevents accidental dangerous mode on bare-metal hosts

Container detection checks: `/.dockerenv`, `/run/.containerenv`, `/proc/1/cgroup`, `CI`, `GITHUB_ACTIONS`, `GITLAB_CI`.

On host machines, dangerous mode will **refuse to start** without `JEANCLAUDE_ALLOW_HOST_DANGEROUS=1`. This prevents accidentally running with full bypass on a developer laptop.

```bash
# This will FAIL on a host machine (missing container/CI)
JEANCLAUDE_PERMISSION_MODE=dangerous jeanclaude -p "bad idea"
# jeanclaude: dangerous permission mode preflight FAILED.

# This will PASS (explicit host approval)
JEANCLAUDE_PERMISSION_MODE=dangerous \
JEANCLAUDE_DANGEROUS=1 \
JEANCLAUDE_I_UNDERSTAND_DANGEROUS_MODE=1 \
JEANCLAUDE_ALLOW_HOST_DANGEROUS=1 \
jeanclaude -p "I know what I'm doing"
```

## How It Works Internally (v0.2.3+)

When `-Y`/`--yolo` is used, JeanClaude now does **three things** to ensure permissions are fully bypassed:

1. **Adds `--dangerously-skip-permissions`** to the Claude Code CLI args (existing behavior)
2. **Sets `CLAUDE_CODE_PERMISSION_MODE=bypassPermissions`** as a child-process environment variable — Claude Code respects this at the environment level
3. **Relaxes `managed-settings.json`** by setting `allowManagedPermissionRulesOnly: false` and `permissions: { grant: ["**"] }` — this prevents Claude Code's managed permission rules from overriding the bypass flag

This triple enforcement ensures that even with Claude Code v2.1.x's managed settings system, permissions are fully bypassed.

### Via Claude Code Passthrough

```bash
# Dangerous mode — auto-approve everything (old method: passthrough)
jeanclaude claude --yolo -p "refactor all TypeScript files"

# Short form — JeanClaude intercepts and handles everything
jeanclaude -Y "deploy to staging"

# Dangerous mode with specific profile
jeanclaude -Y --profile v4-pro -p "migrate the database schema"
```

```bash
# Dangerous mode — auto-approve everything
jeanclaude claude --yolo -p "refactor all TypeScript files"

# Short form
jeanclaude claude -Y "deploy to staging"

# Dangerous mode with specific profile
jeanclaude claude --yolo --profile v4-pro -p "migrate the database schema"
```

### Via Environment Variable

```bash
# In .env — auto-approve all tool calls (backward compat)
JEANCLAUDE_PERMISSION_MODE=bypassPermissions
```

Setting `JEANCLAUDE_PERMISSION_MODE=bypassPermissions` is equivalent to `--yolo` — all permission prompts are bypassed. **This affects all sessions, not just one command.**

For finer control, use the new permission modes:
```bash
# Auto-approve edits only
JEANCLAUDE_PERMISSION_MODE=accept-edits

# Dangerous mode with full safety preflight
JEANCLAUDE_PERMISSION_MODE=dangerous
JEANCLAUDE_DANGEROUS=1
JEANCLAUDE_I_UNDERSTAND_DANGEROUS_MODE=1
# plus container/CI or JEANCLAUDE_ALLOW_HOST_DANGEROUS=1
```

### Managed Settings (v0.2.3+)

JeanClaude v0.2.3+ **automatically relaxes managed settings** when `-Y`/`--yolo` is used. The `rewriteManagedSettingsForYolo()` function rewrites `managed-settings.json` at runtime:

- `allowManagedPermissionRulesOnly` → `false`
- `permissions` → `{ grant: ["**"] }`

This means you **no longer need to manually edit managed settings** to use dangerous mode — JeanClaude handles it for you.

If you want to manually override this behavior, you can pre-write your own `managed-settings.json` at `$CLAUDE_CONFIG_DIR/managed-settings.json` before launching JeanClaude. The runtime rewrite only affects the current session.

## What Dangerous Mode Does NOT Do

Dangerous mode does **not**:

- Bypass Docker container isolation — commands still run inside the container
- Override filesystem permissions — the container user (`jeanclaude`, UID 10001) still respects Unix permissions
- Disable MCP environment allowlisting — MCP tools still receive only allowlisted env vars
- Disable SSRF protections on `web_fetch` — you still need `JEANCLAUDE_ALLOW_LOCAL_FETCH=1`
- Disable document ingestion guardrails — path and pattern restrictions still apply
- Disable package exclusion enforcement in `./scripts/package.sh --check`
- Disable secret redaction in debug/doctor output
- Grant network access beyond the container's network configuration
- Get enabled by any model profile, thinking profile, or execution mode change

**Dangerous mode only skips interactive permission prompts. It does not grant additional privileges.**

## When to Use Dangerous Mode

### Appropriate Uses

| Scenario | Rationale |
|---|---|
| **CI/CD pipelines** | No human to approve prompts; need full automation |
| **Batch processing** | Running the same transformation across many files |
| **Test generation** | Auto-generating tests for an entire codebase |
| **Disposable containers** | Container will be destroyed after the task; no persistent risk |
| **Ephemeral Git worktrees** | Isolated branch that can be discarded |
| **Code migration/refactoring** | Bulk changes that need many tool calls |

### Inappropriate Uses (Never Do This)

| Scenario | Risk |
|---|---|
| **Production servers** | Unrestricted `rm`, `docker`, `kubectl`, `terraform` |
| **Machines with production secrets** | Claude Code could read `.env`, SSH keys, database credentials |
| **Shared environments** | Could affect other users or services |
| **Mounted production directories** | Filesystem access to critical infrastructure |
| **Git repositories with push access** | Could force-push, delete branches, rewrite history |

## Safety Patterns

### Pattern 1: Disposable Container

```bash
# Run in a throwaway container with explicit --rm
docker compose run --rm jeanclaude-runner run --yolo "refactor this"
```

The `--rm` flag ensures the container is destroyed after the command completes.

### Pattern 2: Ephemeral Worktree

```bash
# Create a throwaway git worktree
git worktree add /tmp/jeanclaude-sandbox

# Navigate to it
cd /tmp/jeanclaude-sandbox

# Run dangerous mode in isolation
docker compose -f /path/to/jeanclaude/docker-compose.yml run --rm jeanclaude-runner run --yolo "migrate to new API"

# Review changes before merging
git diff

# Discard the worktree when done
cd /path/to/original/repo
git worktree remove /tmp/jeanclaude-sandbox
```

### Pattern 3: Read-Only Host Mounts

```bash
# docker-compose.override.yml
services:
  jeanclaude-runner:
    volumes:
      - .:/workspace                    # Read-write project
      - ./data:/workspace/data:ro       # Read-only data
```

Even in dangerous mode, read-only mounts prevent accidental modification.

### Pattern 4: Limited Bash Allowlist

Configure Claude Code's `settings.json` to only allow specific commands:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm test *)",
      "Bash(npm run lint *)",
      "Bash(git status *)",
      "Bash(git diff *)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(sudo *)",
      "Bash(docker *)",
      "Bash(kubectl *)",
      "Bash(terraform *)"
    ]
  }
}
```

This gives you "mostly dangerous" mode — auto-approve safe commands while still blocking dangerous ones.

### Pattern 5: Network Isolation

```bash
# No network at all — Claude Code can only work with local files
docker compose run --rm --network none jeanclaude-runner run --yolo "refactor local code"
```

No network means no accidental API calls, no web fetches, no push to remote — only local filesystem operations.

## Permission Model Summary

JeanClaude's permission model has three layers:

| Layer | Controlled By | Effect |
|---|---|---|
| **JeanClaude permission mode** | `JEANCLAUDE_PERMISSION_MODE` / `--permission-mode` | Sets Claude Code's permission behavior |
| **Safety preflight** | `JEANCLAUDE_DANGEROUS`, `JEANCLAUDE_I_UNDERSTAND_DANGEROUS_MODE`, container/CI detection | Prevents accidental dangerous mode on host |
| **Claude Code permissions** | `settings.json` `permissions` block | Controls which tool categories require approval |
| **Managed settings** | `config/managed-settings.template.json` | Can disable bypass-permissions mode entirely |

### Interaction Matrix

| JeanClaude Mode | `--yolo` Flag | Result | Env Var |
|---|---|---|---|
| `safe` (default) | No | Prompts for each tool | — |
| `safe` (default) | Yes | Auto-approves all tools, managed settings relaxed | `CLAUDE_CODE_PERMISSION_MODE=bypassPermissions` |
| `accept-edits` | No | Auto-approves edits, prompts for bash/network | — |
| `auto` | No | Auto-approves safe operations | — |
| `dangerous` | No | Auto-approves all tools (preflight required) | depends |
| `bypassPermissions` | No | Auto-approves all tools, managed settings relaxed | `CLAUDE_CODE_PERMISSION_MODE=bypassPermissions` |

## Warning Signs

Stop using dangerous mode immediately if you see:

- Claude Code attempting `rm -rf /` or any destructive system commands
- Unexpected network requests to unknown hosts
- Git operations you didn't intend (`push --force`, `hard reset`)
- File writes outside your project directory
- Environment variable reads of sensitive values

## Recovery

If dangerous mode runs amok:

1. **Stop the container immediately:**
   ```bash
   docker compose stop jeanclaude-runner
   ```

2. **Check git status:**
   ```bash
   git status
   git diff
   ```

3. **Revert if needed:**
   ```bash
   git checkout -- .
   git clean -fd
   ```

4. **If files were deleted outside git:**
   Check your backup or file recovery tools. JeanClaude does not maintain its own backups.

## TL;DR

- **Dangerous mode = auto-approve all tool calls**
- **Requires triple opt-in**: `JEANCLAUDE_DANGEROUS=1`, `JEANCLAUDE_I_UNDERSTAND_DANGEROUS_MODE=1`, and container/CI or `JEANCLAUDE_ALLOW_HOST_DANGEROUS=1`
- **Never enabled by default — no profile, mode, or setting changes it unless you explicitly do**
- **Only use in isolated containers, VMs, or disposable worktrees**
- **Never use on production systems or with sensitive data**
- **Container isolation, read-only mounts, and network restrictions add safety layers**
- **Use `JEANCLAUDE_PERMISSION_MODE=accept-edits` for a safer middle ground**
- **When in doubt, don't use it**
