import test from 'node:test';
import assert from 'node:assert/strict';
import { redact, isSecretKey, redactObject } from '../src/redact.js';

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
