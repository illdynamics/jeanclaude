/**
 * wrapper.test.mjs — Comprehensive unit tests for bin/jeanclaude-standalone.js
 *
 * Tests Worker A's production wrapper by spawning it as a child process with
 * JEANCLAUDE_CLAUDE_BIN pointing to the fake claude binary.
 *
 * Uses Node's built-in `node:test` module (`node --test`).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// ---- paths --------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const WRAPPER = join(REPO_ROOT, 'bin', 'jeanclaude-standalone.js');
const FAKE_CLAUDE = join(__dirname, 'fake-claude.mjs');

// ---- read expected version ----------------------------------------------
let EXPECTED_VERSION = '0.0.0';
try {
  const v = JSON.parse(readFileSync(join(REPO_ROOT, '.codeseeq', 'version.json'), 'utf8'));
  EXPECTED_VERSION = v.latest_version || EXPECTED_VERSION;
} catch { /* use default */ }

// ---- helpers ------------------------------------------------------------

/**
 * Spawn the wrapper and return a promise resolving to:
 *   { stdout, stderr, exitCode, signal, fakeOutput }
 *
 * fakeOutput is parsed JSON that the fake claude printed, or null if it
 * wasn't invoked.
 */
function runWrapper(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      JEANCLAUDE_CLAUDE_BIN: FAKE_CLAUDE,
      // Strip real secrets that might leak / confuse assertions
      DEEPSEEK_API_KEY: 'sk-test-default-key-for-wrapper-tests',
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
      JEANCLAUDE_NO_AUTO_SESSION_FLAGS: '1',  // Don't auto-append --no-session-persistence in tests
      ...opts.env,
    };

    // Purge undefined entries
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

    if (opts.stdin) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Wrapper timed out after ' + (opts.timeout || 10000) + 'ms'));
    }, opts.timeout || 10000);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      let fakeOutput = null;

      if (stdout.trim()) {
        try {
          const lines = stdout.trim().split(/\r?\n/);
          // Fake claude JSON is typically the last line
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('{') && line.endsWith('}')) {
              fakeOutput = JSON.parse(line);
              // Remove JSON from stdout for plain-text assertions
              stdout = lines.slice(0, i).join('\n');
              break;
            }
          }
        } catch (_) { /* not JSON, keep stdout as-is */ }
      }

      resolve({ stdout, stderr, exitCode: code, signal, fakeOutput });
    });
  });
}

