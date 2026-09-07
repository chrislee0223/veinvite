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

async function readTrackedLines(filePath) {
  return (await readFile(filePath, 'utf8'))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

const manifest = await readTrackedLines(manifestPath);
const historicalLock = await readTrackedLines(historicalLockPath);
const baselineLines = await readTrackedLines(productionBaselinePath);

if (baselineLines.length !== 1 || !/^\d{14}$/u.test(baselineLines[0])) {
  throw new Error(
    'Production migration baseline must contain exactly one 14-digit version.',
  );
}

const productionBaseline = baselineLines[0];
const migrationFiles = (await readdir(migrationDir))
  .filter((name) => name.endsWith('.sql'))
  .sort();

function versionOf(filename) {
  const match = /^(\d{14})_.+\.sql$/u.exec(filename);

  if (!match) {
    throw new Error(`Invalid migration filename: ${filename}`);
  }

  return match[1];
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

assertUniqueAndSorted('Production migration manifest', manifest);
assertUniqueAndSorted('Historical migration lock', historicalLock);

const manifestSet = new Set(manifest);
const historicalLockSet = new Set(historicalLock);
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
for (const filename of migrationFiles) {
  const version = versionOf(filename);
  const prior = versions.get(version);

  if (prior) {
    throw new Error(
      `Duplicate migration version ${version}: ${prior}, ${filename}`,
    );
  }

  versions.set(version, filename);
}

const lockedBeyondBaseline = historicalEntries.filter(
  (filename) => versionOf(filename) > productionBaseline,
);
if (lockedBeyondBaseline.length > 0) {
  throw new Error(
    'Historical migration lock contains versions newer than the recorded ' +
      `Production baseline ${productionBaseline}:\n${lockedBeyondBaseline.join('\n')}`,
  );
}

const latestLockedVersion = historicalEntries
  .map(versionOf)
  .sort()
  .at(-1);
if (latestLockedVersion !== productionBaseline) {
  throw new Error(
    `Production baseline ${productionBaseline} is not represented by the ` +
      `latest locked migration ${latestLockedVersion ?? 'none'}.`,
  );
}

const unexpectedHistorical = migrationFiles.filter((filename) => {
  return (
    !historicalSet.has(filename) &&
    versionOf(filename) <= productionBaseline
  );
});

if (unexpectedHistorical.length > 0) {
  throw new Error(
    'Repository contains unclassified historical migration filenames at or ' +
      `before Production baseline ${productionBaseline}:\n` +
      unexpectedHistorical.join('\n'),
  );
}

const futureMigrations = migrationFiles.filter(
  (filename) => versionOf(filename) > productionBaseline,
);

console.log(
  `Migration history OK: ${manifest.length} Production manifest migrations and ` +
    `${historicalLock.length} explicitly locked historical variants are present; ` +
    `Production baseline is ${productionBaseline}; ` +
    `${futureMigrations.length} future migration(s) are allowed.`,
);
