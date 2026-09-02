import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');

test('expanded locale packs register before global copy hardening', () => {
  const source = read('src/components/AppProviders.tsx');
  const expanded = source.indexOf("import '@/lib/i18n/localePacks/registerExpandedLocales';");
  const primary = source.indexOf("import '@/lib/i18n/copyHardening';");
  const secondary = source.indexOf("import '@/lib/i18n/secondaryPageCopyHardening';");

  assert.notEqual(expanded, -1, 'expanded locale registration must remain mounted');
  assert.notEqual(primary, -1, 'primary copy hardening must remain mounted');
  assert.notEqual(secondary, -1, 'secondary copy hardening must remain mounted');
  assert.ok(
    expanded < primary && expanded < secondary,
    'all locale dictionaries must exist before global hardening side effects run',
  );
});

test('dictionary-wide rejection hardening remains compatible with expanded locales', () => {
  const source = read('src/lib/i18n/copyHardening.ts');

  assert.match(
    source,
    /Object\.keys\(ENTRY_REJECTION_COPY\)/,
    'rejection hardening should continue iterating every registered locale dictionary',
  );
  assert.match(
    source,
    /INVITEE_COPY\[locale\]\.errors\.existing\s*=\s*rejection\.title/,
    'registered locale rejection copy must continue feeding the invitee error surface',
  );
});