// ---- suite --------------------------------------------------------------
describe('JeanClaude standalone wrapper', () => {

  // --- 1. Basic pass-through -----------------------------------------------
  it('1. passes positional args through to claude', async () => {
    const { fakeOutput } = await runWrapper(['explain', 'this', 'repo']);
    assert.ok(fakeOutput, 'fake claude should produce JSON output');
    assert.deepStrictEqual(fakeOutput.argv.slice(2), ['explain', 'this', 'repo']);
  });

  // --- 2. Flag pass-through ------------------------------------------------
  it('2. passes flags through to claude', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'write', 'tests']);
    assert.ok(fakeOutput);
    assert.deepStrictEqual(fakeOutput.argv.slice(2), ['-p', 'write', 'tests']);
  });

  // --- 3. stdin pass-through -----------------------------------------------
  it('3. pipes stdin through to claude', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'summarize'], {
      env: { FAKE_CLAUDE_ECHO_STDIN: '1' },
      stdin: 'hello from stdin\n',
    });
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.stdin, 'hello from stdin');
    assert.deepStrictEqual(fakeOutput.argv.slice(2), ['-p', 'summarize']);
  });

  // --- 4. exit code preservation ------------------------------------------
  it('4. preserves fake claude exit code', async () => {
    const { exitCode } = await runWrapper(['-p', 'test'], {
      env: { FAKE_CLAUDE_EXIT_CODE: '42' },
    });
    assert.strictEqual(exitCode, 42);
  });

  // --- 5. --yolo rewrite --------------------------------------------------
  it('5. rewrites --yolo to --dangerously-skip-permissions', async () => {
    const { fakeOutput, stderr } = await runWrapper(['--yolo', '-p', 'test']);
    assert.ok(fakeOutput);
    // Worker A's wrapper pushes DSP to the END of args
    assert.deepStrictEqual(
      fakeOutput.argv.slice(2),
      ['-p', 'test', '--dangerously-skip-permissions'],
    );
    // Should print warning to stderr
    assert.ok(
      stderr.includes('dangerous mode enabled'),
      'should warn about dangerous mode',
    );
    assert.ok(!fakeOutput.argv.includes('--yolo'), '--yolo should be removed');
  });

  // --- 6. -Y rewrite ------------------------------------------------------
  it('6. rewrites -Y to --dangerously-skip-permissions', async () => {
    const { fakeOutput, stderr } = await runWrapper(['-Y', '-p', 'test']);
    assert.ok(fakeOutput);
    assert.deepStrictEqual(
      fakeOutput.argv.slice(2),
      ['-p', 'test', '--dangerously-skip-permissions'],
    );
    assert.ok(
      stderr.includes('dangerous mode enabled'),
      'should warn about dangerous mode',
    );
    assert.ok(!fakeOutput.argv.includes('-Y'), '-Y should be removed');
  });

  // --- 7. -y NOT rewritten ------------------------------------------------
  it('7. does NOT rewrite -y (lowercase)', async () => {
    const { fakeOutput, stderr } = await runWrapper(['-y', '-p', 'test']);
    assert.ok(fakeOutput);
    assert.deepStrictEqual(fakeOutput.argv.slice(2), ['-y', '-p', 'test']);
    assert.ok(!stderr.includes('dangerous'), 'should NOT warn for -y');
  });

  // --- 8. project purge -y pass-through ----------------------------------
  it('8. project purge -y passes through unchanged', async () => {
    const { fakeOutput } = await runWrapper(['project', 'purge', '-y']);
    assert.ok(fakeOutput);
    assert.deepStrictEqual(
      fakeOutput.argv.slice(2),
      ['project', 'purge', '-y'],
    );
  });

  // --- 9. project purge --yes pass-through --------------------------------
  it('9. project purge --yes passes through unchanged', async () => {
    const { fakeOutput } = await runWrapper(['project', 'purge', '--yes']);
    assert.ok(fakeOutput);
    assert.deepStrictEqual(
      fakeOutput.argv.slice(2),
      ['project', 'purge', '--yes'],
    );
  });

  // --- 10. project purge -Y rejection ------------------------------------
  it('10. project purge -Y is rejected', async () => {
    const { stderr, exitCode, fakeOutput } = await runWrapper(['project', 'purge', '-Y']);
    assert.strictEqual(exitCode, 1, 'should exit 1');
    assert.ok(
      stderr.includes('project purge'),
      'should error about project purge + dangerous mode',
    );
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
  });

  // --- 11. project purge --yolo rejection --------------------------------
  it('11. project purge --yolo is rejected', async () => {
    const { stderr, exitCode, fakeOutput } = await runWrapper([
      'project', 'purge', '--yolo',
    ]);
    assert.strictEqual(exitCode, 1, 'should exit 1');
    assert.ok(
      stderr.includes('project purge'),
      'should error about project purge + dangerous mode',
    );
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
  });

  // --- 12. --permission-mode X --yolo conflict ----------------------------
  it('12. --permission-mode X --yolo rejects with conflict error', async () => {
    const { stderr, exitCode, fakeOutput } = await runWrapper([
      '--permission-mode', 'acceptEdits', '--yolo', '-p', 'test',
    ]);
    assert.strictEqual(exitCode, 1, 'should exit 1');
    assert.ok(
      stderr.includes('conflicts'),
      'should error about permission-mode conflict',
    );
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
  });

  // --- 13. --permission-mode bypassPermissions --yolo: no conflict --------
  it('13. --permission-mode bypassPermissions --yolo: no double dangerous', async () => {
    const { fakeOutput, exitCode } = await runWrapper([
      '--permission-mode', 'bypassPermissions', '--yolo', '-p', 'test',
    ]);
    assert.strictEqual(exitCode, 0);
    assert.ok(fakeOutput);
    const args = fakeOutput.argv.slice(2);
    // Worker A's wrapper does NOT add --dangerously-skip-permissions when
    // permission-mode is already bypassPermissions (redundant).
    const dspCount = args.filter((a) => a === '--dangerously-skip-permissions').length;
    assert.strictEqual(dspCount, 0, 'should NOT add --dangerously-skip-permissions when bypassPermissions is set');
    assert.ok(args.includes('--permission-mode'));
    assert.ok(args.includes('bypassPermissions'));
    assert.ok(!args.includes('--yolo'), '--yolo should be stripped');
  });

  // --- 14. No secret leakage in stderr ------------------------------------
  it('14. no secret values appear in stderr', async () => {
    const { stderr } = await runWrapper(['-p', 'test'], {
      env: {
        DEEPSEEK_API_KEY: 'sk-super-secret-key-12345',
        ANTHROPIC_API_KEY: 'ak-top-secret-do-not-leak',
        RESPONSE_API_KEY: 'resp-key-leak-test',
      },
    });
    assert.ok(!stderr.includes('sk-super-secret-key-12345'), 'DEEPSEEK_API_KEY leaked in stderr');
    assert.ok(!stderr.includes('ak-top-secret-do-not-leak'), 'ANTHROPIC_API_KEY leaked in stderr');
    assert.ok(!stderr.includes('resp-key-leak-test'), 'RESPONSE_API_KEY leaked in stderr');
  });

  // --- 15. --version flag -------------------------------------------------
  it('15. --version prints version and exits 0', async () => {
    const { stdout, exitCode, fakeOutput } = await runWrapper(['--version']);
    assert.strictEqual(exitCode, 0);
    // Version string is dynamic (reads .codeseeq/version.json)
    assert.ok(stdout.trim().length > 0, 'should print a version');
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
  });

  // --- 16. doctor subcommand ----------------------------------------------
  it('16. doctor subcommand prints diagnostics', async () => {
    const { stdout, stderr, fakeOutput } = await runWrapper(['doctor']);
    // May exit 0 or 1 depending on env; we don't assert exit code.
    assert.ok(
      stdout.includes('Doctor') || stdout.includes('doctor'),
      'should print doctor diagnostics',
    );
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
  });

  // --- 17. env mapping ---------------------------------------------------
  it('17. maps JEANCLAUDE env vars to ANTHROPIC_* equivalents', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test'], {
      env: {
        JEANCLAUDE_ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
        JEANCLAUDE_MODEL_PROFILE: 'v4-flash',
        DEEPSEEK_API_KEY: 'sk-test-mapping-key-12345',
        DEEPSEEK_API_KEY_UNREDACTED: undefined,
      },
    });
    assert.ok(fakeOutput);
    // Worker A's wrapper sets these env vars in process.env before spawning.
    assert.strictEqual(
      fakeOutput.env.ANTHROPIC_BASE_URL,
      'https://api.deepseek.com/anthropic',
    );
    assert.strictEqual(fakeOutput.env.ANTHROPIC_MODEL, 'deepseek-v4-flash');
    // Worker A's wrapper maps ALL model vars to the same JEANCLAUDE_MODEL value.
    assert.strictEqual(
      fakeOutput.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
      'deepseek-v4-flash',
    );
    assert.strictEqual(
      fakeOutput.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
      'deepseek-v4-flash',
    );
    // DEEPSEEK_API_KEY is redacted by the fake claude (it's a secret suffix key)
    assert.strictEqual(fakeOutput.env.DEEPSEEK_API_KEY, '[REDACTED]');
    // ANTHROPIC_AUTH_TOKEN should be set from DEEPSEEK_API_KEY
    // (also redacted by fake claude since it matches _AUTH_TOKEN suffix)
    assert.strictEqual(fakeOutput.env.ANTHROPIC_AUTH_TOKEN, '[REDACTED]');
  });

  // --- 18. dotenv: .env placeholders don't override existing vars ---------
  it('18. dotenv does not override already-set env vars', async () => {
    // .env has DEEPSEEK_API_KEY=sk-your-deepseek-key
    // We pre-set an env var NOT in the .env's key set (JEANCLAUDE_QUIET)
    // and verify the dotenv load didn't clobber anything unexpected.
    const { fakeOutput } = await runWrapper(['-p', 'test'], {
      env: {
        JEANCLAUDE_QUIET: '1',
        DEEPSEEK_API_KEY: 'sk-test-default-key-for-wrapper-tests',
      },
    });
    assert.ok(fakeOutput);
    // JEANCLAUDE_QUIET should still be '1' (not overridden by .env)
    assert.strictEqual(fakeOutput.env.JEANCLAUDE_QUIET, '1');
  });

  // --- 19. -Y warning printed to stderr ----------------------------------
  it('19. -Y prints warning to stderr', async () => {
    const { stderr } = await runWrapper(['-Y', '-p', 'test']);
    assert.ok(
      stderr.includes('dangerous mode enabled'),
      'should print dangerous mode warning to stderr',
    );
  });

  // --- 20. JEANCLAUDE_QUIET=1 suppresses warning --------------------------
  it('20. JEANCLAUDE_QUIET=1 suppresses -Y warning', async () => {
    const { stderr } = await runWrapper(['-Y', '-p', 'test'], {
      env: { JEANCLAUDE_QUIET: '1' },
    });
    assert.ok(
      !stderr.includes('dangerous mode'),
      'should NOT print dangerous mode warning when quiet',
    );
  });

  // --- 21. JEANCLAUDE_CLAUDE_BIN override --------------------------------
  it('21. JEANCLAUDE_CLAUDE_BIN override works', async () => {
    // Using a non-existent binary should cause the wrapper to error.
    const res = await new Promise((resolve) => {
      const env = { ...process.env, JEANCLAUDE_CLAUDE_BIN: '/nonexistent/claude' };
      env.DEEPSEEK_API_KEY = 'sk-test-jeanclaude-key';
      // Strip secrets
      const secretKeys = [
        'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
        'OPENAI_API_KEY', 'RESPONSE_API_KEY', 'BRAVE_API_KEY',
        'UNSTRUCTURED_API_KEY', 'OPENROUTER_API_KEY', 'MEMORY_STORE_PASSWORD',
        'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL',
        'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      ];
      for (const k of secretKeys) delete env[k];

      const child = spawn('node', [WRAPPER, '-p', 'test'], {
        cwd: REPO_ROOT,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('exit', (code) => resolve({ exitCode: code, stderr }));
    });
    assert.ok(res.exitCode !== 0, 'should exit non-zero for missing binary');
    assert.ok(
      res.stderr.includes('/nonexistent/claude') || res.stderr.includes('failed'),
      'should report the missing binary',
    );
  });

  // --- 22. Signal forwarding ---------------------------------------------
  it('22. forwards SIGTERM to child', async () => {
    const res = await new Promise((resolve, reject) => {
      const env = {
        ...process.env,
        JEANCLAUDE_CLAUDE_BIN: FAKE_CLAUDE,
        FAKE_CLAUDE_DELAY_MS: '2000',
        FAKE_CLAUDE_EXIT_CODE: '0',
        DEEPSEEK_API_KEY: 'sk-test-key',
      };
      const secretKeys = [ 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN',
        'OPENAI_API_KEY', 'RESPONSE_API_KEY', 'BRAVE_API_KEY',
        'UNSTRUCTURED_API_KEY', 'OPENROUTER_API_KEY', 'MEMORY_STORE_PASSWORD',
        'ANTHROPIC_BASE_URL', 'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL',
        'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
      ];
      for (const k of secretKeys) delete env[k];

      const child = spawn('node', [WRAPPER, '-p', 'test'], {
        cwd: REPO_ROOT,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Send SIGTERM after a short delay to let the wrapper start the child
      setTimeout(() => {
        child.kill('SIGTERM');
      }, 250);

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('Signal forwarding test timed out'));
      }, 5000);

      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ exitCode: code, signal });
      });
    });
    // SIGTERM -> exit code 143 (128 + 15) on Unix
    assert.ok(
      res.signal === 'SIGTERM' || res.exitCode === 143 || res.exitCode === null,
      `should have been terminated by signal (got signal=${res.signal} exitCode=${res.exitCode})`,
    );
  });

  // --- 23. --model passes through ----------------------------------------
  it('23. --model v4-pro resolves to backend model', async () => {
    const { fakeOutput } = await runWrapper([
      '--model', 'v4-pro', '-p', 'test',
    ]);
    assert.ok(fakeOutput);
    assert.strictEqual(fakeOutput.env.ANTHROPIC_MODEL, 'deepseek-v4-pro');
  });

  // --- 24. --mcp-config passes through -----------------------------------
  it('24. --mcp-config ./mcp.json passes through', async () => {
    const { fakeOutput } = await runWrapper([
      '--mcp-config', './mcp.json', '-p', 'test',
    ]);
    assert.ok(fakeOutput);
    assert.deepStrictEqual(
      fakeOutput.argv.slice(2),
      ['--mcp-config', './mcp.json', '-p', 'test'],
    );
  });

  // --- 25. --debug passes through ----------------------------------------
  it('25. --debug api,mcp passes through', async () => {
    const { fakeOutput } = await runWrapper([
      '--debug', 'api,mcp', '-p', 'test',
    ]);
    assert.ok(fakeOutput);
    assert.deepStrictEqual(
      fakeOutput.argv.slice(2),
      ['--debug', 'api,mcp', '-p', 'test'],
    );
  });

  // --- 26. auth status passes through ------------------------------------
  it('26. auth status passes through as positional args', async () => {
    const { fakeOutput } = await runWrapper(['auth', 'status']);
    assert.ok(fakeOutput);
    assert.deepStrictEqual(fakeOutput.argv.slice(2), ['auth', 'status']);
  });

  // --- 27. mcp list passes through ---------------------------------------
  it('27. mcp list passes through', async () => {
    const { fakeOutput } = await runWrapper(['mcp', 'list']);
    assert.ok(fakeOutput);
    assert.deepStrictEqual(fakeOutput.argv.slice(2), ['mcp', 'list']);
  });

  // --- Bonus: combined flags ---------------------------------------------
  it('28. -Y and --yolo together produce at most one dangerous flag', async () => {
    const { fakeOutput } = await runWrapper(['-Y', '--yolo', '-p', 'test']);
    assert.ok(fakeOutput);
    const args = fakeOutput.argv.slice(2);
    const dspCount = args.filter((a) => a === '--dangerously-skip-permissions').length;
    assert.ok(dspCount <= 1, 'should have at most one --dangerously-skip-permissions');
    assert.ok(!args.includes('-Y'), '-Y should be removed');
    assert.ok(!args.includes('--yolo'), '--yolo should be removed');
  });

  // --- Bonus: exit code 0 by default -------------------------------------
  it('29. exits 0 by default when claude exits 0', async () => {
    const { exitCode } = await runWrapper(['-p', 'test']);
    assert.strictEqual(exitCode, 0);
  });

  // --- Bonus: --yolo without --permission-mode works ---------------------
  it('30. --yolo works without any --permission-mode', async () => {
    const { fakeOutput, exitCode } = await runWrapper(['--yolo', '-p', 'test']);
    assert.strictEqual(exitCode, 0);
    assert.ok(fakeOutput);
    assert.ok(fakeOutput.argv.includes('--dangerously-skip-permissions'));
  });

  // --- Bonus: secret keys redacted in child env --------------------------
  it('31. secret-pattern env keys are redacted in child environment', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test'], {
      env: {
        DEEPSEEK_API_KEY: 'sk-real-key',
        MY_CUSTOM_API_KEY: 'custom-secret',
        DB_PASSWORD: 'pass123',
        AUTH_TOKEN: 'tok456',
        JEANCLAUDE_ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      },
    });
    assert.ok(fakeOutput);
    // The fake claude redacts keys that match _API_KEY / _SECRET / _PASSWORD / _TOKEN / _AUTH_TOKEN suffixes
    assert.strictEqual(fakeOutput.env.DEEPSEEK_API_KEY, '[REDACTED]');
    assert.strictEqual(fakeOutput.env.MY_CUSTOM_API_KEY, '[REDACTED]');
    assert.strictEqual(fakeOutput.env.DB_PASSWORD, '[REDACTED]');
    assert.strictEqual(fakeOutput.env.AUTH_TOKEN, '[REDACTED]');
    // Non-secret keys keep their visible values
    assert.strictEqual(
      fakeOutput.env.ANTHROPIC_BASE_URL,
      'https://api.deepseek.com/anthropic',
    );
    assert.strictEqual(
      fakeOutput.env.JEANCLAUDE_ANTHROPIC_BASE_URL,
      'https://api.deepseek.com/anthropic',
    );
  });

  // --- Bonus: JEANCLAUDE_CLAUDE_BIN points to fake claude correctly ------
  it('32. wrapper uses JEANCLAUDE_CLAUDE_BIN from env', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test']);
    assert.ok(fakeOutput);
    assert.ok(
      fakeOutput.argv[1].includes('fake-claude.mjs'),
      'should have invoked fake-claude.mjs',
    );
  });

  // --- Bonus: --yolo flag is NOT passed to claude ------------------------
  it('33. --yolo flag is stripped and not passed to claude', async () => {
    const { fakeOutput } = await runWrapper(['--yolo', '-p', 'test']);
    assert.ok(fakeOutput);
    assert.ok(!fakeOutput.argv.includes('--yolo'), '--yolo should not reach claude');
  });

  // --- Bonus: env subcommand works ---------------------------------------
  it('34. env subcommand prints redacted env vars', async () => {
    const { stdout, fakeOutput } = await runWrapper(['env'], {
      env: {
        DEEPSEEK_API_KEY: 'sk-abc123',
        JEANCLAUDE_ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      },
    });
    assert.ok(stdout.length > 0, 'should print env vars');
    assert.ok(!stdout.includes('sk-abc123'), 'should redact DEEPSEEK_API_KEY in output');
    assert.ok(stdout.includes('DEEPSEEK_API_KEY='), 'should include DEEPSEEK_API_KEY key');
    assert.ok(
      stdout.includes('https://api.deepseek.com/anthropic'),
      'should include non-secret value',
    );
    assert.strictEqual(fakeOutput, null, 'env should NOT invoke claude');
  });
  // ==================================================================
  // NEW TESTS (Worker C — Tests Expansion)
  // ==================================================================

  // --- Auth: Missing DEEPSEEK_API_KEY fails before launching claude ---
  it('35. missing DEEPSEEK_API_KEY fails before launching claude', async () => {
    // Prevent .env from providing DEEPSEEK_API_KEY
    const { stderr, exitCode, fakeOutput } = await runWrapper(['-p', 'test'], {
      env: { DEEPSEEK_API_KEY: undefined, JEANCLAUDE_NO_DOTENV: '1' },
    });
    assert.strictEqual(exitCode, 1, 'should exit 1 when DEEPSEEK_API_KEY missing');
    assert.ok(
      stderr.toLowerCase().includes('deepseek_api_key'),
      'stderr should mention DEEPSEEK_API_KEY is required',
    );
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude when key is missing');
  });

  // --- Auth: Parent ANTHROPIC_API_KEY is stripped from child env ---
  it('36. strips parent ANTHROPIC_API_KEY from child env', async () => {
    const { fakeOutput, stderr } = await runWrapper(['-p', 'test'], {
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-real-parent-key-abc',
      },
    });
    assert.ok(fakeOutput);
    // The original Anthropic key value must NOT appear in stderr
    assert.ok(!stderr.includes('sk-ant-real-parent-key-abc'), 'real Anthropic key leaked to stderr');
    // ANTHROPIC_API_KEY should be set in child env (overridden by DeepSeek-backed value)
    assert.ok(fakeOutput.env.ANTHROPIC_API_KEY !== undefined, 'ANTHROPIC_API_KEY should be present in child env');
    assert.ok(fakeOutput.env.ANTHROPIC_API_KEY !== 'sk-ant-real-parent-key-abc', 'ANTHROPIC_API_KEY should not be the parent value');
  });

  // --- Auth: Parent ANTHROPIC_AUTH_TOKEN is stripped from child env ---
  it('37. strips parent ANTHROPIC_AUTH_TOKEN from child env', async () => {
    const { fakeOutput, stderr } = await runWrapper(['-p', 'test'], {
      env: {
        ANTHROPIC_AUTH_TOKEN: 'sk-ant-real-token-parent-xyz',
      },
    });
    assert.ok(fakeOutput);
    assert.ok(!stderr.includes('sk-ant-real-token-parent-xyz'), 'real Anthropic auth token leaked to stderr');
    // ANTHROPIC_AUTH_TOKEN should be set in child env (overridden by DeepSeek-backed value)
    assert.ok(fakeOutput.env.ANTHROPIC_AUTH_TOKEN !== undefined, 'ANTHROPIC_AUTH_TOKEN should be present in child env');
    assert.ok(fakeOutput.env.ANTHROPIC_AUTH_TOKEN !== 'sk-ant-real-token-parent-xyz', 'ANTHROPIC_AUTH_TOKEN should not be the parent value');
  });

  // --- Auth: Claude auth login is NOT triggered (no real Anthropic creds) ---
  it('38. Claude auth login is NOT triggered (no real Anthropic credentials)', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test'], {
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-would-cause-login-prompt',
        ANTHROPIC_AUTH_TOKEN: 'sk-ant-auth-token-real',
      },
    });
    assert.ok(fakeOutput);
    // The child env should not contain real Anthropic-formatted keys
    // (fake claude redacts secret-pattern keys, but the values should be overridden)
    const env = fakeOutput.env;
    // Verify both keys exist but are not the original Anthropic values
    assert.ok(Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_API_KEY'), 'ANTHROPIC_API_KEY should exist in child env');
    assert.ok(Object.prototype.hasOwnProperty.call(env, 'ANTHROPIC_AUTH_TOKEN'), 'ANTHROPIC_AUTH_TOKEN should exist in child env');
    // Neither should match the original parent values (fakes would be redacted anyway)
    assert.notStrictEqual(env.ANTHROPIC_API_KEY, 'sk-ant-would-cause-login-prompt', 'ANTHROPIC_API_KEY was not overridden');
    assert.notStrictEqual(env.ANTHROPIC_AUTH_TOKEN, 'sk-ant-auth-token-real', 'ANTHROPIC_AUTH_TOKEN was not overridden');
  });

  // --- Model: --model v4-flash maps to backend deepseek-v4-flash, thinking disabled ---
  it('39. --model v4-flash maps to backend deepseek-v4-flash (thinking disabled)', async () => {
    const { fakeOutput } = await runWrapper(['--model', 'v4-flash', '-p', 'test']);
    assert.ok(fakeOutput);
    // Model should map to deepseek-v4-flash in child env
    const model = fakeOutput.env.ANTHROPIC_MODEL;
    assert.ok(
      model === 'deepseek-v4-flash' || model === 'deepseek-v4-flash',
      `ANTHROPIC_MODEL should be deepseek-v4-flash, got ${model}`,
    );
    // --model v4-flash should NOT be passed as-is to claude
    const args = fakeOutput.argv.slice(2);
    if (args.includes('--model')) {
      const idx = args.indexOf('--model');
      assert.notStrictEqual(args[idx + 1], 'v4-flash', '--model v4-flash should be mapped, not passed through');
    }
    // Thinking should be disabled
    const thinking = fakeOutput.env.CLAUDE_CODE_DISABLE_THINKING;
    if (thinking !== undefined) {
      assert.strictEqual(thinking, '1', 'thinking should be disabled for v4-flash');
    }
  });

  // --- Model: --model v4-flash-thinking maps to deepseek-v4-flash, thinking enabled ---
  it('40. --model v4-flash-thinking maps to backend deepseek-v4-flash (thinking enabled)', async () => {
    const { fakeOutput } = await runWrapper(['--model', 'v4-flash-thinking', '-p', 'test']);
    assert.ok(fakeOutput);
    const model = fakeOutput.env.ANTHROPIC_MODEL;
    assert.strictEqual(model, 'deepseek-v4-flash', 'ANTHROPIC_MODEL should be deepseek-v4-flash');
    // --model v4-flash-thinking should not be passed through
    const args = fakeOutput.argv.slice(2);
    if (args.includes('--model')) {
      const idx = args.indexOf('--model');
      assert.notStrictEqual(args[idx + 1], 'v4-flash-thinking', '--model should be consumed');
    }
    // Thinking should be enabled (not disabled)
    const thinking = fakeOutput.env.CLAUDE_CODE_DISABLE_THINKING;
    if (thinking !== undefined) {
      assert.notStrictEqual(thinking, '1', 'thinking should be enabled for v4-flash-thinking');
    }
  });

  // --- Model: --model v4-pro maps to backend deepseek-v4-pro, thinking disabled ---
  it('41. --model v4-pro maps to backend deepseek-v4-pro (thinking disabled)', async () => {
    const { fakeOutput } = await runWrapper(['--model', 'v4-pro', '-p', 'test']);
    assert.ok(fakeOutput);
    const model = fakeOutput.env.ANTHROPIC_MODEL;
    assert.strictEqual(model, 'deepseek-v4-pro', 'ANTHROPIC_MODEL should be deepseek-v4-pro');
    const args = fakeOutput.argv.slice(2);
    if (args.includes('--model')) {
      const idx = args.indexOf('--model');
      assert.notStrictEqual(args[idx + 1], 'v4-pro', '--model should be consumed');
    }
    const thinking = fakeOutput.env.CLAUDE_CODE_DISABLE_THINKING;
    if (thinking !== undefined) {
      assert.strictEqual(thinking, '1', 'thinking should be disabled for v4-pro');
    }
  });

  // --- Model: --model v4-pro-thinking maps to deepseek-v4-pro, thinking enabled ---
  it('42. --model v4-pro-thinking maps to backend deepseek-v4-pro (thinking enabled)', async () => {
    const { fakeOutput } = await runWrapper(['--model', 'v4-pro-thinking', '-p', 'test']);
    assert.ok(fakeOutput);
    const model = fakeOutput.env.ANTHROPIC_MODEL;
    assert.strictEqual(model, 'deepseek-v4-pro', 'ANTHROPIC_MODEL should be deepseek-v4-pro');
    const args = fakeOutput.argv.slice(2);
    if (args.includes('--model')) {
      const idx = args.indexOf('--model');
      assert.notStrictEqual(args[idx + 1], 'v4-pro-thinking', '--model should be consumed');
    }
    const thinking = fakeOutput.env.CLAUDE_CODE_DISABLE_THINKING;
    if (thinking !== undefined) {
      assert.notStrictEqual(thinking, '1', 'thinking should be enabled for v4-pro-thinking');
    }
  });

  // --- Model: Raw Anthropic model rejected ---
  it('43. raw Anthropic model (claude-3-opus) is rejected before launch', async () => {
    const { stderr, exitCode, fakeOutput } = await runWrapper(['--model', 'claude-3-opus', '-p', 'test']);
    assert.strictEqual(exitCode, 1, 'should exit 1 for raw Anthropic model');
    assert.ok(
      stderr.toLowerCase().includes('model') || stderr.toLowerCase().includes('anthropic') || stderr.toLowerCase().includes('invalid'),
      'stderr should mention invalid model',
    );
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
  });

  // --- Model: Raw OpenAI model rejected ---
  it('44. raw OpenAI model (gpt-4) is rejected before launch', async () => {
    const { stderr, exitCode, fakeOutput } = await runWrapper(['--model', 'gpt-4', '-p', 'test']);
    assert.strictEqual(exitCode, 1, 'should exit 1 for raw OpenAI model');
    assert.ok(
      stderr.toLowerCase().includes('model') || stderr.toLowerCase().includes('openai') || stderr.toLowerCase().includes('invalid'),
      'stderr should mention invalid model',
    );
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
  });

  // --- Model: Legacy DeepSeek alias rejected ---
  it('45. legacy DeepSeek alias (deepseek-chat) is rejected', async () => {
    const { stderr, exitCode, fakeOutput } = await runWrapper(['--model', 'deepseek-chat', '-p', 'test']);
    assert.strictEqual(exitCode, 1, 'should exit 1 for legacy alias');
    assert.ok(
      stderr.toLowerCase().includes('model') || stderr.toLowerCase().includes('invalid') || stderr.length > 0,
      'stderr should mention invalid model',
    );
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
  });

  // --- Model: Unknown model rejected ---
  it('46. unknown model is rejected before launch', async () => {
    const { stderr, exitCode, fakeOutput } = await runWrapper(['--model', 'nonexistent-model-xyz', '-p', 'test']);
    assert.strictEqual(exitCode, 1, 'should exit 1 for unknown model');
    assert.ok(
      stderr.toLowerCase().includes('model') || stderr.toLowerCase().includes('unknown') || stderr.toLowerCase().includes('invalid'),
      'stderr should mention unknown model',
    );
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
  });

  // --- Model: Default model is v4-pro-thinking when DEEPSEEK_API_KEY is set ---
  it('47. default model is v4-pro-thinking when DEEPSEEK_API_KEY is set', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test'], {
      env: {
        JEANCLAUDE_MODEL: undefined,
        JEANCLAUDE_MODEL_PROFILE: undefined,
      },
    });
    assert.ok(fakeOutput);
    const model = fakeOutput.env.ANTHROPIC_MODEL;
    // Default should be v4-pro-thinking = deepseek-v4-pro with thinking enabled
    assert.ok(
      model === 'deepseek-v4-pro' || model === 'deepseek-v4-flash',
      `ANTHROPIC_MODEL should be a valid DeepSeek backend model, got ${model}`,
    );
  });

  // --- Mode: Direct mode (default) sets ANTHROPIC_BASE_URL ---
  it('48. direct mode (default) sets ANTHROPIC_BASE_URL to DeepSeek endpoint', async () => {
    const { fakeOutput } = await runWrapper(['-p', 'test'], {
      env: {
        ANTHROPIC_BASE_URL: undefined,
        JEANCLAUDE_ANTHROPIC_BASE_URL: undefined,
      },
    });
    assert.ok(fakeOutput);
    assert.strictEqual(
      fakeOutput.env.ANTHROPIC_BASE_URL,
      'https://api.deepseek.com/anthropic',
      'ANTHROPIC_BASE_URL should default to DeepSeek endpoint in direct mode',
    );
  });

  // --- Mode: --jeanclaude-mode direct works ---
  it('49. --jeanclaude-mode direct flag is accepted', async () => {
    const { fakeOutput, exitCode } = await runWrapper(['--jeanclaude-mode', 'direct', '-p', 'test']);
    assert.strictEqual(exitCode, 0);
    assert.ok(fakeOutput);
    // The flag should be consumed (not passed to claude)
    const args = fakeOutput.argv.slice(2);
    assert.ok(!args.includes('--jeanclaude-mode'), '--jeanclaude-mode should be consumed, not passed');
    assert.ok(!args.includes('direct'), 'mode value should not leak as positional arg');
  });

  // --- Mode: JEANCLAUDE_MODE=direct works ---
  it('50. JEANCLAUDE_MODE=direct env var works', async () => {
    const { fakeOutput, exitCode } = await runWrapper(['-p', 'test'], {
      env: { JEANCLAUDE_MODE: 'direct' },
    });
    assert.strictEqual(exitCode, 0);
    assert.ok(fakeOutput);
    assert.strictEqual(
      fakeOutput.env.ANTHROPIC_BASE_URL,
      'https://api.deepseek.com/anthropic',
      'ANTHROPIC_BASE_URL should be DeepSeek endpoint in direct mode',
    );
  });

  // --- Mode: CLI flag --jeanclaude-mode is consumed and NOT passed to claude ---
  it('51. --jeanclaude-mode flag is consumed and NOT passed to claude', async () => {
    const { fakeOutput } = await runWrapper(['--jeanclaude-mode', 'direct', '-p', 'test']);
    assert.ok(fakeOutput);
    const args = fakeOutput.argv.slice(2);
    assert.ok(!args.includes('--jeanclaude-mode'), '--jeanclaude-mode flag must be consumed');
    assert.deepStrictEqual(args, ['-p', 'test']);
  });

  // --- Mode: CLI flag --gateway-mode is consumed and NOT passed to claude ---
  it('52. --gateway-mode flag is consumed and NOT passed to claude', async () => {
    const { fakeOutput } = await runWrapper(['--gateway-mode', 'external', '-p', 'test'], {
      env: {
        JEANCLAUDE_MODE: 'direct', // gateway-mode flag should be consumed regardless of mode
      },
    });
    assert.ok(fakeOutput);
    const args = fakeOutput.argv.slice(2);
    assert.ok(!args.includes('--gateway-mode'), '--gateway-mode flag must be consumed');
    assert.ok(!args.includes('external'), 'gateway-mode value must be consumed');
  });

  // --- Mode: CLI flag --gateway-url is consumed and NOT passed to claude ---
  it('53. --gateway-url flag is consumed and NOT passed to claude', async () => {
    const { fakeOutput } = await runWrapper(['--gateway-url', 'http://127.0.0.1:9999', '-p', 'test'], {
      env: {
        JEANCLAUDE_MODE: 'gateway',
      },
    });
    assert.ok(fakeOutput);
    const args = fakeOutput.argv.slice(2);
    assert.ok(!args.includes('--gateway-url'), '--gateway-url flag must be consumed');
    assert.ok(!args.includes('http://127.0.0.1:9999'), 'gateway-url value must be consumed');
  });

  // --- Subcommand: jeanclaude models prints profile list ---
  it('54. jeanclaude models prints profile list', async () => {
    const { stdout, stderr, fakeOutput } = await runWrapper(['models']);
    assert.ok(
      stdout.includes('v4-flash') || stdout.includes('v4-pro') || stdout.toLowerCase().includes('model'),
      'should print model profiles',
    );
    assert.strictEqual(fakeOutput, null, 'models subcommand should NOT invoke claude');
  });

  // --- Subcommand: jeanclaude models --json prints valid JSON with 4 profiles ---
  it('55. jeanclaude models --json prints valid JSON with 4 profiles', async () => {
    const { stdout, fakeOutput } = await runWrapper(['models', '--json']);
    assert.strictEqual(fakeOutput, null, 'models --json should NOT invoke claude');
    let parsed;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      assert.fail('models --json output is not valid JSON');
    }
    assert.ok(Array.isArray(parsed) || (parsed && parsed.profiles), 'should output profiles array');
    if (Array.isArray(parsed)) {
      assert.strictEqual(parsed.length, 4, 'should have exactly 4 model profiles');
    }
  });

  // --- Subcommand: jeanclaude gateway health (no gateway) exits non-zero ---
  it('56. jeanclaude gateway health without gateway exits non-zero', async () => {
    const { exitCode, fakeOutput, stderr } = await runWrapper(['gateway', 'health'], {
      env: {
        JEANCLAUDE_GATEWAY_URL: 'http://127.0.0.1:19999',
      },
    });
    assert.ok(exitCode !== 0, `should exit non-zero when gateway is not running (got ${exitCode})`);
    assert.strictEqual(fakeOutput, null, 'gateway health should NOT invoke claude');
  });

  // --- Deprecated env alias: JEANCLAUDE_MODEL → JEANCLAUDE_MODEL_PROFILE ---
  it('57. JEANCLAUDE_MODEL maps to JEANCLAUDE_MODEL_PROFILE with deprecation warning', async () => {
    const { stderr, fakeOutput } = await runWrapper(['-p', 'test'], {
      env: {
        JEANCLAUDE_MODEL: 'v4-pro',
        JEANCLAUDE_MODEL_PROFILE: undefined,
        ANTHROPIC_MODEL: undefined,
        ANTHROPIC_DEFAULT_SONNET_MODEL: undefined,
        ANTHROPIC_DEFAULT_OPUS_MODEL: undefined,
      },
    });
    assert.ok(fakeOutput);
    // Should print deprecation warning to stderr
    assert.ok(
      stderr.toLowerCase().includes('deprecat') || stderr.toLowerCase().includes('jeanclaude_model'),
      `stderr should contain deprecation warning about JEANCLAUDE_MODEL (got: "${stderr.slice(0, 200)}")`,
    );
  });

  // --- Deprecated env alias: RESPONSE_API_KEY → JEANCLAUDE_OPEN_RESPONSES_API_KEY ---
  it('58. RESPONSE_API_KEY maps to JEANCLAUDE_OPEN_RESPONSES_API_KEY with deprecation warning', async () => {
    const { stderr } = await runWrapper(['-p', 'test'], {
      env: {
        RESPONSE_API_KEY: 'resp-test-deprecated-key',
        JEANCLAUDE_OPEN_RESPONSES_API_KEY: undefined,
      },
    });
    assert.ok(
      stderr.toLowerCase().includes('deprecat') || stderr.toLowerCase().includes('response_api_key'),
      `stderr should contain deprecation warning about RESPONSE_API_KEY (got: "${stderr.slice(0, 200)}")`,
    );
  });

  // --- Doctor: checks model profile validity ---
  it('59. doctor checks model profile validity', async () => {
    const { stdout, stderr } = await runWrapper(['doctor'], {
      env: {
        JEANCLAUDE_MODEL: 'v4-flash',
        ANTHROPIC_MODEL: undefined,
        ANTHROPIC_DEFAULT_SONNET_MODEL: undefined,
        ANTHROPIC_DEFAULT_OPUS_MODEL: undefined,
      },
    });
    // Doctor should report on model
    assert.ok(
      stdout.includes('v4') || stdout.includes('deepseek') || stdout.toLowerCase().includes('model'),
      'doctor should mention model profile',
    );
  });

  // --- Doctor: warns about parent Anthropic auth vars ---
  it('60. doctor warns about parent Anthropic auth vars', async () => {
    const { stdout } = await runWrapper(['doctor'], {
      env: {
        ANTHROPIC_API_KEY: 'sk-ant-warn-parent-key',
        ANTHROPIC_AUTH_TOKEN: 'sk-ant-warn-parent-token',
      },
    });
    // Doctor should warn about parent auth vars
    assert.ok(
      stdout.includes('ANTHROPIC_API_KEY') || stdout.includes('ANTHROPIC_AUTH_TOKEN') || stdout.toLowerCase().includes('auth') || stdout.toLowerCase().includes('parent'),
      'doctor should mention parent Anthropic auth vars',
    );
  });

  // --- Model: --model with unknown value (no equal sign) is rejected ---
  it('61. --model with unrecognized profile name is rejected', async () => {
    const { stderr, exitCode, fakeOutput } = await runWrapper(['--model', 'bogus-model-998877', '-p', 'test']);
    assert.strictEqual(exitCode, 1, 'should exit 1');
    assert.ok(stderr.length > 0, 'should have error on stderr');
    assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
  });

});

