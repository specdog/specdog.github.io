import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate } from '../evaluate-repositories.mjs';

test('resolves selected symbols in two real repositories without hiding partial context', () => {
  assert.ok(process.env.DOTDOG_RESEARCH_ROOT, 'Set DOTDOG_RESEARCH_ROOT.');
  assert.ok(process.env.TYPE_FEST_RESEARCH_ROOT, 'Set TYPE_FEST_RESEARCH_ROOT.');
  const evaluation = evaluate(process.env.DOTDOG_RESEARCH_ROOT, process.env.TYPE_FEST_RESEARCH_ROOT);
  assert.equal(evaluation.results.length, 4);
  for (const result of evaluation.results) {
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.targets.length, 4);
    for (const target of result.targets) {
      assert.ok(target.declarationCount > 0);
      assert.ok(target.contextBytes <= 16000);
    }
  }
  for (const result of evaluation.results.filter(r => r.repository === 'sindresorhus/type-fest')) {
    assert.ok(result.targets.every(target => target.status === 'partial'));
  }
});
