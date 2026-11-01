import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { dependency } from '../dependencies.mjs';
import { openProject } from '../context.mjs';

export function fixture(t, files, options = {}, compiler = 'typescript60') {
  const root = mkdtempSync(join(tmpdir(), 'specdog-type-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, text) => {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    return file;
  };
  write('tsconfig.json', JSON.stringify({ compilerOptions: {
    strict: true, noEmit: true, target: 'ES2022', module: 'CommonJS', types: [], ...options,
  }, include: ['**/*.ts'] }));
  for (const [name, text] of Object.entries(files)) write(name, text);
  return { root, write, open: () => openProject(dependency(compiler), join(root, 'tsconfig.json')) };
}
