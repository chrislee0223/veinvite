import { execFileSync } from 'node:child_process';
import { readFile, unlink, writeFile } from 'node:fs/promises';

const networkPath = 'src/components/AppNetwork.tsx';
const tempScriptPath = 'scripts/.network-finalize-original.mjs';
const needle = `    setSelectedGroupId(null);\n    setEditingLayout(false);`;
const marked = `    setSelectedGroupId(null);\n    // network-finalizer-disambiguation\n    setEditingLayout(false);`;

let source = await readFile(networkPath, 'utf8');
const parts = source.split(needle);
if (parts.length - 1 !== 3) {
  throw new Error(`expected 3 layout-reset matches before finalization, found ${parts.length - 1}`);
}

// Preserve the first occurrence (wallet reset), which is the target of the
// original guarded patch. Temporarily disambiguate the two later resets.
source = parts[0] + needle + parts[1] + marked + parts[2] + marked + parts[3];
await writeFile(networkPath, source);

const original = execFileSync(
  'git',
  ['show', 'HEAD^:scripts/network-finalize-pass1.mjs'],
  { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
);
await writeFile(tempScriptPath, original);

try {
  await import(new URL('./.network-finalize-original.mjs', import.meta.url));

  let finalized = await readFile(networkPath, 'utf8');
  const markerCount = finalized.split(marked).length - 1;
  if (markerCount !== 2) {
    throw new Error(`expected 2 temporary disambiguation markers after finalization, found ${markerCount}`);
  }
  finalized = finalized.split(marked).join(needle);
  await writeFile(networkPath, finalized);
} finally {
  await unlink(tempScriptPath).catch(() => undefined);
}
