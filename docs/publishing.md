# Publishing

This document describes the release process, semantic versioning, package checks, and distribution for JeanClaude.

## Versioning

JeanClaude follows [Semantic Versioning](https://semver.org/):

- **MAJOR** (`1.0.0`): Breaking changes to the CLI, Docker interface, or environment variable contract.
- **MINOR** (`0.2.3`): New features (new MCP tools, new models, new subcommands) in a backward-compatible manner.
- **PATCH** (`0.1.1`): Bug fixes, security patches, documentation improvements.

Current version: **0.2.3** (2026-05-15)

## Pre-Release Checklist

Before tagging a release, all checks must pass:

### 1. Code Quality

```bash
./scripts/check.sh
```

This runs:
- Bash syntax validation (`bash -n`)
- ShellCheck (if installed)
- MCP tools tests (`cd tools && npm test`)
- Gateway tests (`cd gateway && npm test`)
- Legacy Open Responses reference check
- Package exclusion check
- Secret pattern scan

### 2. Package Validation

```bash
./scripts/package.sh --check
```

Creates a test archive and verifies:
- No `.env`, `.env.*` files (except `.env.example`)
- No `.DS_Store` files
- No `.claude/`, `.claude.json`, `.mcp.local.json`
- No `.jeanclaude/documents/`
- No `node_modules/`, `dist/`, `build/`, `coverage/`
- No log files or zip files
- `.env.example` is present

### 3. Smoke Tests

```bash
./scripts/smoke-all.sh
```

Runs all smoke tests:
- Direct DeepSeek API test
- Claude Code integration test
- Open Responses test
- MCP tool-loop test
- Thinking+tools test
- Web search test (skipped if keys missing)
- Document processing test (skipped if keys missing)

### 4. Docker Build

```bash
make build
docker compose up -d
./bin/jeanclaude doctor
./bin/jeanclaude ping
docker compose down
```

### 5. CLI Tests

```bash
./bin/jeanclaude --help
./bin/jeanclaude doctor
./bin/jeanclaude ping
./bin/jeanclaude config
./bin/jeanclaude tools list
./bin/jeanclaude "say hello and verify you are running on DeepSeek"
```

## Release Process

### 1. Update Version Numbers

Update the version in these files:

- `tools/package.json` — `"version": "0.2.3"`
- `CHANGELOG.md` — Add new version section at top

### 2. Update Changelog

Add entries under the new version header:

```markdown
## [0.2.3] — 2026-05-15

### Added
- New feature descriptions

### Changed
- Changed behavior descriptions

### Fixed
- Bug fix descriptions
```

### 3. Create a Package

```bash
./scripts/package.sh ./dist/jeanclaude-0.2.3.zip
```

This creates a clean distribution archive with all forbidden files excluded.

### 4. Verify the Package

```bash
unzip -l ./dist/jeanclaude-0.2.3.zip | grep -E '\.(env|DS_Store|log|zip)$'
# Should have no output (these are excluded)

unzip -l ./dist/jeanclaude-0.2.3.zip | grep '.env.example'
# Should show .env.example (it's included)
```

### 5. Tag and Push

```bash
git tag -a v0.2.3 -m "Release v0.2.3"
git push origin v0.2.3
```

### 6. GitHub Release

Create a release on GitHub:
- Tag: `v0.2.3`
- Title: `v0.2.3`
- Body: Copy the relevant section from `CHANGELOG.md`
- Attach: `./dist/jeanclaude-0.2.3.zip`

### 7. Container Image

If publishing container images:

```bash
# Build with release tag
docker compose build
docker tag jeanclaude:dev your-registry/jeanclaude:0.2.3
docker tag jeanclaude:dev your-registry/jeanclaude:latest
docker push your-registry/jeanclaude:0.2.3
docker push your-registry/jeanclaude:latest
```

## Package Contents

A JeanClaude release package includes:

| Path | Description |
|---|---|
| `README.md` | Project overview and quickstart |
| `CHANGELOG.md` | Release history |
| `SECURITY.md` | Security policy |
| `CONTRIBUTING.md` | Contribution guide |
| `Dockerfile` | Container build definition |
| `docker-compose.yml` | Full stack definition |
| `docker-compose.open-responses.yml` | Open Responses sidecar |
| `Makefile` | Build targets |
| `.dockerignore` | Docker build exclusions |
| `.gitignore` | Git exclusions |
| `.env.example` | Environment template |
| `.drone.yml` | CI pipeline |
| `.mcp.json` | MCP server configuration |
| `bin/` | CLI wrapper scripts |
| `config/` | Settings templates |
| `scripts/` | Build, test, smoke scripts |
| `tools/` | MCP tools source and build |
| `gateway/` | Gateway source and build |
| `docs/` | Documentation |
| `infra/open-responses/migrations/` | Database migrations |

Excluded from packages:

| Pattern | Reason |
|---|---|
| `.env`, `.env.*` | Secrets |
| `.claude/`, `.claude.json` | Runtime config |
| `.mcp.local.json` | Local overrides |
| `.jeanclaude/documents/` | Document store |
| `node_modules/` | Dependencies (installed at build) |
| `dist/`, `build/`, `coverage/` | Build artifacts |
| `*.log`, `logs/` | Debug output |
| `.DS_Store`, `__MACOSX/` | OS metadata |
| `*.zip` | Nested archives |

## CI/CD Pipeline

JeanClaude uses Drone CI for automated builds (`.drone.yml`):

```yaml
# Builds container image on push
# Tags with 'latest' and short commit SHA
# Pushes to configured container registry
```

### CI Pipeline Steps

1. **Build**: Container image build with Buildah
2. **Tag**: Tags with `latest` and commit SHA
3. **Push**: Pushes to registry

### Future CI Enhancements

- Run `./scripts/check.sh` in CI
- Run smoke tests in CI
- Automated GitHub release creation
- Multi-arch image builds

## Distribution Channels

| Channel | Method |
|---|---|
| **GitHub Releases** | Download source archive |
| **Container Registry** | Pull pre-built Docker image |
| **Git Clone** | `git clone` + `make build` |

## Semantic Versioning in Practice

### What Constitutes a Breaking Change

- Removing or renaming an environment variable
- Changing the default value of `JEANCLAUDE_MODE`, `JEANCLAUDE_MODEL`, or `JEANCLAUDE_THINKING`
- Removing a CLI subcommand
- Changing the Docker image user or UID
- Changing the volume mount structure
- Removing a supported model from the model catalog
- Changing the Open Responses image or API version

### What Does NOT Break

- Adding new environment variables (with defaults)
- Adding new CLI subcommands
- Adding new MCP tools
- Adding new supported models
- Bug fixes that maintain existing behavior
- Documentation improvements
- Performance improvements
- New smoke tests

## Rollback

If a release introduces issues:

1. **Git**: `git checkout v0.2.3` to revert to the previous release
2. **Container**: `docker pull your-registry/jeanclaude:0.2.3`
3. **Downgrade**: Update `.env` if needed, rebuild

## Support Policy

| Version | Support |
|---|---|
| Latest minor (0.x) | Full support: bug fixes, security patches |
| Older minors | Best effort |

See [`SECURITY.md`](../SECURITY.md) for security patch policy.
