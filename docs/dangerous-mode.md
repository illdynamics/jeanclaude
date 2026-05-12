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

## How to Enable It

### Via Claude Code Passthrough

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
# In .env
JEANCLAUDE_PERMISSION_MODE=bypassPermissions
```

Setting `JEANCLAUDE_PERMISSION_MODE=bypassPermissions` is equivalent to `--yolo` — all permission prompts are bypassed. **This affects all sessions, not just one command.**

### Via Managed Settings

By default, JeanClaude's managed settings disable dangerous mode entirely:

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable"
  }
}
```

This means even `--yolo` won't bypass permissions at the Claude Code level. To allow dangerous mode, you must change this to:

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "allow"
  }
}
```

Edit `config/managed-settings.template.json` and rebuild the image, or modify the generated settings at runtime.

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

JeanClaude's permission model has two layers:

| Layer | Controlled By | Effect |
|---|---|---|
| **Claude Code permissions** | `settings.json` `permissions` block | Controls which tool categories require approval |
| **Managed settings** | `config/managed-settings.template.json` | Can disable bypass-permissions mode entirely |
| **Environment** | `JEANCLAUDE_PERMISSION_MODE` | Sets default permission behavior |

### Interaction Matrix

| Managed Settings | JEANCLAUDE_PERMISSION_MODE | `--yolo` Flag | Result |
|---|---|---|---|
| `disableBypassPermissionsMode: allow` | `default` | No | Prompts for each tool |
| `disableBypassPermissionsMode: allow` | `default` | Yes | Auto-approves all tools |
| `disableBypassPermissionsMode: allow` | `bypassPermissions` | No | Auto-approves all tools |
| `disableBypassPermissionsMode: disable` | `default` | No | Prompts for each tool |
| `disableBypassPermissionsMode: disable` | `default` | Yes | **Still prompts** (bypass disabled) |
| `disableBypassPermissionsMode: disable` | `bypassPermissions` | No | **Still prompts** (bypass disabled) |

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
- **Never enabled by default — no profile, mode, or setting changes it unless you explicitly do**
- **Only use in isolated containers, VMs, or disposable worktrees**
- **Never use on production systems or with sensitive data**
- **Container isolation, read-only mounts, and network restrictions add safety layers**
- **Disable bypass-permissions in managed settings for maximum safety**
- **When in doubt, don't use it**
