import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('the first paint and hydrated startup use one continuous VeInvite shield', async () => {
  const layout = await readFile(
    new URL('../src/app/layout.tsx', import.meta.url),
    'utf8',
  );
  const page = await readFile(
    new URL('../src/app/page.tsx', import.meta.url),
    'utf8',
  );
  const providers = await readFile(
    new URL('../src/components/AppProviders.tsx', import.meta.url),
    'utf8',
  );
  const shield = await readFile(
    new URL('../src/components/LocaleHydrationShield.tsx', import.meta.url),
    'utf8',
  );
  const switchShield = await readFile(
    new URL(
      '../src/components/WalletSessionTransitionShield.tsx',
      import.meta.url,
    ),
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
    page,
    /data-veinvite-session-wallet=/,
  );
  assert.match(
    providers,
    /<WalletSessionTransitionShield \/>/,
  );
  assert.match(
    switchShield,
    /data-veinvite-wallet-switch-shield="true"/,
  );
  assert.match(
    switchShield,
    /WALLET_SWITCH_SHIELD_MAX_MS\s*=\s*5_000/,
  );
  assert.match(
    switchShield,
    /veinvite-wallet-session-ready/,
  );
  assert.match(
    switchShield,
    /veinvite-wallet-session-cleared/,
  );
  assert.match(switchShield, /<Brand compact \/>/);

  assert.match(
    walletGate,
    /data-veinvite-wallet-session-gate="interactive"/,
  );
  assert.match(
    shield,
    /data-veinvite-wallet-session-gate="interactive"/,
  );
  assert.match(
    runtime,
    /data-veinvite-wallet-session-gate="interactive"/,
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
