# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim

ARG JEANCLAUDE_USER=jeanclaude
ARG JEANCLAUDE_UID=10001
ARG JEANCLAUDE_GID=10001
ARG CLAUDE_CODE_NPM_PACKAGE=@anthropic-ai/claude-code
ARG CLAUDE_CODE_NPM_VERSION=latest

ENV DEBIAN_FRONTEND=noninteractive \
    JEANCLAUDE_HOME=/home/jeanclaude \
    JEANCLAUDE_CLAUDE_HOME=/home/jeanclaude/.claude \
    JEANCLAUDE_WORKDIR=/workspace \
    JEANCLAUDE_MODEL_PROFILE=v4-pro-thinking \
    JEANCLAUDE_ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic \
    JEANCLAUDE_OPEN_RESPONSES_URL=http://open-responses:8080 \
    JEANCLAUDE_MODE=direct \
    JEANCLAUDE_WEB_SEARCH=off \
    JEANCLAUDE_DOCUMENTS=off \
    NODE_ENV=production \
    npm_config_update_notifier=false
# Default profile if JEANCLAUDE_MODEL_PROFILE is not otherwise set
ENV JEANCLAUDE_MODEL_PROFILE=v4-flash

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
    mkdir -p /workspace /opt/jeanclaude/bin /opt/jeanclaude/scripts /opt/jeanclaude/tests /home/jeanclaude/.claude /run/jeanclaude /var/log/jeanclaude; \
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
