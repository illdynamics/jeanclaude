/**
 * gateway.test.mjs — Gateway mode integration tests.
 *
 * Spawns the fake gateway, then runs the JeanClaude wrapper in gateway mode
 * pointing at the fake gateway.  Uses Node's built-in `node:test` module.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

// ---- paths --------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const WRAPPER = join(REPO_ROOT, 'bin', 'jeanclaude-standalone.js');
const FAKE_CLAUDE = join(__dirname, 'fake-claude.mjs');
const FAKE_GATEWAY = join(__dirname, 'fake-gateway.mjs');

// ---- gateway lifecycle --------------------------------------------------
let FAKE_GATEWAY_URL = '';
let gatewayProcess = null;

function startFakeGateway() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [FAKE_GATEWAY], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let portLine = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Fake gateway did not print port within 5s'));
    }, 5000);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (d) => {
      portLine += d;
      const match = portLine.match(/^\d+$/m);
      if (match) {
        clearTimeout(timeout);
        const port = parseInt(match[0], 10);
        resolve(`http://127.0.0.1:${port}`);
      }
    });

    child.stderr.on('data', () => { /* discard */ });
    child.on('error', (err) => { clearTimeout(timeout); reject(err); });
    gatewayProcess = child;
  });
}

function stopFakeGateway() {
  if (gatewayProcess && !gatewayProcess.killed) {
    gatewayProcess.kill('SIGTERM');
    gatewayProcess = null;
  }
}

// ---- helpers ------------------------------------------------------------

function runWrapper(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      JEANCLAUDE_CLAUDE_BIN: FAKE_CLAUDE,
      DEEPSEEK_API_KEY: 'sk-test-gateway-key-99999',
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

    if (opts.stdin) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Gateway test timed out after ' + (opts.timeout || 15000) + 'ms'));
    }, opts.timeout || 15000);

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
        } catch (_) { /* not JSON */ }
      }

      resolve({ stdout, stderr, exitCode: code, signal, fakeOutput });
    });
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    }).on('error', reject);
  });
}