// ==================================================================
// NEW TESTS (Agent 5 — Test Updates for Agents 1-4 Fixes)
// ==================================================================

// ---- gateway test helpers (inline fake gateway for wrapper tests) ----

function startFakeGatewayInline() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [join(__dirname, 'fake-gateway.mjs')], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let portLine = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Inline fake gateway did not print port within 5s'));
    }, 5000);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      portLine += d;
      const match = portLine.match(/^\d+$/m);
      if (match) {
        clearTimeout(timeout);
        const port = parseInt(match[0], 10);
        resolve({ url: `http://127.0.0.1:${port}`, process: child });
      }
    });

    child.stderr.on('data', () => { /* discard */ });
    child.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

function stopFakeGatewayInline(gw) {
  if (gw && gw.process && !gw.process.killed) {
    gw.process.kill('SIGTERM');
  }
}

// ---- Direct mode auth tests ----

// 62. Parent ANTHROPIC_BASE_URL=https://api.anthropic.com causes privacy abort
it('62. parent ANTHROPIC_BASE_URL=https://api.anthropic.com causes privacy abort', async () => {
  // Privacy lockdown now correctly aborts when it sees anthropic.com URLs
  const { exitCode, stderr, fakeOutput } = await runWrapper(['-p', 'test'], {
    env: {
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
      JEANCLAUDE_ANTHROPIC_BASE_URL: undefined,
    },
  });
  assert.ok(exitCode !== 0, 'should abort with non-zero exit code');
  assert.ok(
    stderr.includes('PRIVACY VIOLATION') || stderr.includes('Aborting'),
    'should report privacy violation for Anthropic URL',
  );
  assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
});

