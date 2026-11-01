import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { fixture } from './helpers.mjs';
import { dependency } from '../dependencies.mjs';
import { openProject } from '../context.mjs';

for (const compiler of ['typescript59', 'typescript60']) {
  test(`${compiler}: resolves re-exports, dependent unions, and recursive types`, t => {
    const project = fixture(t, {
      'model.ts': 'export type State = { kind: "ready"; next?: State } | { kind: "done"; receipt: string }; export type Box<T> = { value: T };',
      'operation.ts': 'import type { State, Box } from "./model"; export function wrap<T extends State>(state: T): Box<T> { return { value: state }; }',
      'index.ts': 'export { wrap as packageState } from "./operation";',
    }, {}, compiler);
    const context = project.open().extract(join(project.root, 'index.ts'), 'packageState');
    assert.equal(context.status, 'checked');
    assert.deepEqual(context.declarations.map(d => d.name), ['wrap', 'State', 'Box']);
    assert.match(context.text, /<T extends State>\(state: T\): Box<T>/);
    assert.equal(context.declarations[0].file, 'operation.ts');
    assert.doesNotMatch(context.text, /return \{ value: state \}/);
  });

  test(`${compiler}: retains all overload contracts`, t => {
    const project = fixture(t, { 'index.ts': 'export function convert(value: string): number; export function convert(value: number): string; export function convert(value: string | number): string | number { return typeof value === "string" ? value.length : String(value); }' }, {}, compiler);
    const context = project.open().extract(join(project.root, 'index.ts'), 'convert');
    assert.equal(context.status, 'checked');
    assert.deepEqual(context.declarations[0].signatures, ['(value: string): number', '(value: number): string']);
  });

  test(`${compiler}: reports missing imports rather than approving context`, t => {
    const project = fixture(t, { 'index.ts': 'import type { Missing } from "./absent"; export function run(value: Missing): Missing { return value; }' }, {}, compiler);
    const context = project.open().extract(join(project.root, 'index.ts'), 'run');
    assert.equal(context.status, 'unverified');
    assert.ok(context.diagnostics.some(d => d.code === 2307));
  });

  test(`${compiler}: honors config inheritance and path aliases`, t => {
    const project = fixture(t, {
      'base.json': JSON.stringify({ compilerOptions: { strict: true, paths: { '@model': ['./model.ts'] } } }),
      'tsconfig.json': JSON.stringify({ extends: './base.json', compilerOptions: { types: [], noEmit: true }, files: ['index.ts', 'model.ts'] }),
      'model.ts': 'export type Identifier = { readonly id: string };',
      'index.ts': 'import type { Identifier } from "@model"; export function identify(value: Identifier): Identifier { return value; }',
    }, {}, compiler);
    const context = project.open().extract(join(project.root, 'index.ts'), 'identify');
    assert.equal(context.status, 'checked');
    assert.ok(context.declarations.some(d => d.name === 'Identifier'));
  });

  test(`${compiler}: truncation is explicit and never slices declarations`, t => {
    const project = fixture(t, { 'index.ts': 'export interface Value { id: string }; export function identity(value: Value): Value { return value; }' }, {}, compiler);
    const context = project.open().extract(join(project.root, 'index.ts'), 'identity', { maxDeclarations: 1 });
    assert.equal(context.status, 'partial');
    assert.equal(context.declarations.length, 1);
    assert.deepEqual(context.omitted, [{ name: 'Value', reason: 'budget' }]);
  });

  test(`${compiler}: changing imported types invalidates the evidence`, t => {
    const project = fixture(t, {
      'model.ts': 'export type Value = { id: string };',
      'index.ts': 'import type { Value } from "./model"; export function read(value: Value): string { return value.id; }',
    }, {}, compiler);
    const before = project.open().extract(join(project.root, 'index.ts'), 'read');
    project.write('model.ts', 'export type Value = { id: number };');
    const after = project.open().extract(join(project.root, 'index.ts'), 'read');
    assert.notEqual(before.sourceHash, after.sourceHash);
    assert.equal(after.status, 'unverified');
    assert.ok(after.diagnostics.some(d => d.code === 2322));
  });
}

test('a solution with project references is explicitly unsupported', t => {
  const project = fixture(t, { 'tsconfig.json': '{"files":[],"references":[{"path":"./lib"}]}' });
  assert.equal(project.open().status, 'unsupported');
});

test('malformed configs do not produce checked context', t => {
  const project = fixture(t, { 'tsconfig.json': '{ broken' });
  assert.equal(project.open().status, 'invalid-config');
});

test('missing files and exported symbols remain unresolved', t => {
  const project = fixture(t, { 'index.ts': 'export type Found = string;' });
  const session = project.open();
  assert.equal(session.extract(join(project.root, 'missing.ts'), 'Found').status, 'missing-file');
  assert.equal(session.extract(join(project.root, 'index.ts'), 'Missing').status, 'missing-export');
});

test('the installed TypeScript 7.1 beta is not claimed compatible', () => {
  const info = dependency('typescript71/package.json');
  assert.match(info.version, /^7\.1\./);
  assert.equal(openProject({ version: info.version }, 'unused').status, 'unsupported');
});

test('inferred signature dependencies are not claimed fully extracted', t => {
  const project = fixture(t, { 'index.ts': 'type Value = { id: string }; declare const value: Value; export function read() { return value; }' });
  const context = project.open().extract(join(project.root, 'index.ts'), 'read');
  assert.equal(context.status, 'partial');
  assert.ok(context.omitted.some(d => d.reason === 'inferred-signature-dependencies'));
});

test('classes are not exported with implementation bodies', t => {
  const project = fixture(t, { 'index.ts': 'export class Value { id = "body-only"; }' });
  const context = project.open().extract(join(project.root, 'index.ts'), 'Value');
  assert.equal(context.status, 'partial');
  assert.equal(context.text, '');
});

test('context byte budgets include source locations and separators', t => {
  const project = fixture(t, { 'index.ts': 'export type Value = { id: string };' });
  const context = project.open().extract(join(project.root, 'index.ts'), 'Value', { maxBytes: 20 });
  assert.equal(context.status, 'partial');
  assert.ok(Buffer.byteLength(context.text) <= 20);
});

test('computed unique-symbol keys retain the declaration that establishes brand identity', t => {
  const project = fixture(t, {
    'brand.d.ts': 'export declare const marker: unique symbol;',
    'index.ts': 'import { marker } from "./brand"; export type Tagged = string & { readonly [marker]: "tag" };',
  });
  const context = project.open().extract(join(project.root, 'index.ts'), 'Tagged');
  assert.equal(context.status, 'checked');
  assert.deepEqual(context.declarations.map(d => d.name), ['Tagged', 'marker']);
  assert.match(context.text, /declare const marker: unique symbol/);
});
