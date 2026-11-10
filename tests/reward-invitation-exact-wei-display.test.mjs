import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseExactRewardCsv } from '../src/lib/rewards/exactRewardCsv.ts';
const hugeWei = '1459280125541217311130';
const bonusWei = '10000000000000000000';

test('large Wei survives exact CSV transport without JSON number rounding', () => {
  const parsed = parseExactRewardCsv(
    'invite_code,reserved_amount_wei\nVD3A4SR,' + hugeWei + '\nOTHER01,',
    ['invite_code', 'reserved_amount_wei'],
  );
  assert.equal(parsed.get('VD3A4SR')?.reserved_amount_wei, hugeWei);
  assert.equal(parsed.get('OTHER01')?.reserved_amount_wei, null);
  assert.notEqual(String(Number(hugeWei)), hugeWei);
});

test('full reservation and separate 10 B3TR bonus remain exact', () => {
  const parsed = parseExactRewardCsv(
    [
      '"invite_code","reservation_amount_wei","base_amount_wei","promotion_amount_wei"',
      'VD3A4SR,' + hugeWei + ',' + hugeWei + ',' + bonusWei,
    ].join('\r\n'),
    ['invite_code','reservation_amount_wei','base_amount_wei','promotion_amount_wei'],
  );
  assert.equal(parsed.get('VD3A4SR')?.base_amount_wei, hugeWei);
  assert.equal(parsed.get('VD3A4SR')?.promotion_amount_wei, bonusWei);
});

test('broken CSV and malformed numbers reject rather than round', () => {
  for (const data of [
    'invite_code,reserved_amount_wei\nA,1e+21',
    'invite_code,reserved_amount_wei\nA,1.5',
    'invite_code,reserved_amount_wei\nA,-1',
    'invite_code,reserved_amount_wei\nA,1\nA,2',
    'invite_code,other_amount\nA,1',
    'invite_code,reserved_amount_wei\nA,1,2',
  ]) {
    assert.throws(() => parseExactRewardCsv(
      data, ['invite_code','reserved_amount_wei'],
    ));
  }
});

test('a display-only split mismatch cannot take down all invites or bypass wallet auth', async () => {
  const route = await readFile(
    new URL('../src/app/api/invites/route.ts', import.meta.url), 'utf8',
  );
  const auth = await readFile(
    new URL('../src/app/api/auth/verify/route.ts', import.meta.url), 'utf8',
  );
  assert.match(route, /await requireWalletSession\(\{ request, expectedWallet: normalized \}\)/);
  assert.match(route, /parseExactRewardCsv/);
  assert.match(route, /\.csv\(\)/);
  assert.match(route, /claimAmountWei = null;\s*promotionAmountWei = null;/);
  assert.doesNotMatch(route, /Invalid LIVE X promotion split for/);
  assert.match(auth, /verifyVeWorldCertificate\(/);
  assert.match(auth, /issue_wallet_session_after_verified_challenge/);
});