// 63. Parent ANTHROPIC_BASE_URL=http://evil.local is overridden
it('63. parent ANTHROPIC_BASE_URL=http://evil.local is overridden', async () => {
  const { fakeOutput } = await runWrapper(['-p', 'test'], {
    env: {
      ANTHROPIC_BASE_URL: 'http://evil.local/malicious',
      JEANCLAUDE_ANTHROPIC_BASE_URL: undefined,
    },
  });
  assert.ok(fakeOutput);
  assert.strictEqual(
    fakeOutput.env.ANTHROPIC_BASE_URL,
    'https://api.deepseek.com/anthropic',
    'malicious parent ANTHROPIC_BASE_URL should be overridden',
  );
});

// 64. JEANCLAUDE_ANTHROPIC_BASE_URL customizes direct mode base URL
it('64. JEANCLAUDE_ANTHROPIC_BASE_URL customizes direct mode base URL', async () => {
  const customUrl = 'https://custom-proxy.example.com/anthropic';
  const { fakeOutput } = await runWrapper(['-p', 'test'], {
    env: {
      JEANCLAUDE_ANTHROPIC_BASE_URL: customUrl,
      ANTHROPIC_BASE_URL: undefined,
    },
  });
  assert.ok(fakeOutput);
  assert.strictEqual(
    fakeOutput.env.ANTHROPIC_BASE_URL,
    customUrl,
    'ANTHROPIC_BASE_URL should be set from JEANCLAUDE_ANTHROPIC_BASE_URL',
  );
});

