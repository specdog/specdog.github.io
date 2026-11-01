import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dependency } from '../dependencies.mjs';
import { parseWorkspace } from '../workspace-parser.ts';
import { fixture } from './helpers.mjs';

const dotdog = process.env.DOTDOG_RESEARCH_ROOT;
if (!dotdog) throw new Error('DOTDOG_RESEARCH_ROOT must identify the read-only Dotdog checkout.');
const { validateWorkspaceConfig } = await import(pathToFileURL(join(dotdog, 'packages/dotdog/src/workspace/validator.ts')));
const valid = { version: 1, workspace: { id: 'example-workspace' }, repos: [{ alias: 'example-service', path: '.' }] };
const parse = input => parseWorkspace(input, validateWorkspaceConfig);

test('reproduces existing malformed-input crashes in the real validator', () => {
  assert.equal(validateWorkspaceConfig(valid).valid, true);
  assert.throws(() => validateWorkspaceConfig({ ...valid, repos: [null] }), TypeError);
  assert.throws(() => validateWorkspaceConfig({ ...valid, groups: {} }), TypeError);
  assert.equal(parse({ ...valid, repos: [null] }).ok, false);
  assert.equal(parse({ ...valid, groups: {} }).ok, false);
});

test('returns checked data on success and no data on malformed input', () => {
  const result = parse(valid);
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, valid);
  for (const input of [null, [], 1, '', {}, { ...valid, repos: [null] }, { ...valid, repos: [1] }, { ...valid, groups: [null] }, { ...valid, groups: {} }, { ...valid, edges: {} }, { ...valid, edges: [null] }, { ...valid, repos: [{ alias: 'example-service', path: 2 }] }]) {
    const rejected = parse(input);
    assert.equal(rejected.ok, false);
    assert.equal('data' in rejected, false);
    assert.ok(rejected.errors.length);
  }
});

test('preserves real duplicate-alias and cross-reference checks', () => {
  const duplicate = parse({ ...valid, repos: [...valid.repos, ...valid.repos] });
  assert.equal(duplicate.stage, 'semantic');
  assert.ok(duplicate.errors.some(error => error.code === 'duplicate_repo_alias'));
  const unknown = parse({ ...valid, edges: [{ from: 'example-service', to: 'missing', type: 'http' }] });
  assert.equal(unknown.stage, 'semantic');
  assert.ok(unknown.errors.some(error => error.code === 'unknown_edge_to'));
});

test('rejects an incomplete group that the existing validator accepts', () => {
  const input = { ...valid, groups: [{ name: 'example-group' }] };
  assert.equal(validateWorkspaceConfig(input).valid, true);
  assert.equal(parse(input).ok, false);
});

test('returns a result for 1000 seeded arbitrary JSON values', () => {
  const fc = dependency('fast-check');
  fc.assert(fc.property(fc.jsonValue(), input => {
    const result = parse(input);
    assert.equal(typeof result.ok, 'boolean');
    if (result.ok) assert.equal(validateWorkspaceConfig(result.data).valid, true);
    else assert.ok(result.errors.length);
  }), { seed: 20261031, numRuns: 1000 });
});

test('returns a result for 1000 seeded nested-manifest mutations', () => {
  const fc = dependency('fast-check');
  fc.assert(fc.property(fc.jsonValue(), fc.constantFrom('repos', 'workspace', 'groups', 'edges'), (value, key) => {
    const input = { ...valid, [key]: value };
    const result = parse(input);
    assert.equal(typeof result.ok, 'boolean');
    if (result.ok) assert.equal(validateWorkspaceConfig(result.data).valid, true);
  }), { seed: 20261101, numRuns: 1000 });
});

test('accepts and returns 500 seeded valid manifests rather than rejecting everything', () => {
  const fc = dependency('fast-check');
  const aliases = fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/), { minLength: 1, maxLength: 6 });
  fc.assert(fc.property(aliases, names => {
    const input = {
      ...valid,
      repos: names.map(alias => ({ alias, path: `./${alias}` })),
      groups: [{ name: 'example-group', repos: names }],
      edges: [{ from: names[0], to: names.at(-1), type: 'http' }],
    };
    const result = parse(input);
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, input);
  }), { seed: 20261102, numRuns: 500 });
});

for (const compiler of ['typescript59', 'typescript60']) {
  test(`${compiler}: parser result narrows to the real WorkspaceConfig without a cast`, t => {
    const parser = fileURLToPath(new URL('../workspace-parser.ts', import.meta.url));
    const types = resolve(dotdog, 'packages/dotdog/src/workspace/types.ts');
    const project = fixture(t, {
      'package.json': '{"type":"module"}',
      'use.ts': `import { parseWorkspace } from ${JSON.stringify(parser)};
import type { WorkspaceConfig } from ${JSON.stringify(types)};
declare const input: unknown;
declare const validate: (value: unknown) => { valid: boolean; errors: [] };
declare function consume(config: WorkspaceConfig): void;
const result = parseWorkspace(input, validate);
if (result.ok) consume(result.data);
else { const errors = result.errors; }
`,
    }, { allowImportingTsExtensions: true, esModuleInterop: true, skipLibCheck: true, module: 'Node16', moduleResolution: 'Node16' }, compiler);
    assert.deepEqual(project.open().diagnostics, []);
    project.write('bad.ts', `import { parseWorkspace } from ${JSON.stringify(parser)}; declare const validate: (value: unknown) => { valid: boolean; errors: [] }; const result = parseWorkspace(null, validate); result.data;`);
    const diagnostics = project.open().diagnostics;
    assert.deepEqual(diagnostics.map(d => [d.file, d.code]), [['bad.ts', 2339]]);
  });

  test(`${compiler}: exact optional-property incompatibility remains visible`, t => {
    const parser = fileURLToPath(new URL('../workspace-parser.ts', import.meta.url));
    const types = resolve(dotdog, 'packages/dotdog/src/workspace/types.ts');
    const project = fixture(t, {
      'package.json': '{"type":"module"}',
      'use.ts': `import { parseWorkspace } from ${JSON.stringify(parser)};
import type { WorkspaceConfig } from ${JSON.stringify(types)};
declare const validate: (value: unknown) => { valid: boolean; errors: [] };
declare function consume(config: WorkspaceConfig): void;
const result = parseWorkspace(null, validate);
if (result.ok) consume(result.data);`,
    }, { allowImportingTsExtensions: true, esModuleInterop: true, skipLibCheck: true, module: 'Node16', moduleResolution: 'Node16', exactOptionalPropertyTypes: true }, compiler);
    assert.deepEqual(project.open().diagnostics.map(d => [d.file, d.code]), [['use.ts', 2379]]);
  });
}
