import test from 'node:test';
import assert from 'node:assert/strict';
import { redactObject, redactValue } from '../src/redact.js';

test('redactValue masks long values', () => {
  assert.equal(redactValue('sk-abcdefghijk'), 'sk-***ijk');
});

test('redactObject masks sensitive keys', () => {
  const input = {
    response_api_key: 'abc123456',
    nested: { BRAVE_API_KEY: 'brave-secret' },
    safe: 'ok'
  };
  const out = redactObject(input);
  assert.equal(out.safe, 'ok');
  assert.notEqual(out.response_api_key, input.response_api_key);
  assert.notEqual(out.nested.BRAVE_API_KEY, input.nested.BRAVE_API_KEY);
});