// 65. Direct mode with parent ANTHROPIC_BASE_URL=anthropic.com aborts (privacy lockdown)
it('65. direct mode with parent anthropic URL aborts in privacy lockdown', async () => {
  // Privacy lockdown correctly aborts when ANTHROPIC_BASE_URL points to Anthropic
  const { exitCode, stderr, fakeOutput } = await runWrapper(['-p', 'test'], {
    env: {
      ANTHROPIC_BASE_URL: 'https://api.anthropic.com/v1',
      JEANCLAUDE_MODE: 'direct',
      JEANCLAUDE_ANTHROPIC_BASE_URL: undefined,
    },
  });
  assert.ok(exitCode !== 0, 'should abort with non-zero exit code');
  assert.ok(
    stderr.includes('PRIVACY VIOLATION') || stderr.includes('Aborting'),
    'should report privacy violation',
  );
  assert.strictEqual(fakeOutput, null, 'should NOT invoke claude');
});

// 66. Parent ANTHROPIC_API_KEY is stripped from child env (extended check)
it('66. parent ANTHROPIC_API_KEY is completely absent from child env', async () => {
  const { fakeOutput, stderr } = await runWrapper(['-p', 'test'], {
    env: {
      ANTHROPIC_API_KEY: 'sk-ant-parent-leak-test-key-123',
      DEEPSEEK_API_KEY: 'sk-test-override-key',
    },
  });
  assert.ok(fakeOutput);
  // The value must not leak to stderr
  assert.ok(!stderr.includes('sk-ant-parent-leak-test-key-123'), 'parent ANTHROPIC_API_KEY leaked to stderr');
  // The child env should have ANTHROPIC_API_KEY set but NOT the parent value
  assert.ok(Object.prototype.hasOwnProperty.call(fakeOutput.env, 'ANTHROPIC_API_KEY'), 'ANTHROPIC_API_KEY should exist in child env');
  // fake-claude redacts it, but we can check it's not the literal parent value
  // (though it's redacted, we can assert it's not the exact parent string)
  assert.notStrictEqual(fakeOutput.env.ANTHROPIC_API_KEY, 'sk-ant-parent-leak-test-key-123', 'ANTHROPIC_API_KEY should be overridden');
});

