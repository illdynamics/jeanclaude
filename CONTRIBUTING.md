# Contributing to JeanClaude

Thanks for your interest in contributing! This document covers how to set up a development environment, make changes, and submit contributions.

## Code of Conduct

Be respectful. Be constructive. Assume good intent. We want JeanClaude to be a welcoming project for everyone.

## What to Contribute

We welcome contributions in these areas:

- **Bug fixes**: Found a bug? Fix it and submit a PR.
- **Documentation**: Improvements, corrections, examples.
- **New MCP tools**: Additional MCP tools that extend Claude Code's capabilities.
- **Provider support**: Additional model providers or API backends.
- **Tests**: More test coverage, edge cases, integration tests.
- **Docker improvements**: Better images, smaller sizes, multi-arch support.
- **CLI enhancements**: Better UX, additional subcommands.

## What NOT to Contribute

- Modifications to `claude-code/` — this is a reference tree, not modifiable code.
- Modifications to `open-responses/` — this is a canonical clone, not JeanClaude code.
- Modifications to `gateway/src/` — owned by a different worker.

## Development Setup

### Prerequisites

- Docker (or Podman)
- Node.js 22+
- Git
- A DeepSeek API key

### Setup

```bash
# Clone and enter
git clone https://github.com/your-org/jeanclaude.git
cd jeanclaude

# Copy and configure env
cp .env.example .env
# Edit .env with your API keys

# Build
make build

# Verify
./bin/jeanclaude doctor
```

### MCP Tools Development

The MCP tools are in `tools/`:

```bash
cd tools

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Watch mode (if configured)
npm run build -- --watch
```

- Source: `tools/src/*.ts`
- Tests: `tools/test/*.test.ts`
- Build output: `tools/dist/`

After changing MCP tools, rebuild the Docker image:

```bash
make build
```

### Gateway Development

The gateway is in `gateway/`:

