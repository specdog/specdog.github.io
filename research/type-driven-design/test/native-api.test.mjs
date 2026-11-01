import assert from 'node:assert/strict';
import { test } from 'node:test';
import { basename, resolve } from 'node:path';
import { dependency } from '../dependencies.mjs';

test('TypeScript 7.1 beta API detects a bad assignment and a repaired snapshot', () => {
  const { API } = dependency('typescript71/sync');
  const { ScriptTarget } = dependency('typescript71/ast');
  const { createFileSystemWithLib, createFileSystemLayer } = dependency('typescript71/fs');
  const api = new API();
  const file = resolve('type-research-snapshot.ts');
  let before;
  let after;
  let program;
  let updated;
  try {
    before = api.createSnapshot({
      fileSystem: createFileSystemWithLib([[file, 'export const count: number = "invalid";']]),
      createPrograms: [{ rootFiles: [file], compilerOptions: { strict: true, noEmit: true, target: ScriptTarget.ES2022 } }],
    });
    program = before.operation.createdPrograms[0];
    assert.ok(program.getSemanticDiagnostics().some(d => d.code === 2322));
    after = before.update({
      fileSystem: createFileSystemLayer([[file, 'export const count: number = 42;']]),
      ensurePrograms: [program.id],
    });
    updated = after.getProgram(program.id);
    assert.ok(updated);
    assert.deepEqual(updated.getSemanticDiagnostics(), []);
    assert.ok(program.getSemanticDiagnostics().some(d => d.code === 2322));
  } finally {
    updated?.[Symbol.dispose]?.();
    program?.[Symbol.dispose]?.();
    after?.[Symbol.dispose]?.();
    before?.[Symbol.dispose]?.();
    api[Symbol.dispose]();
  }
});

test('TypeScript 7.1 beta resolves a re-exported operation and detects an imported contract change', () => {
  const { API, ModuleKind, ModuleResolutionKind, TypeFormatFlags } = dependency('typescript71/sync');
  const { ScriptTarget } = dependency('typescript71/ast');
  const { createFileSystemWithLib, createFileSystemLayer } = dependency('typescript71/fs');
  const api = new API();
  const model = resolve('native-type-model.ts'), entry = resolve('native-type-entry.ts'), consumer = resolve('native-type-consumer.ts');
  const modelText = 'export type Paid = { state: "paid"; receipt: string }; export function ship(order: Paid): Paid { return order; }';
  let before, after, program, updated;
  try {
    before = api.createSnapshot({
      fileSystem: createFileSystemWithLib([
        [model, modelText],
        [entry, 'export { ship as dispatch } from "./native-type-model";'],
        [consumer, 'import { dispatch } from "./native-type-entry"; dispatch({ state: "paid", receipt: "receipt" });'],
      ]),
      createPrograms: [{ rootFiles: [model, entry, consumer], compilerOptions: { strict: true, noEmit: true, target: ScriptTarget.ES2022, module: ModuleKind.ESNext, moduleResolution: ModuleResolutionKind.Bundler } }],
    });
    program = before.operation.createdPrograms[0];
    assert.deepEqual(program.getSemanticDiagnostics(), []);
    const checker = program.getProject().checker;
    const module = checker.getSymbolOfSourceFile(entry);
    assert.ok(module);
    const exports = checker.getExportsOfModule(module);
    assert.equal(exports.find(symbol => symbol.name === 'missing'), undefined);
    const alias = exports.find(symbol => symbol.name === 'dispatch');
    assert.ok(alias);
    const operation = checker.getAliasedSymbol(alias);
    assert.equal(operation.name, 'ship');
    assert.equal(basename(operation.declarations[0].path), 'native-type-model.ts');
    assert.equal(checker.typeToString(checker.getTypeOfSymbol(operation), undefined, TypeFormatFlags.NoTruncation), '(order: Paid) => Paid');
    after = before.update({ fileSystem: createFileSystemLayer([[model, modelText.replace('receipt: string', 'receipt: number')]]), ensurePrograms: [program.id] });
    updated = after.getProgram(program.id);
    assert.deepEqual(updated.getSemanticDiagnostics().map(diagnostic => diagnostic.code), [2322]);
    assert.deepEqual(program.getSemanticDiagnostics(), []);
  } finally {
    updated?.[Symbol.dispose]?.();
    program?.[Symbol.dispose]?.();
    after?.[Symbol.dispose]?.();
    before?.[Symbol.dispose]?.();
    api[Symbol.dispose]();
  }
});