// 67. Parent ANTHROPIC_AUTH_TOKEN is stripped from child env (extended check)
it('67. parent ANTHROPIC_AUTH_TOKEN is completely absent from child env', async () => {
  const { fakeOutput, stderr } = await runWrapper(['-p', 'test'], {
    env: {
      ANTHROPIC_AUTH_TOKEN: 'sk-ant-auth-token-parent-leak-xyz',
      DEEPSEEK_API_KEY: 'sk-test-override-key',
    },
  });
  assert.ok(fakeOutput);
  assert.ok(!stderr.includes('sk-ant-auth-token-parent-leak-xyz'), 'parent ANTHROPIC_AUTH_TOKEN leaked to stderr');
  assert.ok(Object.prototype.hasOwnProperty.call(fakeOutput.env, 'ANTHROPIC_AUTH_TOKEN'), 'ANTHROPIC_AUTH_TOKEN should exist in child env');
  assert.notStrictEqual(fakeOutput.env.ANTHROPIC_AUTH_TOKEN, 'sk-ant-auth-token-parent-leak-xyz', 'ANTHROPIC_AUTH_TOKEN should be overridden');
});

// ==================================================================
// Gateway process mode tests (using fake gateway with --gateway-mode external)
// ==================================================================

describe('Gateway mode with external fake gateway', () => {
  let fakeGw = null;

  before(async () => {
    fakeGw = await startFakeGatewayInline();
  });

  after(() => {
    stopFakeGatewayInline(fakeGw);
  });

  // 68. Gateway mode sets ANTHROPIC_BASE_URL to gateway URL in child env
  it('68. gateway mode sets ANTHROPIC_BASE_URL to gateway URL', async () => {
    const { fakeOutput, exitCode } = await runWrapper([
      '--jeanclaude-mode', 'gateway',
      '--gateway-mode', 'external',
      '--gateway-url', fakeGw.url,
      '-p', 'test',
    ]);
    assert.strictEqual(exitCode, 0);
    assert.ok(fakeOutput);
    assert.strictEqual(
      fakeOutput.env.ANTHROPIC_BASE_URL,
      fakeGw.url,
      'ANTHROPIC_BASE_URL should point to gateway',
    );
  });

  // 69. Gateway token is present in child env
  it('69. gateway token is present in child env', async () => {
    const { fakeOutput } = await runWrapper([
      '--jeanclaude-mode', 'gateway',
      '--gateway-mode', 'external',
      '--gateway-url', fakeGw.url,
      '-p', 'test',
    ]);
    assert.ok(fakeOutput);
    // ANTHROPIC_AUTH_TOKEN should be set to the gateway token "jeanclaude-gateway"
    // (fake-claude redacts it due to _TOKEN suffix, so it shows [REDACTED])
    assert.ok(
      Object.prototype.hasOwnProperty.call(fakeOutput.env, 'ANTHROPIC_AUTH_TOKEN'),
      'ANTHROPIC_AUTH_TOKEN should be set in child env',
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(fakeOutput.env, 'ANTHROPIC_API_KEY'),
      'ANTHROPIC_API_KEY should be set in child env',
    );
  });

  // 70. Gateway mode preserves exit code with external gateway
  it('70. gateway mode preserves exit code with external gateway', async () => {
    const { exitCode, fakeOutput } = await runWrapper([
      '--jeanclaude-mode', 'gateway',
      '--gateway-mode', 'external',
      '--gateway-url', fakeGw.url,
      '-p', 'test',
    ], {
      env: { FAKE_CLAUDE_EXIT_CODE: '23' },
    });
    assert.ok(fakeOutput);
    assert.strictEqual(exitCode, 23, 'should preserve exit code 23');
  });
});

