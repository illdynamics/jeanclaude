#!/usr/bin/env node

/**
 * fake-claude.mjs — A fake `claude` binary for testing the JeanClaude wrapper.
 *
 * Behaviour:
 *  - Prints its argv and (redacted) environment as JSON to stdout.
 *  - Exits with the code in FAKE_CLAUDE_EXIT_CODE (default 0).
 *  - Delays FAKE_CLAUDE_DELAY_MS milliseconds before replying (default 0).
 *  - When FAKE_CLAUDE_ECHO_STDIN=1, reads stdin to EOF and includes it in the output.
 *
 * Secret redaction mirrors the real wrapper's patterns so tests can verify
 * that the wrapper never leaks secrets into the child's environment.
 */

import { createInterface } from 'node:readline';

// ---- secret-key detection ------------------------------------------------
const EXPLICIT_REDACTED = new Set([
  'DEEPSEEK_API_KEY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'RESPONSE_API_KEY',
  'OPENROUTER_API_KEY',
  'BRAVE_API_KEY',
  'UNSTRUCTURED_API_KEY',
  'MEMORY_STORE_PASSWORD',
  'OPEN_RESPONSES_DB_PASSWORD',
  'OPEN_RESPONSES_REDIS_PASSWORD',
]);

const SUFFIX_PATTERNS = [
  /_API_KEY$/,
  /_SECRET$/,
  /_PASSWORD$/,
  /_TOKEN$/,
  /_AUTH_TOKEN$/,
];

function isSecretKey(key) {
  if (EXPLICIT_REDACTED.has(key)) return true;
  return SUFFIX_PATTERNS.some((re) => re.test(key));
}

// ---- helpers -------------------------------------------------------------
function redactedEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    env[k] = isSecretKey(k) ? '[REDACTED]' : v;
  }
  return env;
}

function buildOutput(stdinText) {
  const out = { argv: process.argv, env: redactedEnv() };
  if (stdinText !== null) out.stdin = stdinText;
  return out;
}

// ---- main ----------------------------------------------------------------
const exitCode = Number.parseInt(process.env.FAKE_CLAUDE_EXIT_CODE ?? '0', 10);
const delayMs  = Number.parseInt(process.env.FAKE_CLAUDE_DELAY_MS  ?? '0', 10);
const echoStdin = process.env.FAKE_CLAUDE_ECHO_STDIN === '1';

function finish(stdinText) {
  setTimeout(() => {
    console.log(JSON.stringify(buildOutput(stdinText)));
    process.exit(exitCode);
  }, delayMs);
}

if (echoStdin && !process.stdin.isTTY) {
  let data = '';
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    data += line + '\n';
  });
  rl.on('close', () => {
    finish(data.replace(/\n$/, ''));
  });
} else {
  finish(null);
}
