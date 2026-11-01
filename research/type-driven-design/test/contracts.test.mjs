import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fixture } from './helpers.mjs';

const model = `
declare const brand: unique symbol;
export type OrderId = string & { readonly [brand]: "order" };
export type UserId = string & { readonly [brand]: "user" };
export type Draft = { state: "draft"; id: OrderId };
export type Paid = { state: "paid"; id: OrderId; receipt: string };
export type Shipped = { state: "shipped"; id: OrderId; receipt: string; tracking: string };
export type Order = Draft | Paid | Shipped;
export function paidOrderId(order: Paid): OrderId { return order.id; }
export function lookup(id: OrderId): string { return id; }
export function stateLabel(order: Order): string {
  switch (order.state) {
    case "draft": return "draft";
    case "paid": return "paid";
    case "shipped": return "shipped";
    default: { const exhaustive: never = order; return exhaustive; }
  }
}
`;
const valid = `import { type OrderId, type Paid, type Shipped, lookup, paidOrderId, stateLabel } from "./model";
declare const id: OrderId;
const paid: Paid = { state: "paid", id, receipt: "receipt" };
const shipped: Shipped = { state: "shipped", id, receipt: "receipt", tracking: "tracking" };
lookup(paidOrderId(paid)); stateLabel(shipped);`;

for (const compiler of ['typescript59', 'typescript60']) {
  for (const [name, bad, expected, mutate] of [
    ['wrong identifier', 'import { lookup, type UserId } from "./model"; declare const user: UserId; lookup(user);', 2345, source => source.replace('string & { readonly [brand]: "order" }', 'string').replace('string & { readonly [brand]: "user" }', 'string')],
    ['wrong state', 'import { paidOrderId, type Draft } from "./model"; declare const draft: Draft; paidOrderId(draft);', 2345, source => source.replace('paidOrderId(order: Paid)', 'paidOrderId(order: Paid | Draft)')],
    ['missing state data', 'import { type Shipped, type OrderId } from "./model"; declare const id: OrderId; const shipped: Shipped = { state: "shipped", id, receipt: "receipt" };', 2741, source => source.replace('tracking: string', 'tracking?: string')],
  ]) {
    test(`${compiler}: ${name} contract detects deliberate weakening`, t => {
      const project = fixture(t, { 'model.ts': model, 'valid.ts': valid }, {}, compiler);
      assert.deepEqual(project.open().diagnostics, []);
      project.write('bad.ts', bad);
      const rejected = project.open().diagnostics;
      assert.deepEqual(rejected.map(d => [d.file, d.code]), [['bad.ts', expected]]);
      project.write('model.ts', mutate(model));
      assert.deepEqual(project.open().diagnostics, []);
    });
  }

  test(`${compiler}: adding a state fails until the exhaustive handler is updated`, t => {
    const project = fixture(t, { 'model.ts': model, 'valid.ts': valid }, {}, compiler);
    assert.deepEqual(project.open().diagnostics, []);
    const extraState = model.replace('Draft | Paid | Shipped;', 'Draft | Paid | Shipped | { state: "refunded"; id: OrderId };');
    project.write('model.ts', extraState);
    assert.deepEqual(project.open().diagnostics.map(d => [d.file, d.code]), [['model.ts', 2322]]);
    project.write('model.ts', extraState.replace('const exhaustive: never = order; return exhaustive;', 'return "unknown";'));
    assert.deepEqual(project.open().diagnostics, []);
  });

  test(`${compiler}: unrelated compiler errors cannot satisfy a negative contract`, t => {
    const project = fixture(t, { 'model.ts': model, 'valid.ts': valid, 'bad.ts': 'undeclaredValue;' }, {}, compiler);
    const diagnostics = project.open().diagnostics;
    assert.deepEqual(diagnostics.map(d => d.code), [2304]);
    assert.equal(diagnostics.some(d => d.file === 'bad.ts' && d.code === 2345), false);
  });

  test(`${compiler}: disabling null checks weakens the optional-value contract`, t => {
    const project = fixture(t, { 'index.ts': 'export function read(value?: string): string { return value; }' }, {}, compiler);
    assert.ok(project.open().diagnostics.some(d => d.code === 2322));
    project.write('tsconfig.json', JSON.stringify({ compilerOptions: { strict: false, noEmit: true, types: [] }, files: ['index.ts'] }));
    assert.deepEqual(project.open().diagnostics, []);
  });

  test(`${compiler}: unknown is checked but any and assertions can bypass a contract`, t => {
    const project = fixture(t, {
      'model.ts': model,
      'unsafe.ts': 'import { paidOrderId, type Paid } from "./model"; declare const input: any; paidOrderId(input); paidOrderId({} as Paid);',
    }, {}, compiler);
    assert.deepEqual(project.open().diagnostics, []);
    project.write('unsafe.ts', 'import { paidOrderId } from "./model"; declare const input: unknown; paidOrderId(input);');
    assert.deepEqual(project.open().diagnostics.map(d => [d.file, d.code]), [['unsafe.ts', 2345]]);
  });
}
