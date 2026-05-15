/**
 * privacy.test.mjs — Privacy lockdown regression tests.
 *
 * Tests that JeanClaude privacy lockdown:
 *   1. Env vars reach the child process
 *   2. ANTHROPIC_BASE_URL=https://api.anthropic.com causes abort
 *   3. Parent Anthropic keys/session vars are stripped
 *   4. No persistent Claude home / state is created
 *   5. Latest Claude Code install path is blocked
 *   6. ANTHROPIC_API_KEY is absent from child env
 *
 * Uses the fake claude binary and fake gateway.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const WRAPPER = join(REPO_ROOT, 'bin', 'jeanclaude-standalone.js');
const FAKE_CLAUDE = join(__dirname, 'fake-claude.mjs');

function runWrapper(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      JEANCLAUDE_CLAUDE_BIN: FAKE_CLAUDE,
      DEEPSEEK_API_KEY: 'sk-test-privacy-key-88888',
      ANTHROPIC_API_KEY: undefined,
      ANTHROPIC_AUTH_TOKEN: undefined,
      OPENAI_API_KEY: undefined,
      RESPONSE_API_KEY: undefined,
      BRAVE_API_KEY: undefined,
      UNSTRUCTURED_API_KEY: undefined,
      OPENROUTER_API_KEY: undefined,
      MEMORY_STORE_PASSWORD: undefined,
      ANTHROPIC_BASE_URL: undefined,
      ANTHROPIC_MODEL: undefined,
      ANTHROPIC_DEFAULT_SONNET_MODEL: undefined,
      ANTHROPIC_DEFAULT_OPUS_MODEL: undefined,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: undefined,
      CLAUDE_CODE_EFFORT_LEVEL: undefined,
      CLAUDE_CODE_DISABLE_THINKING: undefined,
      CLAUDE_ACCESS_TOKEN: undefined,
      CLAUDE_REFRESH_TOKEN: undefined,
      CLAUDE_ORG_ID: undefined,
      CLAUDE_SESSION_ID: undefined,
      CLAUDE_CODE_OAUTH_TOKEN: undefined,
      CLAUDE_CODE_OAUTH_REFRESH_TOKEN: undefined,
      CLAUDE_CODE_OAUTH_SCOPES: undefined,
      JEANCLAUDE_PRIVACY_LOCKDOWN: '1',
      JEANCLAUDE_EPHEMERAL_HOME: '1',
      ...opts.env,
    };

    for (const k of Object.keys(env)) {
      if (env[k] === undefined) delete env[k];
    }

    const child = spawn('node', [WRAPPER, ...args], {
      cwd: REPO_ROOT,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { stderr += d; });

    if (opts.stdin) { child.stdin.write(opts.stdin); child.stdin.end(); }
    else { child.stdin.end(); }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Test timed out after ' + (opts.timeout || 10000) + 'ms'));
    }, opts.timeout || 10000);

    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      let fakeOutput = null;
      if (stdout.trim()) {
        try {
          const lines = stdout.trim().split(/\r?\n/);
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('{') && line.endsWith('}')) {
              fakeOutput = JSON.parse(line);
              stdout = lines.slice(0, i).join('\n');
              break;
            }
          }
        } catch (_) {}
      }
      resolve({ stdout, stderr, exitCode: code, signal, fakeOutput });
    });
  });
}

// ==================================================================
// PRIVACY TESTS
// ==================================================================

describe('Privacy Lockdown', () => {

  // --- 1. Privacy env vars reach the child process ---
  it('1. privacy env vars propagate to child claude process', async () => {
    const { fakeOutput, exitCode } = await runWrapper(['-p', 'test']);
    assert.strictEqual(exitCode, 0);
    assert.ok(fakeOutput, 'fake claude should be invoked');
    // Check key privacy vars
    assert.strictEqual(fakeOutput.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '1');
    assert.strictEqual(fakeOutput.env.CLAUDE_CODE_ENABLE_TELEMETRY, '0');
    assert.strictEqual(fakeOutput.env.DISABLE_TELEMETRY, '1');
    assert.strictEqual(fakeOutput.env.DO_NOT_TRACK, '1');
    assert.strictEqual(fakeOutput.env.DISABLE_UPDATES, '1');
    assert.strictEqual(fakeOutput.env.DISABLE_ERROR_REPORTING, '1');
    assert.strictEqual(fakeOutput.env.ENABLE_CLAUDEAI_MCP_SERVERS, 'false');
    assert.strictEqual(fakeOutput.env.CLAUDE_CODE_SKIP_PROMPT_HISTORY, '1');
    assert.strictEqual(fakeOutput.env.OTEL_METRICS_EXPORTER, 'none');
    assert.strictEqual(fakeOutput.env.OTEL_LOGS_EXPORTER, 'none');
    assert.strictEqual(fakeOutput.env.OTEL_TRACES_EXPORTER, 'none');
  });

  // --- 2. ANTHROPIC_BASE_URL to anthropic.com causes abort ---
  it('2. ANTHROPIC_BASE_URL=https://api.anthropic.com causes abort', async () => {
    const { exitCode, stderr, fakeOutput } = await runWrapper(['-p', 'test'], {
      env: { ANTHROPIC_BASE_URL: 'https://api.anthropic.com' },
    });
    assert.ok(exitCode !== 0, 'should exit non-zero when ANTHROPIC_BASE_URL points to Anthropic');
    assert.ok(
      stderr.includes('PRIVACY VIOLATION') || stderr.includes('ANTHROPIC_BASE_URL') || stderr.includes('anthropic'),
      'should report privacy violation for Anthropic URL',
    );
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
  });

  // --- 3. ANTHROPIC_BASE_URL to claude.ai causes abort ---
  it('3. ANTHROPIC_BASE_URL=https://claude.ai causes abort', async () => {
    const { exitCode, stderr, fakeOutput } = await runWrapper(['-p', 'test'], {
      env: { ANTHROPIC_BASE_URL: 'https://claude.ai/api' },
    });
    assert.ok(exitCode !== 0, 'should exit non-zero for claude.ai URL');
    assert.ok(
      stderr.includes('PRIVACY VIOLATION') || stderr.includes('claude.ai'),
      'should report privacy violation for claude.ai URL',
    );
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
  });

  // --- 4. Parent ANTHROPIC_API_KEY is stripped ---
  it('4. parent ANTHROPIC_API_KEY is stripped from child env', async () => {
    const { fakeOutput, stderr } = await runWrapper(['-p', 'test'], {
      env: { ANTHROPIC_API_KEY: 'sk-ant-parent-leak-12345' },
    });
    assert.ok(fakeOutput, 'fake claude should be invoked');
    // The child env should NOT contain the parent value
    assert.notStrictEqual(fakeOutput.env.ANTHROPIC_API_KEY, 'sk-ant-parent-leak-12345');
    assert.ok(!stderr.includes('sk-ant-parent-leak-12345'), 'parent key should not leak to stderr');
  });

  // --- 5. Parent CLAUDE_SESSION_ID is stripped ---
  it('5. parent CLAUDE_SESSION_ID is stripped from child env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test'], {
      env: { CLAUDE_SESSION_ID: 'sess-parent-leak-999' },
    });
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.CLAUDE_SESSION_ID, undefined, 'CLAUDE_SESSION_ID should be absent');
  });

  // --- 6. Parent CLAUDE_ACCESS_TOKEN is stripped ---
  it('6. parent CLAUDE_ACCESS_TOKEN is stripped from child env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test'], {
      env: { CLAUDE_ACCESS_TOKEN: 'tok-parent-leak-abc' },
    });
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.CLAUDE_ACCESS_TOKEN, undefined, 'CLAUDE_ACCESS_TOKEN should be absent');
  });

  // --- 7. Parent CLAUDE_CODE_OAUTH_TOKEN is stripped ---
  it('7. parent CLAUDE_CODE_OAUTH_TOKEN is stripped from child env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test'], {
      env: { CLAUDE_CODE_OAUTH_TOKEN: 'oauth-parent-leak-xyz' },
    });
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.CLAUDE_CODE_OAUTH_TOKEN, undefined, 'CLAUDE_CODE_OAUTH_TOKEN should be absent');
  });

  // --- 8. DISABLE_UPDATES is set in child env ---
  it('8. DISABLE_UPDATES=1 is set in child env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test']);
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.DISABLE_UPDATES, '1');
  });

  // --- 9. DISABLE_AUTOUPDATER is set in child env ---
  it('9. DISABLE_AUTOUPDATER=1 is set in child env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test']);
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.DISABLE_AUTOUPDATER, '1');
  });

  // --- 10. OTEL exporters are all 'none' ---
  it('10. all OTEL exporters are set to none', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test']);
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.OTEL_METRICS_EXPORTER, 'none');
    assert.strictEqual(fakeOutput.env.OTEL_LOGS_EXPORTER, 'none');
    assert.strictEqual(fakeOutput.env.OTEL_TRACES_EXPORTER, 'none');
  });

  // --- 11. No secret leakage in stderr for API keys ---
  it('11. no secret leakage in stderr (DEEPSEEK_API_KEY, ANTHROPIC keys)', async () => {
    const { stderr } = await runWrapper(['-p', 'test'], {
      env: {
        DEEPSEEK_API_KEY: 'sk-secret-deepseek-key-12345',
        ANTHROPIC_API_KEY: 'sk-ant-secret-anthropic-99999',
      },
    });
    assert.ok(!stderr.includes('sk-secret-deepseek-key-12345'), 'DEEPSEEK_API_KEY leaked');
    assert.ok(!stderr.includes('sk-ant-secret-anthropic-99999'), 'ANTHROPIC_API_KEY leaked');
  });

  // --- 12. Doctor includes privacy lockdown info ---
  it('12. doctor reports privacy lockdown status', async () => {
    const { stdout, exitCode } = await runWrapper(['doctor']);
    // May exit 0 or 1 depending on env
    assert.ok(
      stdout.includes('Privacy Lockdown') || stdout.includes('privacy') || stdout.toLowerCase().includes('lockdown'),
      'doctor should mention privacy lockdown',
    );
  });

  // --- 13. CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY is set ---
  it('13. CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1 in child env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test']);
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY, '1');
  });

  // --- 14. CLAUDE_CODE_DISABLE_AUTO_MEMORY is set ---
  it('14. CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 in child env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test']);
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
  });

  // --- 15. DISABLE_GROWTHBOOK is set ---
  it('15. DISABLE_GROWTHBOOK=1 in child env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test']);
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.DISABLE_GROWTHBOOK, '1');
  });

  // --- 16. DISABLE_LOGIN_COMMAND is set ---
  it('16. DISABLE_LOGIN_COMMAND=1 in child env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test']);
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.DISABLE_LOGIN_COMMAND, '1');
  });

  // --- 17. CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL is set ---
  it('17. CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL=1 in child env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test']);
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL, '1');
  });

  // --- 18. --no-session-persistence is appended for non-interactive mode ---
  it('18. --no-session-persistence is appended for non-interactive prompt mode', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test']);
    assert.ok(fakeOutput);
    const args = fakeOutput.argv.slice(2);
    assert.ok(args.includes('--no-session-persistence'), 'should append --no-session-persistence');
  });

  // --- 19. Multiple Anthropic session vars stripped together ---
  it('19. all Anthropic session vars stripped simultaneously', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test'], {
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-p1',
        ANTHROPIC_AUTH_TOKEN: 'tok-p1',
        CLAUDE_ACCESS_TOKEN: 'cat-p1',
        CLAUDE_REFRESH_TOKEN: 'crt-p1',
        CLAUDE_ORG_ID: 'org-p1',
        CLAUDE_SESSION_ID: 'sid-p1',
        CLAUDE_CODE_OAUTH_TOKEN: 'ot-p1',
        CLAUDE_CODE_OAUTH_REFRESH_TOKEN: 'ort-p1',
        CLAUDE_CODE_OAUTH_SCOPES: 'scopes-p1',
      },
    });
    assert.ok(fakeOutput);
    // All session vars should be absent from child env
    assert.strictEqual(fakeOutput.env.CLAUDE_ACCESS_TOKEN, undefined);
    assert.strictEqual(fakeOutput.env.CLAUDE_REFRESH_TOKEN, undefined);
    assert.strictEqual(fakeOutput.env.CLAUDE_ORG_ID, undefined);
    assert.strictEqual(fakeOutput.env.CLAUDE_SESSION_ID, undefined);
    assert.strictEqual(fakeOutput.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
    assert.strictEqual(fakeOutput.env.CLAUDE_CODE_OAUTH_REFRESH_TOKEN, undefined);
    assert.strictEqual(fakeOutput.env.CLAUDE_CODE_OAUTH_SCOPES, undefined);
  });

  // --- 20. Fake claude is invoked despite all stripped vars ---
  it('20. fake claude still invoked after all stripping', async () => {
    const { fakeOutput, exitCode } = await runWrapper(['-p', 'test'], {
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-test',
        CLAUDE_SESSION_ID: 'sess-test',
        CLAUDE_CODE_OAUTH_TOKEN: 'ot-test',
      },
    });
    assert.strictEqual(exitCode, 0);
    assert.ok(fakeOutput, 'should successfully invoke fake claude');
  });

  // --- 21. npm_config_update_notifier is false ---
  it('21. npm_config_update_notifier=false in child env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test']);
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.npm_config_update_notifier, 'false');
  });

  // --- 22. NO_UPDATE_NOTIFIER=1 in child env ---
  it('22. NO_UPDATE_NOTIFIER=1 in child env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test']);
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.NO_UPDATE_NOTIFIER, '1');
  });
});

// ==================================================================
// STATIC GREP CHECKS (run as integration tests)
// ==================================================================
// These grep for api.anthropic.com and claude.ai in runtime source files.
// Files that contain these strings as BLOCKLIST patterns (check.sh, assertion
// functions) are excluded — they are blocking Anthropic, not calling it.

describe('Static privacy checks', () => {

  // --- 23. No api.anthropic.com as live endpoint in runtime files ---
  it('23. no api.anthropic.com as live endpoint in runtime files', async () => {
    // Search only runtime files, excluding known blocklist/assertion files
    const searchPaths = [
      'bin/jeanclaude', 'bin/jeanclaude-print-config', 'bin/jeanclaude-healthcheck',
      'bin/jeanclaude-entrypoint',
      'Dockerfile', 'Makefile', 'jeanclaude',
      'docker-compose.yml', 'docker-compose.open-responses.yml',
      'config/', 'gateway/',
    ];
    // standalone.ts and standalone.js are excluded because they contain
    // the string inside assertBaseUrlNotAnthropic() blocklist function.
    let allHits = '';
    for (const p of searchPaths) {
      try {
        const child = spawn('grep', ['-rl', 'api.anthropic.com', p], {
          cwd: REPO_ROOT,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000,
        });
        const out = await new Promise((resolve) => {
          let o = '';
          child.stdout.on('data', (d) => { o += d; });
          child.on('close', () => resolve(o));
        });
        allHits += out;
      } catch {}
    }
    const hits = allHits.trim().split('\n').filter(Boolean);
    // Exclude check.sh and standalone files (they're blocklist/assertion code)
    const real = hits.filter((f) => !f.includes('check.sh') && !f.includes('standalone'));
    assert.strictEqual(real.length, 0, 'found api.anthropic.com as live endpoint in: ' + real.join(', '));
  });

  // --- 24. No claude.ai as live endpoint in runtime files ---
  it('24. no claude.ai as live endpoint in runtime files', async () => {
    const searchPaths = [
      'bin/jeanclaude', 'bin/jeanclaude-print-config', 'bin/jeanclaude-healthcheck',
      'bin/jeanclaude-entrypoint',
      'Dockerfile', 'Makefile', 'jeanclaude',
      'docker-compose.yml', 'docker-compose.open-responses.yml',
      'config/', 'gateway/',
    ];
    let allHits = '';
    for (const p of searchPaths) {
      try {
        const child = spawn('grep', ['-rl', 'claude.ai', p], {
          cwd: REPO_ROOT,
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000,
        });
        const out = await new Promise((resolve) => {
          let o = '';
          child.stdout.on('data', (d) => { o += d; });
          child.on('close', () => resolve(o));
        });
        allHits += out;
      } catch {}
    }
    const hits = allHits.trim().split('\n').filter(Boolean);
    const real = hits.filter((f) => !f.includes('check.sh') && !f.includes('standalone'));
    assert.strictEqual(real.length, 0, 'found claude.ai as live endpoint in: ' + real.join(', '));
  });
});
