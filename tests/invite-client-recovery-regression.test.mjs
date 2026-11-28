import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');
test('both invite routes recover expired wallet sessions before parsing claim results', () => {
  for (const name of ['InviteeClient','PermanentReferralClient']) {
    const source = read('src/components/'+name+'.tsx');
    const recovery = source.indexOf('if (response.status === 401)');
    assert.ok(recovery > 0);
    const block = source.slice(recovery, source.indexOf('let data:', recovery));
    assert.match(block, /failureCode: 'wallet_auth'/);
    assert.match(block, /setStep\('wallet'\)/);
    assert.match(block, /requestInviteWalletSessionRecovery\(\)/);
    assert.match(block, /return;/);
  }
  assert.match(read('src/lib/inviteClientRecovery.ts'), /veinvite-wallet-session-invalid/);
});
test('permanent referral success presents the existing mission sequence', () => {
  const source = read('src/components/PermanentReferralClient.tsx');
  assert.match(source, /className="missionSummary"[\s\S]*?t\.walletMission[\s\S]*?t\.appMission[\s\S]*?t\.conversionMission[\s\S]*?t\.voteMission[\s\S]*?onClick=\{continueToMissions\}/);
});
test('wallet rejection code is restricted to the signing stage', () => {
  const source = read('src/hooks/useWalletAuthentication.ts');
  assert.match(source, /stage === 'AUTH_WALLET_SIGNATURE' && error !== null[\s\S]*?error\.code === 4001/);
  assert.match(source, /isCancelledAuthentication\(error, failureStage\)/);
});