```bash
cd gateway

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

### Scripts

Shell scripts are in `scripts/` and `bin/`:

```bash
# Validate shell scripts
bash -n bin/*
bash -n scripts/*.sh

# Lint with shellcheck (if installed)
shellcheck bin/* scripts/*.sh
```

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/my-feature
```

### 2. Make Changes

- Follow existing code style
- Add tests for new functionality
- Update documentation if needed
- Keep commits focused and atomic

### 3. Run Checks

Before submitting, ensure all checks pass:

```bash
# Full check suite
./scripts/check.sh

# Package validation
./scripts/package.sh --check

# Smoke tests (requires API keys)
./scripts/smoke-all.sh

# Test a specific area
cd tools && npm test
cd gateway && npm test
```

### 4. Commit

Write clear commit messages:

```
feat: add document_summarize MCP tool

Adds a new MCP tool that generates summaries of ingested documents
using Open Responses for synthesis.

Closes #42
```

Use conventional commit prefixes: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`.

### 5. Submit a Pull Request

- Push your branch
- Open a PR against `main`
- Describe what you changed and why
- Reference any related issues
- Ensure CI passes (if configured)

## Pull Request Checklist

Before submitting a PR, verify:

- [x] Code follows project style
- [x] Tests pass: `cd tools && npm test`
- [x] Shell syntax valid: `bash -n bin/* scripts/*.sh`
- [x] Package check passes: `./scripts/package.sh --check`
- [x] No forbidden files in commit (`.env`, `.DS_Store`, `node_modules/`, etc.)
- [x] No secrets in committed code
- [x] Documentation updated for any changed behavior
- [x] Changelog considered (we'll update on release, but mention notable changes in PR)

## Documentation

Documentation lives in `docs/`:

| File | Covers |
|---|---|
| `docs/quickstart.md` | 5-minute getting started |
| `docs/installation.md` | Full installation steps |
| `docs/configuration.md` | Environment variable reference |
| `docs/architecture.md` | System architecture |
| `docs/deepseek-setup.md` | DeepSeek API setup |
| `docs/mcp-tools.md` | MCP tools reference |
| `docs/open-responses.md` | Open Responses integration |
| `docs/docker.md` | Docker usage |
| `docs/dangerous-mode.md` | Dangerous mode guidance |
| `docs/troubleshooting.md` | Common issues |
| `docs/security-model.md` | Security architecture |
| `docs/publishing.md` | Release process |

When adding a new feature, update the relevant doc. When adding a new doc, link it from `README.md`.

## Adding a New MCP Tool

1. **Implement the tool** in `tools/src/`:
   ```typescript
   // tools/src/my-new-tool.ts
   export async function myNewTool(params: MyParams): Promise<ToolResult> {
     // Implementation
   }
   ```

2. **Register it** in `tools/src/mcp-server.ts`:
   ```typescript
   server.setRequestHandler(CallToolRequestSchema, async (request) => {
     switch (request.params.name) {
       case "my_new_tool":
         return await handleMyNewTool(request.params.arguments);
       // ... existing cases
     }
   });
   ```

3. **Add the tool schema** to the tools list handler.

4. **Add tests** in `tools/test/`.

5. **Update documentation** in `docs/mcp-tools.md`.

6. **Build and test**:
   ```bash
   cd tools && npm run build && npm test
   ```

7. **Rebuild the image**:
   ```bash
   make build
   ```

## Adding a New Model Provider

1. Add the model to `config/model-catalog.json`
2. Update the `availableModels` array in the settings generation (in `bin/jeanclaude-entrypoint`)
3. Set the corresponding `ANTHROPIC_BASE_URL` if it uses a different endpoint
4. Add provider documentation
5. Add smoke tests
6. Update `docs/configuration.md` and `docs/deepseek-setup.md`

## Style Guide

### TypeScript

- Use the existing `tsconfig.json` settings
- Prefer explicit types for function signatures
- Use `async/await` over raw promises
- Handle errors explicitly — no silent failures

### Shell Scripts

- `set -Eeuo pipefail` at the top
- Quote all variable expansions
- Use `[[ ]]` over `[ ]`
- Use `printf` over `echo` for variable output
- Use `die()` for fatal errors
- No eval of `.env` — use `libdotenv.sh` for safe loading

### Markdown

- One H1 (`#`) per file
- Fenced code blocks with language tags
- Relative links to other docs
- Tables for reference data
- Keep lines under ~120 characters (soft guideline)

## Testing

### What to Test

- New MCP tool behavior (unit tests)
- Tool listing and smoke tests
- Shell script syntax (`bash -n`)
- Package exclusion enforcement
- Secret pattern detection
- Docker build

### Running Tests

```bash
# All MCP tools tests
cd tools && npm test

# All gateway tests
cd gateway && npm test

# Shell script validation
bash -n bin/* scripts/*.sh

# Full check suite
./scripts/check.sh

# Smoke tests (with API keys)
./scripts/smoke-all.sh
```

## Project Structure

```
jeanclaude/
├── bin/                    # CLI wrapper scripts
│   ├── jeanclaude          # Main entry point
│   ├── jeanclaude-entrypoint  # Container entrypoint
│   ├── jeanclaude-healthcheck  # Docker health check
│   └── jeanclaude-print-config # Config printer
├── config/                 # Settings templates
│   ├── settings.template.json
│   ├── managed-settings.template.json
│   ├── mcp.template.json
│   └── model-catalog.json
├── docs/                   # Documentation
├── gateway/                # Gateway service
│   ├── src/
│   └── package.json
├── infra/                  # Infrastructure
│   └── open-responses/
│       └── migrations/
├── scripts/                # Build, test, smoke scripts
├── tools/                  # MCP tools
│   ├── src/
│   ├── test/
│   ├── dist/
│   └── package.json
├── .env.example            # Environment template
├── docker-compose.yml      # Full Compose definition
├── Dockerfile              # Container build
├── Makefile                # Build targets
├── README.md               # Project overview
├── CHANGELOG.md            # Release history
├── SECURITY.md             # Security policy
└── CONTRIBUTING.md         # This file
```

## Questions?

Open an issue for questions, or reach out to the maintainers.

Thank you for contributing to JeanClaude!
