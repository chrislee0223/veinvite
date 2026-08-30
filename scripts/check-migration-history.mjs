import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const migrationDir = path.join(root, 'supabase', 'migrations');
const manifestPath = path.join(
  root,
  'supabase',
  'production-migration-manifest.txt',
);

const manifest = (await readFile(manifestPath, 'utf8'))
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean);

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

const manifestSet = new Set(manifest);
const fileSet = new Set(migrationFiles);

if (manifestSet.size !== manifest.length) {
  throw new Error('Production migration manifest contains duplicate filenames.');
}

const sortedManifest = [...manifest].sort();
if (sortedManifest.some((name, index) => name !== manifest[index])) {
  throw new Error('Production migration manifest must remain sorted by filename.');
}

const missing = manifest.filter((name) => !fileSet.has(name));
if (missing.length > 0) {
  throw new Error(
    `Repository is missing Production migrations:\n${missing.join('\n')}`,
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

const latestProductionVersion = versionOf(manifest.at(-1));
const unexpectedHistorical = migrationFiles.filter((filename) => {
  return (
    !manifestSet.has(filename) &&
    versionOf(filename) <= latestProductionVersion
  );
});

if (unexpectedHistorical.length > 0) {
  throw new Error(
    'Repository contains historical migration filenames that are not in the ' +
      `Production manifest:\n${unexpectedHistorical.join('\n')}`,
  );
}

console.log(
  `Migration history OK: ${manifest.length} Production migrations are present; ` +
    `${migrationFiles.length - manifest.length} future migration(s) are allowed.`,
);
