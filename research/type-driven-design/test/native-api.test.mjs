import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
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
