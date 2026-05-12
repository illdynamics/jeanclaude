import test from 'node:test';
import assert from 'node:assert/strict';
import { applyThinkingPolicy } from '../src/thinking-policy.js';

test('disabled thinking policy sets disabled block', () => {
  const out = applyThinkingPolicy({ model: 'x' }, { thinking: 'disabled', effort: 'high' });
  assert.equal(out.thinking.type, 'disabled');
});

test('enabled thinking policy defaults effort to max', () => {
  const out = applyThinkingPolicy({ model: 'x' }, { thinking: 'enabled', effort: 'max' });
  assert.equal(out.thinking.type, 'enabled');
  assert.equal(out.output_config.effort, 'max');
});
