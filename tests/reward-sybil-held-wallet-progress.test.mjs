import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  readOwnHeldProgress,
} from '../src/lib/sybil/v2/holdProgressPolicy.ts';

const route = await readFile(
  'src/app/api/sybil/hold-progress/route.ts',
  'utf8',
);
const OWNER = '0x' + 'a'.repeat(40);
const OTHER = '0x' + 'b'.repeat(40);

const held = {
  restrictionKind: 'PRE_CLAIM_HOLD',
  activeHoldInviteCode: 'HG745PQ',
  invitationInviteCode: 'HG745PQ',
  inviteeWallet: OWNER,
  verifiedWallet: OWNER,
  networkMatches: true,
  assessmentState: 'HOLD',
  appsCompleted: 0,
  rewardsReceived: 0,
  vot3Converted: false,
  voteCompleted: false,
};

test('only the verified invitee may read own unfinished PRE_CLAIM_HOLD progress', () => {
  assert.deepEqual(readOwnHeldProgress(held), {
    reviewPending: true,
    rewardBlocked: true,
    missionProgress: {
      appsCompleted: 0,
      rewardsReceived: 0,
      vot3Converted: false,
      voteCompleted: false,
    },
  });
  assert.equal(readOwnHeldProgress({ ...held, verifiedWallet: OTHER }), null);
  assert.equal(readOwnHeldProgress({ ...held, inviteeWallet: OTHER }), null);
  assert.equal(readOwnHeldProgress({ ...held, activeHoldInviteCode: 'ABCDEFG' }), null);
  assert.equal(readOwnHeldProgress({ ...held, networkMatches: false }), null);
  assert.equal(readOwnHeldProgress({ ...held, assessmentState: 'CLEAR' }), null);
});

test('active blacklist, inviter review, post-payout and no restriction fail closed', () => {
  for (const kind of ['BLACKLIST', 'INVITER_ESCALATION_HOLD', 'POST_PAYOUT_HOLD', null]) {
    assert.equal(readOwnHeldProgress({ ...held, restrictionKind: kind }), null);
  }
});

test('invalid, missing and non-final mission evidence fails closed', () => {
  assert.equal(readOwnHeldProgress({ ...held, appsCompleted: null }), null);
  assert.equal(readOwnHeldProgress({ ...held, rewardsReceived: -1 }), null);
  assert.equal(readOwnHeldProgress({ ...held, appsCompleted: 4 }), null);
  assert.equal(readOwnHeldProgress({ ...held, voteCompleted: null }), null);
  assert.equal(readOwnHeldProgress({ ...held, vot3Converted: 'true' }), null);
});

test('authenticated read-only endpoint always retains backend restrictions', () => {
  assert.match(route, /getWalletSession\(request\)/u);
  assert.match(route, /enforceRateLimits/u);
  assert.match(route, /sybil_hold_progress_ip/u);
  assert.match(route, /sybil_hold_progress_wallet/u);
  assert.match(route, /loadActiveSybilV2Restriction/u);
  assert.match(route, /restriction_kind !== 'PRE_CLAIM_HOLD'/u);
  assert.match(route, /\.eq\('invitee_wallet', session\.walletAddress\)/u);
  assert.match(route, /\.eq\('activation_network', network\)/u);
  assert.match(route, /\.eq\('network', network\)/u);
  assert.match(route, /assessment\.data\?\.state/u);
  assert.match(route, /readOwnHeldProgress/u);
  assert.match(route, /const finalRestriction = await loadActiveSybilV2Restriction/u);
  assert.match(route, /progressAvailable: false/u);
  assert.match(route, /Cache-Control': 'private, no-store, max-age=0'/u);
  assert.doesNotMatch(route, /\.rpc\(/u);
  assert.doesNotMatch(route, /\.update\(|\.insert\(|\.delete\(/u);
});

test('responses never return wallet addresses, case codes, detector evidence or sensitive metadata', () => {
  assert.doesNotMatch(route, /return result\(\{[^}]*inviteCode/iu);
  assert.doesNotMatch(route, /return result\(\{[^}]*walletAddress/iu);
  assert.doesNotMatch(route, /return result\(\{[^}]*reason_codes/iu);
  assert.doesNotMatch(route, /return result\(\{[^}]*evidence_summary/iu);
  assert.equal(Object.hasOwn(readOwnHeldProgress(held), 'rewardAllowed'), false);
  assert.equal(Object.hasOwn(readOwnHeldProgress(held), 'inviteAllowed'), false);
});
