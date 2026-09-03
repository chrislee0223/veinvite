import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [locales, terminology, providers, transientCopy] = await Promise.all([
  read('src/lib/i18n/locales.ts'),
  read('src/lib/i18n/terminologyHardening.ts'),
  read('src/components/AppProviders.tsx'),
  read('src/lib/i18n/transientCopyHardening.ts'),
]);

const localeCodes = [...locales.matchAll(/\{ locale: '([^']+)'/g)].map((match) => match[1]);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('terminology policy covers every supported locale', () => {
  assert.equal(localeCodes.length, 27);

  for (const locale of localeCodes) {
    const escaped = escapeRegex(locale);
    assert.match(
      terminology,
      new RegExp(`(?:^|\\n)\\s*(?:${escaped}|'${escaped}'):\\s*\\{`),
      `missing terminology policy for ${locale}`,
    );
  }
});

test('only the five agreed product and protocol names are fixed across locales', () => {
  assert.match(
    terminology,
    /Only VeChain, B3TR, VOT3, VeBetterDAO and VeInvite are fixed product\//,
  );

  for (const brand of ['VeChain', 'B3TR', 'VOT3', 'VeBetterDAO', 'VeInvite']) {
    assert.match(terminology, new RegExp(`'${brand}'`));
  }

  assert.doesNotMatch(
    transientCopy,
    /Allocation Voting, dApp, VeChain Explorer\) intentionally remain unchanged/,
  );
});

test('generic product jargon is localized by the last-mile pass', () => {
  assert.match(terminology, /VeChain Explorer\/gi/);
  assert.match(terminology, /Allocation\(\?:-\| \)Voting\/gi/);
  assert.match(terminology, /\\bdApps\\b\/gi/);
  assert.match(terminology, /\\bdApp\\b\/gi/);
  assert.match(terminology, /on-chain\/gi/);
  assert.match(terminology, /\\bWallets\\b\/g/);
  assert.match(terminology, /\\bwallet\\b\/g/);

  assert.match(terminology, /allocationVoting: '배분 투표'/);
  assert.match(terminology, /dapp: '앱'/);
  assert.match(terminology, /vechainExplorer: 'VeChain 탐색기'/);
  assert.match(terminology, /wallet: '지갑'/);

  assert.match(terminology, /allocationVoting: '分配投票'/);
  assert.match(terminology, /allocationVoting: 'votación de asignación'/);
  assert.match(terminology, /allocationVoting: 'تصويت التخصيص'/);
  assert.match(terminology, /allocationVoting: 'bỏ phiếu phân bổ'/);
  assert.match(terminology, /allocationVoting: 'upigaji kura wa mgao'/);
});

test('canonical brand spelling is normalized after generic terminology', () => {
  assert.match(terminology, /\\bvechain\\b\/gi, 'VeChain'/);
  assert.match(terminology, /\\bb3tr\\b\/gi, 'B3TR'/);
  assert.match(terminology, /\\bvot3\\b\/gi, 'VOT3'/);
  assert.match(terminology, /\\bvebetterdao\\b\/gi, 'VeBetterDAO'/);
  assert.match(terminology, /\\bveinvite\\b\/gi, 'VeInvite'/);
});

test('terminology hardening runs after locale registration and targeted copy overrides', () => {
  const registration = providers.indexOf("localePacks/registerExpandedLocales");
  const baseHardening = providers.indexOf("i18n/copyHardening");
  const secondaryHardening = providers.indexOf("i18n/secondaryPageCopyHardening");
  const transientHardening = providers.indexOf("i18n/transientCopyHardening");
  const terminologyHardening = providers.indexOf("i18n/terminologyHardening");

  assert.ok(registration >= 0);
  assert.ok(baseHardening > registration);
  assert.ok(secondaryHardening > baseHardening);
  assert.ok(transientHardening > secondaryHardening);
  assert.ok(terminologyHardening > transientHardening);
});
