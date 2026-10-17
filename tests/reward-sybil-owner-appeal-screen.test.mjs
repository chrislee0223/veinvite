import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const gate = await readFile('src/components/WalletSessionGate.tsx', 'utf8');
const form = await readFile('src/components/SybilAppealForm.tsx', 'utf8');
const route = await readFile('src/app/api/sybil/appeal/route.ts', 'utf8');
const copy = await readFile('src/lib/i18n/sybilAppealCopy.ts', 'utf8');

test('only verified HOLD and BLACKLIST restriction surfaces show the appeal UI', () => {
  assert.match(gate, /state === 'verified' &&\s*verifiedWallet === walletAddress &&\s*restrictionKind/u);
  assert.match(gate, /restrictionKind === 'PRE_CLAIM_HOLD' \|\| permanent/u);
  assert.match(gate, /<SybilAppealForm\s+key=\{walletAddress \+ restrictionKind\}/u);
  assert.match(gate, /walletAddress=\{walletAddress\}/u);
  assert.match(gate, /const permanent = restrictionKind === 'BLACKLIST'/u);
});

test('wallet-switch and unmount abort stale pending appeal responses', () => {
  assert.match(form, /const pending = useRef<AbortController \| null>\(null\)/u);
  assert.match(form, /pending\.current\?\.abort\(\)/u);
  assert.match(form, /if \(controller\.signal\.aborted\) return/u);
  assert.match(form, /x-veinvite-session-wallet': walletAddress/u);
  assert.match(route, /expectedWallet !== session\.walletAddress/u);
});

test('submitting an appeal requires explicit review-only response, never clearance', () => {
  assert.match(form, /data-veinvite-sybil-appeal="review-only"/u);
  assert.match(form, /x-veinvite-appeal-intent': 'REQUEST_SYBIL_REVIEW'/u);
  assert.match(form, /cache: 'no-store'/u);
  assert.match(form, /credentials: 'same-origin'/u);
  assert.match(form, /reviewOnly === true/u);
  assert.match(form, /restrictionUnchanged === true/u);
  assert.match(form, /rewardUnchanged === true/u);
  assert.match(route, /getWalletSession\(request\)/u);
  assert.doesNotMatch(form, /claimReward|createInvitation|sendTransaction|writeContract|reserveReward|reinstateSybil/u);
});

test('client validation and messaging avoid secrets and duplicate submissions', () => {
  assert.match(form, /explanation\.trim\(\)\.length < 25/u);
  assert.match(form, /explanation\.trim\(\)\.length > 600/u);
  assert.match(form, /setState\('sending'\)/u);
  assert.match(form, /state === 'duplicate'/u);
  assert.match(copy, /Do not share private keys/u);
  assert.match(copy, /개인키/u);
  assert.match(copy, /translations: Partial<Record<SupportedLocale/u);
});
