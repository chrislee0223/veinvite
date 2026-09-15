import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveStartupReadiness,
} from '../src/lib/homeStartupReadiness.ts';

const WALLET =
  '0x1111111111111111111111111111111111111111';

function decide({
  status,
  invitesReady,
  referralLinkReady,
  hasBootstrappedSession = true,
}) {
  return resolveStartupReadiness({
    walletAddress: WALLET,
    homeState: {
      status,
      walletAddress: WALLET,
      invitesReady,
      referralLinkReady,
    },
    hasBootstrappedSession,
    hasPersistedWallet: true,
    interactiveGateVisible: false,
    allowHomeDataHydration: true,
  });
}

test('verified reload may reveal stable Home placeholders while wallet data hydrates', () => {
  for (const [invitesReady, referralLinkReady] of [
    [false, false],
    [false, true],
    [true, false],
  ]) {
    assert.equal(
      decide({
        status: 'loading',
        invitesReady,
        referralLinkReady,
      }),
      'release',
    );
  }
});

test('a wallet without a server bootstrap remains covered while data is partial', () => {
  assert.equal(
    decide({
      status: 'loading',
      invitesReady: false,
      referralLinkReady: false,
      hasBootstrappedSession: false,
    }),
    'hold',
  );
});

test('wallet Home reveals normally after the real invite list and referral link are ready', () => {
  assert.equal(
    decide({
      status: 'ready',
      invitesReady: true,
      referralLinkReady: true,
    }),
    'release',
  );
});
