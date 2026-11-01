import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessRule } from '../trace-evidence.mjs';

function fixture() {
  const rule = { id: 'manifest-input', revision: 'rule-1', obligations: ['compile', 'runtime'] };
  const inputs = { 'repo:Workspace': 'type-1', 'repo:parse': 'parser-1', 'repo:compile-test': 'test-1', 'repo:runtime-test': 'test-2' };
  const current = { inputs, compiler: '6.0.3', configuration: 'config-1', completeness: 'complete' };
  const links = [
    { rule: rule.id, obligation: 'compile', check: 'compile', reviewed: true, artifacts: ['repo:Workspace', 'repo:parse', 'repo:compile-test'] },
    { rule: rule.id, obligation: 'runtime', check: 'runtime', reviewed: true, artifacts: ['repo:Workspace', 'repo:parse', 'repo:runtime-test'] },
  ];
  const runs = ['compile', 'runtime'].map(check => ({ check, kind: check, status: 'passed', inputs: { ...inputs }, compiler: current.compiler, configuration: current.configuration, ruleRevision: rule.revision }));
  return { rule, links, runs, current };
}

test('reviewed current records satisfy the declared evidence checklist, not a semantic proof', () => {
  const f = fixture();
  assert.equal(assessRule(f.rule, f.links, f.runs, f.current).status, 'current-evidence');
});

for (const [name, change, expected] of [
  ['compile evidence cannot cover a runtime obligation', f => { f.links = f.links.slice(0, 1); }, 'missing-check'],
  ['inferred or unreviewed links do not count as reviewed evidence', f => { f.links[1].reviewed = false; }, 'unreviewed'],
  ['a changed parser invalidates old runtime evidence', f => { f.current.inputs['repo:parse'] = 'parser-2'; }, 'stale'],
  ['a changed configuration invalidates old runtime evidence', f => { f.current.configuration = 'config-2'; }, 'stale'],
  ['a changed compiler invalidates old runtime evidence', f => { f.current.compiler = '7.1.0-beta'; }, 'stale'],
  ['a renamed or missing symbol remains unresolved', f => { delete f.current.inputs['repo:parse']; }, 'unresolved-input'],
  ['a skipped check is not a pass', f => { f.runs[1].status = 'skipped'; }, 'not-passed'],
  ['a failed check is not hidden by a successful check', f => { f.runs[1].status = 'failed'; }, 'check-failed'],
  ['changed requirement text invalidates old evidence', f => { f.rule.revision = 'rule-2'; }, 'stale'],
  ['a compiler result cannot be relabeled as runtime evidence', f => { f.runs[1].kind = 'compile'; }, 'wrong-check-kind'],
  ['ambiguous run history does not silently select an old pass', f => { f.runs.push({ ...f.runs[1], status: 'failed' }); }, 'ambiguous-history'],
  ['partial type context cannot support a complete-evidence claim', f => { f.current.completeness = 'partial'; }, 'incomplete-inputs'],
  ['unknown dependency completeness cannot support a complete-evidence claim', f => { delete f.current.completeness; }, 'incomplete-inputs'],
]) {
  test(name, () => {
    const f = fixture();
    change(f);
    const result = assessRule(f.rule, f.links, f.runs, f.current);
    assert.equal(result.status, 'gap');
    const runtime = result.obligations.find(item => item.obligation === 'runtime');
    assert.equal(runtime.checks?.[0]?.status || runtime.status, expected);
  });
}
