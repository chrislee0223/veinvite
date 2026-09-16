import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const manifestPath = path.join(
  root,
  'supabase',
  'production-migration-manifest.txt',
);
const historicalLockPath = path.join(
  root,
  'supabase',
  'historical-migration-lock.txt',
);
const productionBaselinePath = path.join(
  root,
  'supabase',
  'production-migration-baseline.txt',
);
const productionObservedPath = path.join(
  root,
  'supabase',
  'production-migration-observed.txt',
);

async function readTrackedLines(filePath) {
  return (await readFile(filePath, 'utf8'))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

const manifest = await readTrackedLines(manifestPath);
const historicalLock = await readTrackedLines(historicalLockPath);
const baselineLines = await readTrackedLines(productionBaselinePath);
const observedLines = await readTrackedLines(productionObservedPath);

if (baselineLines.length !== 1 || !/^\d{14}$/u.test(baselineLines[0])) {
  throw new Error(
    'Production migration baseline must contain exactly one 14-digit version.',
  );
}

const productionBaseline = baselineLines[0];
const migrationFiles = (await readdir(migrationDir))
  .filter((name) => name.endsWith('.sql'))
  .sort();

function parseFilename(filename) {
  const match = /^(\d{14})_(.+)\.sql$/u.exec(filename);

  if (!match) {
    throw new Error(`Invalid migration filename: ${filename}`);
  }

  return { version: match[1], name: match[2] };
}

function versionOf(filename) {
  return parseFilename(filename).version;
}

function assertUniqueAndSorted(label, entries) {
  if (new Set(entries).size !== entries.length) {
    throw new Error(`${label} contains duplicate filenames.`);
  }

  const sorted = [...entries].sort();
  if (sorted.some((name, index) => name !== entries[index])) {
    throw new Error(`${label} must remain sorted by filename.`);
  }
}

function parseObserved(line) {
  const match = /^(\d{14})\s+([a-z0-9_]+)$/u.exec(line);

  if (!match) {
    throw new Error(
      `Invalid Production observed migration entry: ${line}. Expected "<14-digit version> <migration_name>".`,
    );
  }

  return { version: match[1], name: match[2], line };
}

assertUniqueAndSorted('Production migration manifest', manifest);
assertUniqueAndSorted('Historical migration lock', historicalLock);

const manifestSet = new Set(manifest);
const overlap = historicalLock.filter((name) => manifestSet.has(name));
if (overlap.length > 0) {
  throw new Error(
    'Historical migration lock must not duplicate Production manifest entries:\n' +
      overlap.join('\n'),
  );
}

const historicalEntries = [...manifest, ...historicalLock];
const historicalSet = new Set(historicalEntries);
const fileSet = new Set(migrationFiles);
const missing = historicalEntries.filter((name) => !fileSet.has(name));
if (missing.length > 0) {
  throw new Error(
    `Repository is missing locked historical migrations:\n${missing.join('\n')}`,
  );
}

const versions = new Map();
const filesByMigrationName = new Map();
for (const filename of migrationFiles) {
  const { version, name } = parseFilename(filename);
  const prior = versions.get(version);

  if (prior) {
    throw new Error(
      `Duplicate migration version ${version}: ${prior}, ${filename}`,
    );
  }

  versions.set(version, filename);
  const matchingFiles = filesByMigrationName.get(name) ?? [];
  matchingFiles.push(filename);
  filesByMigrationName.set(name, matchingFiles);
}

const latestLockedVersion = historicalEntries
  .map(versionOf)
  .sort()
  .at(-1);

if (!latestLockedVersion) {
  throw new Error('Historical migration manifest is empty.');
}

const observed = observedLines.map(parseObserved);
const observedVersions = observed.map(({ version }) => version);
const observedNames = observed.map(({ name }) => name);

if (new Set(observedVersions).size !== observedVersions.length) {
  throw new Error('Production observed migrations contain duplicate versions.');
}
if (new Set(observedNames).size !== observedNames.length) {
  throw new Error('Production observed migrations contain duplicate names.');
}
if (
  [...observedVersions].sort().some(
    (version, index) => version !== observedVersions[index],
  )
) {
  throw new Error('Production observed migrations must be sorted by applied version.');
}
if (observed.some(({ version }) => version <= latestLockedVersion)) {
  throw new Error(
    `Production observed migrations must all be newer than the locked legacy cutoff ${latestLockedVersion}.`,
  );
}

const latestObservedVersion = observedVersions.at(-1);
if (latestObservedVersion !== productionBaseline) {
  throw new Error(
    `Production baseline ${productionBaseline} does not match the latest verified Production migration ${latestObservedVersion ?? 'none'}.`,
  );
}

const observedRepoFiles = new Map();
for (const record of observed) {
  const matchingFiles = filesByMigrationName.get(record.name) ?? [];

  if (matchingFiles.length === 0) {
    throw new Error(
      `Production migration ${record.version} ${record.name} has no matching repository migration file.`,
    );
  }
  if (matchingFiles.length > 1) {
    throw new Error(
      `Production migration ${record.version} ${record.name} matches multiple repository files:\n${matchingFiles.join('\n')}`,
    );
  }

  observedRepoFiles.set(record.name, matchingFiles[0]);
}

const appliedRepoFiles = new Set([
  ...historicalEntries,
  ...observedRepoFiles.values(),
]);

const unclassifiedAtOrBeforeBaseline = migrationFiles.filter((filename) => {
  return (
    !appliedRepoFiles.has(filename) &&
    versionOf(filename) <= productionBaseline
  );
});

if (unclassifiedAtOrBeforeBaseline.length > 0) {
  throw new Error(
    'Repository contains migration files at or before the Production baseline ' +
      `${productionBaseline} that are not verified as applied in Production:\n` +
      unclassifiedAtOrBeforeBaseline.join('\n'),
  );
}

const futureMigrations = migrationFiles.filter(
  (filename) =>
    !appliedRepoFiles.has(filename) && versionOf(filename) > productionBaseline,
);

if (futureMigrations.length > 0) {
  throw new Error(
    'Repository contains migrations that are not in the verified Production migration snapshot. ' +
      'Apply and verify the Production migration before merging code that depends on it, then advance ' +
      'production-migration-observed.txt and production-migration-baseline.txt:\n' +
      futureMigrations.join('\n'),
  );
}

console.log(
  `Migration history OK: ${manifest.length} legacy manifest migrations, ` +
    `${historicalLock.length} locked historical variants, and ` +
    `${observed.length} post-cutoff Production migrations are verified; ` +
    `Production baseline is ${productionBaseline}; no unverified migrations remain.`,
);
