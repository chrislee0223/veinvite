import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('the first paint and hydrated startup use one continuous VeInvite shield', async () => {
  const layout = await readFile(
    new URL('../src/app/layout.tsx', import.meta.url),
    'utf8',
  );
  const shield = await readFile(
    new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url),
    'utf8',
  );
  const walletGate = await readFile(
    new URL('../src/components/WalletSessionGate.tsx', import.meta.url),
    'utf8',
  );
  const runtime = await readFile(
    new URL('../src/components/WalletRuntimeLifecycle.tsx', import.meta.url),
    'utf8',
  );

  assert.match(layout, /<LocaleHydrationShield \/>/);
  assert.equal(layout.includes('veinvite-ssr-startup'), false);
  assert.equal(layout.includes("import { Brand }"), false);

  assert.match(shield, /className="localeHydrationShield"/);
  assert.match(shield, /position:\s*'fixed'/);
  assert.match(shield, /placeItems:\s*'center'/);
  assert.match(shield, /<Brand compact \/>/);
  assert.match(
    shield,
    /radial-gradient\(circle at 50% 38%, rgba\(244, 183, 40, 0\.1\), transparent 32%\), #080807/,
  );
  assert.equal(shield.includes('veinvite-ssr-startup'), false);

  assert.match(
    walletGate,
    /data-veinvite-wallet-session-gate="interactive"/,
  );
  assert.match(
    shield,
    /data-veinvite-wallet-session-gate=\\"interactive\\"/,
  );
  assert.match(
    runtime,
    /data-veinvite-wallet-session-gate=\\"interactive\\"/,
  );

  assert.equal(
    /querySelector\(\s*'\[aria-live="polite"\]'/s.test(shield),
    false,
  );
  assert.equal(
    /querySelector\(\s*'\[aria-live="polite"\]'/s.test(runtime),
    false,
  );
});
