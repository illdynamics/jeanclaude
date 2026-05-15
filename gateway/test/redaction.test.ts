import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, isSecretKey, isSecretValue, redactObject } from '../src/redact.js';

test('redact masks long values — first 4 + ... + last 4', () => {
  assert.equal(redact('test-fake-key-12345'), 'test...2345');
});

test('redact masks short values as ***', () => {
  assert.equal(redact('abc'), '***');
  assert.equal(redact('abcdefgh'), '***');
});

test('redact handles null/undefined', () => {
  assert.equal(redact(null), 'missing');
  assert.equal(redact(undefined), 'missing');
});

test('isSecretKey detects known secret key names', () => {
  assert.equal(isSecretKey('DEEPSEEK_API_KEY'), true);
  assert.equal(isSecretKey('anthropic_api_key'), true);
  assert.equal(isSecretKey('x-api-key'), true);
  assert.equal(isSecretKey('Authorization'), true);
  assert.equal(isSecretKey('model'), false);
  assert.equal(isSecretKey('foo'), false);
});

test('redactObject redacts secret-keyed values', () => {
  const obj = { api_key: 'test-fake-key-12345', model: 'deepseek-chat', temperature: 0 };
  const out = redactObject(obj);
  assert.equal(out.api_key, 'test...2345');
  assert.equal(out.model, 'deepseek-chat');
  assert.equal(out.temperature, 0);
});

test('isSecretValue detects known API key prefixes', () => {
  assert.equal(isSecretValue('sk-test-fake-key-12345'), true);
  assert.equal(isSecretValue('dsk-deepseek-key-example'), true);
  assert.equal(isSecretValue('pk-public-key-12345'), true);
});

test('isSecretValue detects JWT-like tokens', () => {
  // Three base64url segments, >50 chars total
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QgVXNlciJ9.abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
  assert.equal(isSecretValue(jwt), true);
});

test('isSecretValue does NOT flag SHA256 digests', () => {
  assert.equal(isSecretValue('sha256:abc123def456abc123def456abc123def456abc123def456abc123def456'), false);
  assert.equal(isSecretValue('sha512:abc123def456abc123def456abc123def456abc123def456abc123def456abc123def456'), false);
});

test('isSecretValue does NOT flag file paths or URLs', () => {
  assert.equal(isSecretValue('/opt/jeanclaude/gateway/dist/src/server.js'), false);
  assert.equal(isSecretValue('https://example.com/api/v1/very/long/path/endpoint'), false);
  assert.equal(isSecretValue('/workspace/.jeanclaude/config/system-prompt.md'), false);
});

test('isSecretValue does NOT flag short or low-entropy strings', () => {
  assert.equal(isSecretValue('just_a_simple_underscore_key_not_secret'), false);
  assert.equal(isSecretValue('alllowercaseeveniflongenough'), false);
  assert.equal(isSecretValue('ALLUPPERCASEEVENIFLONGENOUGH'), false);
  assert.equal(isSecretValue('abc'), false);
  assert.equal(isSecretValue(''), false);
});

test('isSecretValue flags long mixed-case tokens with symbols', () => {
  // Long string with mix of upper+lower+digits+symbols = high entropy
  assert.equal(isSecretValue('sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-abcdef'), true);
});