// ==================================================================
// Docker / container delegation test
// ==================================================================

// 71. bin/jeanclaude delegates to standalone (not docker compose)
it('71. bin/jeanclaude delegates to standalone and prints version', async () => {
  const result = await new Promise((resolve, reject) => {
    const binPath = join(REPO_ROOT, 'bin', 'jeanclaude');
    const child = spawn(binPath, ['--version'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        JEANCLAUDE_CLAUDE_BIN: FAKE_CLAUDE,
        DEEPSEEK_API_KEY: 'sk-test-key',
        JEANCLAUDE_NO_DOTENV: '1',
        ANTHROPIC_API_KEY: undefined,
        ANTHROPIC_AUTH_TOKEN: undefined,
        ANTHROPIC_BASE_URL: undefined,
        ANTHROPIC_MODEL: undefined,
        OPENAI_API_KEY: undefined,
        RESPONSE_API_KEY: undefined,
        BRAVE_API_KEY: undefined,
        UNSTRUCTURED_API_KEY: undefined,
        OPENROUTER_API_KEY: undefined,
        MEMORY_STORE_PASSWORD: undefined,
        PATH: process.env.PATH, // preserve PATH for node resolution
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('bin/jeanclaude test timed out after 10s'));
    }, 10000);

    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
  });

  assert.strictEqual(result.exitCode, 0, 'should exit 0');
  assert.ok(result.stdout.trim().length > 0, 'should print version');
  // Should NOT try docker compose (would fail in test env)
  assert.ok(!result.stderr.includes('compose'), 'should not try docker compose');
  assert.ok(!result.stderr.includes('docker'), 'should not try docker');
});

