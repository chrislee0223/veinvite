import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('the very first server paint is already the VeInvite loading surface', async () => {
  const layout = await readFile(
    new URL('../src/app/layout.tsx', import.meta.url),
    'utf8',
  );
  const shield = await readFile(
    new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url),
    'utf8',
  );

  assert.match(layout, /id="veinvite-ssr-startup"/);
  assert.match(layout, /zIndex:\s*10000/);
  assert.match(layout, /placeItems:\s*'center'/);
  assert.match(layout, /<Brand compact \/>/);
  assert.match(
    layout,
    /radial-gradient\(circle at 50% 38%, rgba\(244, 183, 40, 0\.1\), transparent 32%\), #080807/,
  );

  assert.match(
    shield,
    /document\.getElementById\('veinvite-ssr-startup'\)\?\.remove\(\)/,
  );
  assert.match(
    shield,
    /radial-gradient\(circle at 50% 38%, rgba\(244, 183, 40, 0\.1\), transparent 32%\), #080807/,
  );
});
