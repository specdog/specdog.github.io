import { createHash } from 'node:crypto';
import { relative, resolve, dirname, isAbsolute } from 'node:path';

export function openProject(ts, configPath, { sourceRoot } = {}) {
  if (![5, 6].includes(Number(ts.version?.split('.')[0]))) {
    return { status: 'unsupported', reason: 'This research adapter implements only the TypeScript 5/6 API.' };
  }
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) return { status: 'invalid-config', diagnostics: [config.error.code] };
  const configRoot = dirname(resolve(configPath));
  const root = resolve(sourceRoot || configRoot);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, configRoot, undefined, configPath);
  if (parsed.errors.length) return { status: 'invalid-config', diagnostics: parsed.errors.map(d => d.code) };
  if (parsed.projectReferences?.length) return { status: 'unsupported', reason: 'Project-reference builds need a separate adapter.' };
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } });
  const checker = program.getTypeChecker();
  const diagnostics = ts.getPreEmitDiagnostics(program).map(d => ({
    code: d.code,
    file: d.file ? relative(root, d.file.fileName).replaceAll('\\', '/') : null,
    line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : null,
  }));
  const configHash = createHash('sha256').update(JSON.stringify(parsed.options)).digest('hex');
  const sourceHash = createHash('sha256');
  for (const file of program.getSourceFiles().slice().sort((a, b) => a.fileName.localeCompare(b.fileName))) {
    sourceHash.update(file.fileName).update('\0').update(file.text).update('\0');
  }
  const fingerprint = sourceHash.digest('hex');

  function extract(filePath, name, { maxDeclarations = 24, maxBytes = 24000, maxDepth = 8 } = {}) {
    const file = program.getSourceFile(resolve(filePath));
    if (!file) return { status: 'missing-file', name, diagnostics };
    const module = checker.getSymbolAtLocation(file);
    const target = module && checker.getExportsOfModule(module).find(symbol => symbol.name === name);
    if (!target) return { status: 'missing-export', name, diagnostics };
    const unalias = symbol => symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const queue = [{ symbol: unalias(target), depth: 0 }];
    const seen = new Set();
    const declarations = [];
    const omitted = [];
    const external = new Set();
    let bytes = 0;
    for (let index = 0; index < queue.length; index++) {
      const { symbol, depth } = queue[index];
      const nodes = symbol.declarations || [];
      if (nodes.every(node => ts.isTypeParameterDeclaration(node))) continue;
      const key = nodes.map(node => `${node.getSourceFile().fileName}:${node.pos}`).join('|');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const node = nodes[0];
      const source = node.getSourceFile();
      const fileName = relative(root, source.fileName).replaceAll('\\', '/');
      if (fileName.startsWith('../') || isAbsolute(fileName) || fileName.startsWith('node_modules/') || fileName.includes('/node_modules/')) {
        external.add(symbol.name);
        continue;
      }
      if (!nodes.every(n => ts.isFunctionDeclaration(n) || ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n) || (ts.isVariableDeclaration(n) && n.type && source.isDeclarationFile))) {
        omitted.push({ name: symbol.name, reason: 'unsupported-declaration' });
        continue;
      }
      const type = checker.getTypeOfSymbolAtLocation(symbol, node);
      const signatures = type.getCallSignatures().map(signature => checker.signatureToString(signature, node, ts.TypeFormatFlags.NoTruncation));
      const text = nodes.every(n => ts.isFunctionDeclaration(n))
        ? signatures.map(signature => `function ${symbol.name}${signature};`).join('\n')
        : nodes.map(n => ts.isVariableDeclaration(n) ? `declare const ${n.name.getText()}: ${n.type.getText()};` : n.getText()).join('\n');
      const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const size = Buffer.byteLength(`${declarations.length ? '\n\n' : ''}${fileName}:${line}\n${text}`);
      if (depth > maxDepth || declarations.length >= maxDeclarations || bytes + size > maxBytes) {
        omitted.push({ name: symbol.name, reason: depth > maxDepth ? 'depth' : 'budget' });
        continue;
      }
      bytes += size;
      declarations.push({
        name: symbol.name,
        file: fileName,
        line,
        text,
        signatures,
      });
      if (nodes.some(n => ts.isFunctionDeclaration(n) && (!n.type || n.parameters.some(p => !p.type)))) {
        omitted.push({ name: symbol.name, reason: 'inferred-signature-dependencies' });
      }
      const visit = n => {
        if (ts.isTypeReferenceNode(n) || ts.isExpressionWithTypeArguments(n) || ts.isTypeQueryNode(n) || ts.isComputedPropertyName(n)) {
          const reference = checker.getSymbolAtLocation(n.typeName || n.expression || n.exprName);
          if (reference) queue.push({ symbol: unalias(reference), depth: depth + 1 });
        }
        if (ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
          for (const parameter of n.typeParameters || []) visit(parameter);
          for (const parameter of n.parameters) if (parameter.type) visit(parameter.type);
          if (n.type) visit(n.type);
          return;
        }
        ts.forEachChild(n, visit);
      };
      for (const declaration of nodes) visit(declaration);
    }
    return {
      status: diagnostics.length ? 'unverified' : omitted.length || external.size ? 'partial' : 'checked',
      compiler: ts.version,
      strict: Boolean(parsed.options.strict),
      configHash,
      sourceHash: fingerprint,
      target: name,
      declarations,
      omitted,
      external: [...external].sort(),
      diagnostics,
      bytes,
      text: declarations.map(d => `${d.file}:${d.line}\n${d.text}`).join('\n\n'),
    };
  }
  return { status: diagnostics.length ? 'unverified' : 'checked', diagnostics, program, checker, extract };
}
