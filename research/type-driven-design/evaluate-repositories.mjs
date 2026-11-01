import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { dependency } from './dependencies.mjs';
import { openProject } from './context.mjs';

export function evaluate(dotdog, typeFest) {
  const temp = mkdtempSync(join(tmpdir(), 'specdog-type-corpus-'));
  const corpora = [
    {
      name: 'specdog/dotdog', root: resolve(dotdog),
      options: { module: 'ESNext', moduleResolution: 'Bundler', exactOptionalPropertyTypes: false },
      targets: [
        ['packages/dotdog/src/workspace/selection.ts', 'selectionFromOptions'],
        ['packages/dotdog/src/workspace/types.ts', 'WorkspaceConfig'],
        ['packages/dotdog/src/dag/schema.ts', 'RepositoryWorldModel'],
        ['packages/dotdog/src/design/audit.ts', 'auditDesign'],
      ],
    },
    {
      name: 'sindresorhus/type-fest', root: resolve(typeFest),
      options: { module: 'NodeNext', moduleResolution: 'NodeNext', exactOptionalPropertyTypes: true },
      targets: [
        ['source/simplify.d.ts', 'Simplify'],
        ['source/merge.d.ts', 'Merge'],
        ['source/jsonify.d.ts', 'Jsonify'],
        ['source/tagged.d.ts', 'Tagged'],
      ],
    },
  ];
  const results = [];
  try {
    for (const compilerName of ['typescript59', 'typescript60']) {
      const ts = dependency(compilerName);
      for (const corpus of corpora) {
        const configFile = join(temp, `${compilerName}-${results.length}.json`);
        writeFileSync(configFile, JSON.stringify({ compilerOptions: {
          strict: true, noEmit: true, target: 'ESNext', types: [], skipLibCheck: false, ...corpus.options,
        }, files: corpus.targets.map(([file]) => join(corpus.root, file)) }));
        const started = performance.now();
        const session = openProject(ts, configFile, { sourceRoot: corpus.root });
        assert.ok(session.extract, `${corpus.name}: no project context`);
        const setupMs = performance.now() - started;
        const localFiles = session.program.getSourceFiles().filter(file => {
          const name = relative(corpus.root, file.fileName);
          return !name.startsWith('..') && !name.startsWith('node_modules');
        });
        const targets = corpus.targets.map(([file, name]) => {
          const start = performance.now();
          const context = session.extract(join(corpus.root, file), name, { maxDeclarations: 24, maxBytes: 16000, maxDepth: 8 });
          assert.ok(context.declarations?.some(d => d.name === name), `${corpus.name}: failed to resolve ${name}`);
          assert.ok(Buffer.byteLength(context.text) <= 16000);
          if (session.diagnostics.length) assert.equal(context.status, 'unverified');
          if (context.omitted.length || context.external.length) assert.notEqual(context.status, 'checked');
          return {
            name, file, status: context.status, declarationCount: context.declarations.length,
            names: context.declarations.map(d => d.name), omitted: context.omitted, external: context.external,
            contextBytes: Buffer.byteLength(context.text),
            targetFileBytes: Buffer.byteLength(session.program.getSourceFile(join(corpus.root, file)).text),
            extractionMs: Math.round((performance.now() - start) * 100) / 100,
          };
        });
        results.push({
          repository: corpus.name,
          revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: corpus.root, encoding: 'utf8' }).trim(),
          compiler: ts.version,
          scope: 'Targeted research configuration, not the repository full build or test suite',
          options: { strict: true, skipLibCheck: false, target: 'ESNext', ...corpus.options },
          programSourceFiles: session.program.getSourceFiles().length,
          localSourceFiles: localFiles.length,
          localSourceBytes: localFiles.reduce((sum, file) => sum + Buffer.byteLength(file.text), 0),
          diagnostics: session.diagnostics,
          setupMs: Math.round(setupMs * 100) / 100,
          targets,
        });
      }
    }
    return { node: process.version, measurement: 'One local run; bytes are not model tokens; timings are not a benchmark', results };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.env.DOTDOG_RESEARCH_ROOT || !process.env.TYPE_FEST_RESEARCH_ROOT) throw new Error('Set DOTDOG_RESEARCH_ROOT and TYPE_FEST_RESEARCH_ROOT to read-only checkouts.');
  const result = evaluate(process.env.DOTDOG_RESEARCH_ROOT, process.env.TYPE_FEST_RESEARCH_ROOT);
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.results.map(r => ({ repository: r.repository, compiler: r.compiler, diagnostics: r.diagnostics, targets: r.targets.map(t => ({ name: t.name, status: t.status, declarations: t.declarationCount, bytes: t.contextBytes, omissions: t.omitted.length, external: t.external.length })) })), null, 2));
}
