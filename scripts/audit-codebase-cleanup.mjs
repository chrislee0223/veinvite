import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_ROOT = path.join(ROOT, 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const NEXT_ROOT_BASENAMES = new Set([
  'page',
  'layout',
  'route',
  'loading',
  'error',
  'global-error',
  'not-found',
  'template',
  'default',
  'sitemap',
  'robots',
  'manifest',
  'icon',
  'apple-icon',
  'opengraph-image',
  'twitter-image',
]);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function sourceFile(file) {
  return file.startsWith(SOURCE_ROOT + path.sep) &&
    SOURCE_EXTENSIONS.has(path.extname(file));
}

const sourceFiles = walk(SOURCE_ROOT).filter(sourceFile);
const sourceSet = new Set(sourceFiles.map((file) => path.resolve(file)));

function resolveImport(fromFile, specifier) {
  let base = null;

  if (specifier.startsWith('@/')) {
    base = path.join(SOURCE_ROOT, specifier.slice(2));
  } else if (specifier.startsWith('.')) {
    base = path.resolve(path.dirname(fromFile), specifier);
  } else {
    return null;
  }

  const attempts = [
    base,
    ...[...SOURCE_EXTENSIONS].map((ext) => base + ext),
    ...[...SOURCE_EXTENSIONS].map((ext) => path.join(base, 'index' + ext)),
  ];

  for (const attempt of attempts) {
    const resolved = path.resolve(attempt);
    if (sourceSet.has(resolved)) return resolved;
  }

  return null;
}

function importsOf(file) {
  const text = fs.readFileSync(file, 'utf8');
  const specs = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) specs.add(match[1]);
  }

  return [...specs]
    .map((specifier) => resolveImport(file, specifier))
    .filter(Boolean);
}

const graph = new Map(
  sourceFiles.map((file) => [path.resolve(file), importsOf(file)]),
);

function isRuntimeRoot(file) {
  const relative = rel(file);
  const parsed = path.parse(file);

  if (
    relative === 'src/proxy.ts' ||
    relative === 'src/middleware.ts' ||
    relative === 'src/instrumentation.ts' ||
    relative === 'src/instrumentation-client.ts'
  ) {
    return true;
  }

  if (!relative.startsWith('src/app/')) return false;
  return NEXT_ROOT_BASENAMES.has(parsed.name);
}

const roots = sourceFiles.filter(isRuntimeRoot).map((file) => path.resolve(file));
const reachable = new Set();
const stack = [...roots];

while (stack.length) {
  const current = stack.pop();
  if (!current || reachable.has(current)) continue;
  reachable.add(current);
  for (const dependency of graph.get(current) ?? []) {
    if (!reachable.has(dependency)) stack.push(dependency);
  }
}

const runtimeUnreachable = sourceFiles
  .map((file) => path.resolve(file))
  .filter((file) => !reachable.has(file))
  .sort();

const referenceFiles = [
  ...walk(path.join(ROOT, 'tests')),
  ...walk(path.join(ROOT, 'scripts')),
  ...walk(path.join(ROOT, 'docs')),
  ...walk(path.join(ROOT, '.github')),
].filter((file) => {
  try {
    return fs.statSync(file).size <= 2_000_000;
  } catch {
    return false;
  }
});

const referenceTexts = referenceFiles.map((file) => {
  try {
    return [rel(file), fs.readFileSync(file, 'utf8')];
  } catch {
    return [rel(file), ''];
  }
});

function externalReferences(file) {
  const relative = rel(file);
  const fromSrc = relative.replace(/^src\//, '');
  const noExt = relative.replace(/\.[^.]+$/, '');
  const base = path.basename(file, path.extname(file));

  return referenceTexts
    .filter(([, text]) =>
      text.includes(relative) ||
      text.includes(fromSrc) ||
      text.includes(noExt) ||
      (base.length >= 10 && text.includes(base)),
    )
    .map(([fileName]) => fileName);
}

const safeDelete = [];
const review = [];

for (const file of runtimeUnreachable) {
  const refs = externalReferences(file);
  const item = {
    path: rel(file),
    bytes: fs.statSync(file).size,
    refs,
  };
  if (refs.length === 0) safeDelete.push(item);
  else review.push(item);
}

const largeFiles = sourceFiles
  .map((file) => ({ path: rel(file), bytes: fs.statSync(file).size }))
  .filter((item) => item.bytes >= 30_000)
  .sort((a, b) => b.bytes - a.bytes);

function normalizedFamily(file) {
  const parsed = path.parse(file);
  const normalized = parsed.name
    .replace(/(?:V\d+|Legacy|Prototype\d*|FinalHardening|Hardening|Polish|Canary|Unified)$/gi, '')
    .replace(/[-_.]+$/, '');
  return path.join(parsed.dir, normalized).split(path.sep).join('/');
}

const families = new Map();
for (const file of sourceFiles) {
  const key = normalizedFamily(rel(file));
  if (!families.has(key)) families.set(key, []);
  families.get(key).push(rel(file));
}

function runtimeImporters(filePath) {
  const absolute = path.resolve(ROOT, filePath);
  const importers = [];

  for (const [candidate, dependencies] of graph.entries()) {
    if (dependencies.includes(absolute)) {
      importers.push(rel(candidate));
    }
  }

  return importers.sort();
}

const versionFamilies = [...families.entries()]
  .filter(([, files]) => files.length > 1)
  .map(([family, files]) => ({
    family,
    files: files.sort().map((file) => ({
      path: file,
      bytes: fs.statSync(path.join(ROOT, file)).size,
      runtimeImporters: runtimeImporters(file),
    })),
  }))
  .sort((a, b) => a.family.localeCompare(b.family));

function printSection(title, items, render) {
  console.log('\n=== ' + title + ' (' + items.length + ') ===');
  for (const item of items) console.log(render(item));
}

console.log('VeInvite codebase cleanup audit');
console.log('Runtime roots:', roots.length);
console.log('Source files:', sourceFiles.length);
console.log('Runtime reachable:', reachable.size);
console.log('Runtime unreachable:', runtimeUnreachable.length);

printSection(
  'HIGH-CONFIDENCE UNUSED SOURCE CANDIDATES',
  safeDelete,
  (item) => item.bytes + '\t' + item.path,
);

printSection(
  'UNREACHABLE BUT REFERENCED BY TESTS/SCRIPTS/DOCS',
  review,
  (item) =>
    item.bytes + '\t' + item.path + '\t<- ' + item.refs.slice(0, 6).join(', '),
);

printSection(
  'LARGE SOURCE FILES >= 30KB',
  largeFiles,
  (item) => item.bytes + '\t' + item.path,
);

printSection(
  'VERSIONED / DUPLICATE-LOOKING FAMILIES',
  versionFamilies,
  (item) =>
    item.family +
    '\n' +
    item.files
      .map(
        (file) =>
          '  - ' +
          file.bytes +
          '\t' +
          file.path +
          '\t<- ' +
          (file.runtimeImporters.length > 0
            ? file.runtimeImporters.join(', ')
            : '(no runtime importer)'),
      )
      .join('\n'),
);

console.log('\nAudit is advisory only; it never fails CI.');
