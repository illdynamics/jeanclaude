# JeanClaude Quickstart

This guide covers how to build JeanClaude and run it in both interactive and direct prompt modes.

## 1. Prerequisites

Ensure you have Docker (or Podman) and Docker Compose installed.

1.  **Initialize Environment:**
    ```bash
    cp .env.example .env
    ```
2.  **Configure API Keys:**
    Edit `.env` and set at least the `DEEPSEEK_API_KEY`. Other keys (`BRAVE_API_KEY`, `UNSTRUCTURED_API_KEY`) are optional but required for web search and document features.

## 2. Build

Build the runner image and supporting services using the Makefile:

```bash
make build
```

## 3. Verify Health

Run the doctor and ping commands to ensure the environment is correctly configured and the API is reachable:

```bash
./bin/jeanclaude doctor
./bin/jeanclaude ping
```

## 4. Interactive Launch

To start an interactive session with Claude Code:

```bash
./bin/jeanclaude run
```

This will drop you into the Claude Code CLI within the JeanClaude container environment.

## 5. Direct Run Prompt

To execute a single prompt and exit (non-interactive):

```bash
./bin/jeanclaude run "Inspect this repo and summarize the architecture"
```

## Useful Commands

| Goal | Command |
| :--- | :--- |
| View Config | `./bin/jeanclaude config` |
| Container Shell | `./bin/jeanclaude shell` |
| Claude Help | `./bin/jeanclaude claude --help` |
| Open Responses Status | `./bin/jeanclaude open-responses status` |
| Run All Smoke Tests | `./scripts/smoke-all.sh` |
