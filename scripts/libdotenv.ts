/**
 * libdotenv.ts — TypeScript dotenv loader for JeanClaude.
 * Mirrors the behavior of scripts/libdotenv.sh:
 *  - Only loads allowed key patterns
 *  - Never overrides already-set env vars
 *  - Supports export-prefixed lines, quoted values, inline comments
 *  - Honours JEANCLAUDE_NO_DOTENV
 */

import { readFileSync } from "node:fs";

const ALLOWED_KEY_PATTERNS: RegExp[] = [
  /^DEEPSEEK_API_KEY$/,
  /^RESPONSE_API_KEY$/,
  /^BRAVE_API_KEY$/,
  /^UNSTRUCTURED_API_KEY$/,
  /^UNSTRUCTURED_API_URL$/,
  /^OPENAI_API_KEY$/,
  /^ANTHROPIC_API_KEY$/,
  /^OPENROUTER_API_KEY$/,
  /^EMBEDDING_MODEL_ID$/,
  /^MEMORY_STORE_PASSWORD$/,
  /^HOST_UID$/,
  /^HOST_GID$/,
  /^CLAUDE_CODE_NPM_VERSION$/,
  /^OPEN_RESPONSES_IMAGE$/,
  /^OPEN_RESPONSES_TAG$/,
  /^RESPONSE_API_KEY_HEADER_NAME$/,
  /^JEANCLAUDE_BRIDGE_MODE$/,
  /^JEANCLAUDE_/,
  /^OPEN_RESPONSES_/,
];

function isKeyAllowed(key: string): boolean {
  return ALLOWED_KEY_PATTERNS.some((p) => p.test(key));
}

function trimLeadingWs(s: string): string {
  return s.replace(/^[ \t]+/, "");
}

function trimTrailingWs(s: string): string {
  return s.replace(/[ \t]+$/, "");
}

function decodeEnvValue(raw: string): string {
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    let inner = raw.slice(1, -1);
    inner = inner.replace(/\\"/g, '"');
    inner = inner.replace(/\\\\/g, "\\");
    return inner;
  }
  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return raw.slice(1, -1);
  }
  return raw;
}

export function loadDotenv(envFilePath: string): void {
  if (process.env.JEANCLAUDE_NO_DOTENV === "1") return;

  let content: string;
  try {
    content = readFileSync(envFilePath, "utf-8");
  } catch {
    return;
  }

  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    let trimmed = trimLeadingWs(line);
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    if (/^export\s/i.test(trimmed)) {
      trimmed = trimLeadingWs(trimmed.replace(/^export\s*/i, ""));
    }

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const key = trimmed.slice(0, eqIdx).trim();
    let raw = trimLeadingWs(trimmed.slice(eqIdx + 1));

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    if (!raw.startsWith('"') && !raw.startsWith("'")) {
      const commentIdx = raw.indexOf("#");
      if (commentIdx !== -1) raw = raw.slice(0, commentIdx);
      raw = trimTrailingWs(raw);
    }

    const value = decodeEnvValue(raw);

    if (isKeyAllowed(key) && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
