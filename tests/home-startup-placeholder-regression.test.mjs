import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveStartupReadiness,
} from '../src/lib/homeStartupReadiness.ts';

const WALLET =
  '0x1111111111111111111111111111111111111111';

function decide({ status, invitesReady, referralLinkReady }) {
  return resolveStartupReadiness({
    walletAddress: WALLET,
    homeState: {
      status,
      walletAddress: WALLET,
      invitesReady,
      referralLinkReady,
    },
    hasBootstrappedSession: true,
    hasPersistedWallet: true,
    interactiveGateVisible: false,
    // This used to let first-load Home placeholders through. Keep the legacy
    // hint in the call so this regression test proves it is non-authoritative.
    allowHomeDataHydration: true,
  });
}

test('first wallet Home never reveals the —/2 placeholder while invite data is loading', () => {
  assert.equal(
    decide({
      status: 'loading',
      invitesReady: false,
      referralLinkReady: false,
    }),
    'hold',
  );

  assert.equal(
    decide({
      status: 'loading',
      invitesReady: false,
      referralLinkReady: true,
    }),
    'hold',
  );

  assert.equal(
    decide({
      status: 'loading',
      invitesReady: true,
      referralLinkReady: false,
    }),
    'hold',
  );
});

test('wallet Home reveals only after the real invite list and referral link are ready', () => {
  assert.equal(
    decide({
      status: 'ready',
      invitesReady: true,
      referralLinkReady: true,
    }),
    'release',
  );
});