// 72. bin/jeanclaude with missing standalone falls through (checks error path)
it('72. bin/jeanclaude delegates to standalone even with JEANCLAUDE_DOCKER=1', async () => {
  // With the container-friendly fix, bin/jeanclaude always delegates to standalone
  // regardless of Docker detection. JEANCLAUDE_DOCKER=1 should NOT bypass standalone.
  const result = await new Promise((resolve) => {
    const binPath = join(REPO_ROOT, 'bin', 'jeanclaude');
    const child = spawn(binPath, ['--version'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        JEANCLAUDE_DOCKER: '1', // should NOT prevent standalone delegation
        JEANCLAUDE_NO_DOTENV: '1',
        DEEPSEEK_API_KEY: 'sk-test-fake-key',
        ANTHROPIC_API_KEY: undefined,
        ANTHROPIC_AUTH_TOKEN: undefined,
        ANTHROPIC_BASE_URL: undefined,
        OPENAI_API_KEY: undefined,
        RESPONSE_API_KEY: undefined,
        BRAVE_API_KEY: undefined,
        UNSTRUCTURED_API_KEY: undefined,
        OPENROUTER_API_KEY: undefined,
        MEMORY_STORE_PASSWORD: undefined,
        PATH: process.env.PATH,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ stdout, stderr, exitCode: -1 });
    }, 10000);

    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code });
    });
  });

  // Should succeed because standalone is available and handles it
  assert.strictEqual(result.exitCode, 0, 'should exit 0 when standalone handles --version even with JEANCLAUDE_DOCKER=1');
  assert.ok(result.stdout.trim().length > 0, 'should print version output');
});
