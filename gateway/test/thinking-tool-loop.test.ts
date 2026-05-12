import test from 'node:test';
import assert from 'node:assert/strict';
import { applyThinkingPolicy } from '../src/thinking-policy.js';

test('enabled thinking policy attaches effort', () => {
  const out = applyThinkingPolicy({ input: 'x' }, { thinking: 'enabled', effort: 'max' });
  assert.equal(out.thinking.type, 'enabled');
  assert.equal(out.output_config.effort, 'max');
});
