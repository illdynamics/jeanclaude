# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim

ARG JEANCLAUDE_USER=jeanclaude
ARG JEANCLAUDE_UID=10001
ARG JEANCLAUDE_GID=10001
ARG CLAUDE_CODE_NPM_PACKAGE=@anthropic-ai/claude-code
ARG CLAUDE_CODE_NPM_VERSION=1.0.58

ENV DEBIAN_FRONTEND=noninteractive \
    JEANCLAUDE_HOME=/tmp/jeanclaude-ephemeral \
    JEANCLAUDE_CLAUDE_HOME=/tmp/jeanclaude-ephemeral/.claude \
    JEANCLAUDE_WORKDIR=/workspace \
    JEANCLAUDE_MODEL_PROFILE=v4-pro-thinking \
    JEANCLAUDE_ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \
    JEANCLAUDE_OPEN_RESPONSES_URL=http://open-responses:8080 \
    JEANCLAUDE_MODE=direct \
    JEANCLAUDE_WEB_SEARCH=off \
    JEANCLAUDE_DOCUMENTS=off \
    JEANCLAUDE_PRIVACY_LOCKDOWN=1 \
    JEANCLAUDE_EPHEMERAL_HOME=1 \
    JEANCLAUDE_DISABLE_UPDATES=1 \
    JEANCLAUDE_DISABLE_ANTHROPIC_EGRESS=1 \
    JEANCLAUDE_DISABLE_GATEWAY_LOG_FILE=1 \
    JEANCLAUDE_GATEWAY_LOG_LEVEL=error \
    JEANCLAUDE_DOCUMENT_STORE_EPHEMERAL=1 \
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
    CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL=1 \
    CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1 \
    CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 \
    CLAUDE_CODE_SKIP_PROMPT_HISTORY=1 \
    CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 \
    CLAUDE_CODE_DISABLE_POLICY_SKILLS=1 \
    CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1 \
    CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1 \
    CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1 \
    CLAUDE_CODE_DISABLE_AGENT_VIEW=1 \
    CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 \
    CLAUDE_CODE_DISABLE_CRON=1 \
    CLAUDE_CODE_ENABLE_AWAY_SUMMARY=0 \
    CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false \
    CLAUDE_CODE_ENABLE_TELEMETRY=0 \
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=0 \
    CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL=1 \
    CLAUDE_CODE_AUTO_CONNECT_IDE=false \
    CLAUDE_CODE_MCP_ALLOWLIST_ENV=1 \
    CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1 \
    DISABLE_TELEMETRY=1 \
    DO_NOT_TRACK=1 \
    DISABLE_ERROR_REPORTING=1 \
    DISABLE_FEEDBACK_COMMAND=1 \
    DISABLE_BUG_COMMAND=1 \
    DISABLE_GROWTHBOOK=1 \
    DISABLE_AUTOUPDATER=1 \
    DISABLE_UPDATES=1 \
    DISABLE_UPGRADE_COMMAND=1 \
    DISABLE_LOGIN_COMMAND=1 \
    DISABLE_LOGOUT_COMMAND=1 \
    DISABLE_INSTALLATION_CHECKS=1 \
    DISABLE_INSTALL_GITHUB_APP_COMMAND=1 \
    DISABLE_EXTRA_USAGE_COMMAND=1 \
    ENABLE_CLAUDEAI_MCP_SERVERS=false \
    FORCE_AUTOUPDATE_PLUGINS=0 \
    OTEL_LOG_USER_PROMPTS=0 \
    OTEL_LOG_RAW_API_BODIES=0 \
    OTEL_LOG_TOOL_CONTENT=0 \
    OTEL_LOG_TOOL_DETAILS=0 \
    npm_config_update_notifier=false \
    NO_UPDATE_NOTIFIER=1 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NODE_ENV=production
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      bash ca-certificates curl git jq tini procps unzip zip python3; \
    rm -rf /var/lib/apt/lists/*; \
    npm i -g "${CLAUDE_CODE_NPM_PACKAGE}@${CLAUDE_CODE_NPM_VERSION}"; \
    claude --version || true

RUN set -eux; \
    groupadd -g "${JEANCLAUDE_GID}" "${JEANCLAUDE_USER}"; \
    useradd -m -u "${JEANCLAUDE_UID}" -g "${JEANCLAUDE_GID}" -s /bin/bash "${JEANCLAUDE_USER}"; \
    mkdir -p /workspace /opt/jeanclaude/bin /opt/jeanclaude/scripts /opt/jeanclaude/tests /run/jeanclaude /var/log/jeanclaude; \
    chown -R "${JEANCLAUDE_UID}:${JEANCLAUDE_GID}" /workspace /home/jeanclaude /run/jeanclaude /var/log/jeanclaude

COPY --chmod=0755 bin/jeanclaude /usr/local/bin/jeanclaude
COPY --chmod=0755 bin/jeanclaude-standalone /usr/local/bin/jeanclaude-standalone
COPY bin/jeanclaude-standalone.js /usr/local/bin/jeanclaude-standalone.js
COPY bin/jeanclaude-standalone.ts /opt/jeanclaude/bin/jeanclaude-standalone.ts
COPY --chmod=0755 bin/jeanclaude-entrypoint /usr/local/bin/jeanclaude-entrypoint
COPY --chmod=0755 bin/jeanclaude-healthcheck /usr/local/bin/jeanclaude-healthcheck
COPY --chmod=0755 bin/jeanclaude-print-config /usr/local/bin/jeanclaude-print-config
COPY scripts/libdotenv.js /opt/jeanclaude/scripts/libdotenv.js
COPY scripts/libdotenv.ts /opt/jeanclaude/scripts/libdotenv.ts
COPY tools /opt/jeanclaude/tools
COPY gateway /opt/jeanclaude/gateway
COPY config /etc/jeanclaude

# ── Generate managed settings at build time ──────────────────────────
RUN set -eux; \
    mkdir -p /etc/claude-code; \
    printf '{\n' > /etc/claude-code/managed-settings.json; \
    printf '  "autoMemoryEnabled": false,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "cleanupPeriodDays": 1,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "feedbackSurveyRate": 0,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "awaySummaryEnabled": false,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "autoInstallIdeExtension": false,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "autoConnectIde": false,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "disableAllHooks": true,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "disableRemoteControl": true,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "disableDeepLinkRegistration": "disable",\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "disableSkillShellExecution": true,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "disableAgentView": true,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "disableAutoMode": "disable",\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "allowManagedHooksOnly": true,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "allowManagedMcpServersOnly": true,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "allowManagedPermissionRulesOnly": true,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "channelsEnabled": false,\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "strictKnownMarketplaces": [],\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "blockedMarketplaces": [\n' >> /etc/claude-code/managed-settings.json; \
    printf '    { "source": "github", "repo": "anthropics/claude-code" }\n' >> /etc/claude-code/managed-settings.json; \
    printf '  ],\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "allowedHttpHookUrls": [],\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "enabledPlugins": {},\n' >> /etc/claude-code/managed-settings.json; \
    printf '  "permissions": {\n' >> /etc/claude-code/managed-settings.json; \
    printf '    "deny": [\n' >> /etc/claude-code/managed-settings.json; \
    printf '      "Read(./.env)",\n' >> /etc/claude-code/managed-settings.json; \
    printf '      "Read(./.env.*)",\n' >> /etc/claude-code/managed-settings.json; \
    printf '      "Read(./secrets/**)",\n' >> /etc/claude-code/managed-settings.json; \
    printf '      "Read(./config/credentials.json)"\n' >> /etc/claude-code/managed-settings.json; \
    printf '    ]\n' >> /etc/claude-code/managed-settings.json; \
    printf '  }\n' >> /etc/claude-code/managed-settings.json; \
    printf '}\n' >> /etc/claude-code/managed-settings.json; \
    chown -R "${JEANCLAUDE_UID}:${JEANCLAUDE_GID}" /etc/claude-code

RUN set -eux; \
    if [ -f /opt/jeanclaude/tools/package.json ]; then \
      cd /opt/jeanclaude/tools && npm ci && npm run build && npm prune --omit=dev; \
    fi; \
    if [ -f /opt/jeanclaude/gateway/package.json ]; then \
      cd /opt/jeanclaude/gateway && npm ci && npm run build && npm prune --omit=dev; \
    fi; \
    chown -R "${JEANCLAUDE_UID}:${JEANCLAUDE_GID}" /opt/jeanclaude

USER jeanclaude
WORKDIR /workspace

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD /usr/local/bin/jeanclaude-healthcheck || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/jeanclaude-entrypoint"]
CMD ["claude"]