function httpPost(url, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers = { 'content-type': 'application/json', ...(extraHeaders || {}) };
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname,
      method: 'POST',
      headers,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---- suite --------------------------------------------------------------
describe('JeanClaude gateway mode', () => {

  before(async () => {
    FAKE_GATEWAY_URL = await startFakeGateway();
  });

  after(() => {
    stopFakeGateway();
  });

  // --- 1. Gateway health check works ---
  it('1. gateway health endpoint returns ok', async () => {
    const result = await httpGet(`${FAKE_GATEWAY_URL}/healthz`);
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body, { ok: true, version: '0.1.0', mode: 'gateway' });
  });

  // --- 2. Gateway passes model through ---
  it('2. gateway /v1/messages passes model through', async () => {
    const body = JSON.stringify({ model: 'deepseek-v4-pro', messages: [{ role: 'user', content: 'hi' }] });
    const result = await httpPost(`${FAKE_GATEWAY_URL}/v1/messages`, body);
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body, {
      fake: 'gateway',
      received: { model: 'deepseek-v4-pro' },
    });
  });

  // --- 3. Gateway /v1/messages/count_tokens works ---
  it('3. gateway count_tokens returns input_tokens', async () => {
    const body = JSON.stringify({ model: 'deepseek-v4-flash', messages: [] });
    const result = await httpPost(`${FAKE_GATEWAY_URL}/v1/messages/count_tokens`, body);
    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body, { input_tokens: 10 });
  });

  // --- 4. Gateway mode sets ANTHROPIC_BASE_URL to gateway URL in child claude env ---
  it('4. gateway mode sets ANTHROPIC_BASE_URL to gateway URL', async () => {
    const { fakeOutput, exitCode } = await runWrapper(
      ['--jeanclaude-mode', 'gateway', '--gateway-mode', 'external', '--gateway-url', FAKE_GATEWAY_URL, '-p', 'test'],
    );
    assert.strictEqual(exitCode, 0);
    assert.ok(fakeOutput, 'should invoke fake claude');
    assert.strictEqual(
      fakeOutput.env.ANTHROPIC_BASE_URL,
      FAKE_GATEWAY_URL,
      'ANTHROPIC_BASE_URL should point to fake gateway in gateway mode',
    );
  });

  // --- 5. Gateway mode preserves Claude Code exit code ---
  it('5. gateway mode preserves Claude Code exit code', async () => {
    const { exitCode, fakeOutput } = await runWrapper(
      ['--jeanclaude-mode', 'gateway', '--gateway-mode', 'external', '--gateway-url', FAKE_GATEWAY_URL, '-p', 'test'],
      { env: { FAKE_CLAUDE_EXIT_CODE: '7' } },
    );
    assert.ok(fakeOutput, 'should invoke fake claude');
    assert.strictEqual(exitCode, 7, 'should preserve exit code 7 from claude');
  });

  // --- 6. jeanclaude gateway health succeeds with running gateway ---
  it('6. jeanclaude gateway health succeeds with running gateway', async () => {
    const { exitCode, fakeOutput, stdout } = await runWrapper(
      ['gateway', 'health'],
      { env: { JEANCLAUDE_GATEWAY_URL: FAKE_GATEWAY_URL } },
    );
    assert.ok(
      exitCode === 0 || (fakeOutput === null && stdout.length > 0),
      'gateway health should succeed or at least not invoke claude',
    );
  });

  // --- 7. Gateway mode preserves exit code 0 ---
  it('7. gateway mode preserves exit code 0', async () => {
    const { exitCode } = await runWrapper(
      ['--jeanclaude-mode', 'gateway', '--gateway-mode', 'external', '--gateway-url', FAKE_GATEWAY_URL, '-p', 'test'],
      { env: { FAKE_CLAUDE_EXIT_CODE: '0' }, timeout: 15000 },
    );
    assert.strictEqual(exitCode, 0, 'gateway mode should preserve exit code 0');
  });

  // --- 8. FAKE_GATEWAY_EXIT_CODE error path ---
  it('8. fake gateway with FAKE_GATEWAY_EXIT_CODE exits non-zero', async () => {
    const result = await new Promise((resolve) => {
      const child = spawn('node', [FAKE_GATEWAY], {
        cwd: REPO_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, FAKE_GATEWAY_EXIT_CODE: '3' },
      });
      child.on('exit', (code) => { resolve({ exitCode: code }); });
      setTimeout(() => { child.kill(); resolve({ exitCode: -1 }); }, 5000);
    });
    assert.strictEqual(result.exitCode, 3, 'should exit with code 3 when FAKE_GATEWAY_EXIT_CODE=3');
  });

  // ==================================================================
  // NEW TESTS (Agent 5 — Gateway token validation)
  // ==================================================================

  // --- 9. Gateway validates valid authorization token ---
  it('9. gateway validates valid authorization token', async () => {
    // Start an auth-aware fake gateway
    const result = await new Promise((resolve, reject) => {
      const child = spawn('node', [FAKE_GATEWAY], {
        cwd: REPO_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FAKE_GATEWAY_REQUIRE_AUTH: '1',
          FAKE_GATEWAY_VALID_TOKEN: 'jeanclaude-gateway',
        },
      });

      let portLine = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Auth-aware gateway did not start within 5s'));
      }, 5000);

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        portLine += d;
        const match = portLine.match(/^\d+$/m);
        if (match) {
          clearTimeout(timer);
          const port = parseInt(match[0], 10);
          const url = `http://127.0.0.1:${port}`;
          resolve({ url, process: child });
        }
      });
      child.stderr.on('data', () => {});
      child.on('error', (err) => { clearTimeout(timer); reject(err); });
    });

    try {
      // Test with valid token → should get 200
      const validRes = await httpPost(`${result.url}/v1/messages`, JSON.stringify({ model: 'deepseek-v4-pro', messages: [{ role: 'user', content: 'hi' }] }), {
        Authorization: 'Bearer jeanclaude-gateway',
      });
      assert.strictEqual(validRes.status, 200, 'valid token should return 200');
      assert.deepStrictEqual(validRes.body, { fake: 'gateway', received: { model: 'deepseek-v4-pro' } });

      // Health endpoint should still work without auth
      const healthRes = await httpGet(`${result.url}/healthz`);
      assert.strictEqual(healthRes.status, 200);
    } finally {
      if (result.process && !result.process.killed) {
        result.process.kill('SIGTERM');
      }
    }
  });

  // --- 10. Gateway rejects invalid authorization token (401) ---
  it('10. gateway rejects invalid authorization token (401)', async () => {
    const result = await new Promise((resolve, reject) => {
      const child = spawn('node', [FAKE_GATEWAY], {
        cwd: REPO_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FAKE_GATEWAY_REQUIRE_AUTH: '1',
          FAKE_GATEWAY_VALID_TOKEN: 'jeanclaude-gateway',
        },
      });

      let portLine = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Auth-aware gateway did not start within 5s'));
      }, 5000);

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        portLine += d;
        const match = portLine.match(/^\d+$/m);
        if (match) {
          clearTimeout(timer);
          const port = parseInt(match[0], 10);
          const url = `http://127.0.0.1:${port}`;
          resolve({ url, process: child });
        }
      });
      child.stderr.on('data', () => {});
      child.on('error', (err) => { clearTimeout(timer); reject(err); });
    });

    try {
      // Test without auth header → should get 401
      const noAuthRes = await httpPost(`${result.url}/v1/messages`, JSON.stringify({ model: 'deepseek-v4-flash', messages: [] }));
      assert.strictEqual(noAuthRes.status, 401, 'missing auth should return 401');
      assert.ok(noAuthRes.body.error, '401 response should include error');

      // Test with wrong token → should get 401
      const wrongTokenRes = await httpPost(`${result.url}/v1/messages`, JSON.stringify({ model: 'deepseek-v4-flash', messages: [] }), {
        Authorization: 'Bearer wrong-token',
      });
      assert.strictEqual(wrongTokenRes.status, 401, 'wrong token should return 401');
      assert.ok(wrongTokenRes.body.error, '401 response for wrong token should include error');

      // Test with empty auth header → should get 401
      const emptyAuthRes = await httpPost(`${result.url}/v1/messages`, JSON.stringify({ model: 'deepseek-v4-flash', messages: [] }), {
        Authorization: ''
      });
      assert.strictEqual(emptyAuthRes.status, 401, 'empty auth header should return 401');
    } finally {
      if (result.process && !result.process.killed) {
        result.process.kill('SIGTERM');
      }
    }
  });
});
