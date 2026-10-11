import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [client, permanentStatus, claim, sessionGate, verifier] = await Promise.all([
  readFile(new URL('../src/components/PermanentReferralClient.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/referral-links/[key]/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/referral-links/[key]/claim/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/WalletSessionGate.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/walletCertificateVerification.ts', import.meta.url), 'utf8'),
]);

test('public permanent-link validation retries a 404 once before showing unavailable', () => {
  assert.match(client, /const readStatus = async \(\) => \{/);
  assert.match(client, /let \{ response, data \} = await readStatus\(\);[\s\S]*if \(response\.status === 404 \|\| data\.outcome === 'invalid_link'\) \{\s*\(\{ response, data \} = await readStatus\(\)\);\s*\}/);
  assert.match(client, /if \(response\.status === 404 \|\| data\.outcome === 'invalid_link'\) \{\s*setErrorCode\('invalidLink'\)/);
  assert.match(permanentStatus, /\.eq\('status', 'ACTIVE'\)/);
  assert.match(permanentStatus, /\{ outcome: 'available' \}/);
  assert.doesNotMatch(permanentStatus, /expires_at|\.eq\('invitee_wallet'/);
});

test('a lost claim session reopens the existing verified wallet gate before eligibility', () => {
  const unauthorizedAt = client.indexOf("if (response.status === 401) {");
  const bodyAt = client.indexOf("let data: ClaimResponse;");
  assert.ok(unauthorizedAt >= 0 && unauthorizedAt < bodyAt);
  const recovery = client.slice(unauthorizedAt, bodyAt);
  assert.match(recovery, /failureCode: 'wallet_auth'/);
  assert.match(recovery, /setStep\('wallet'\)/);
  assert.match(recovery, /new Event\('veinvite-wallet-session-invalid'\)/);
  assert.match(sessionGate, /window\.addEventListener\(\s*WALLET_SESSION_INVALID_EVENT,\s*handleInvalidWalletSession/);
  assert.match(sessionGate, /const handleInvalidWalletSession = \(\) => \{[\s\S]*void verify\(\);/);
});

test('temporary link/server failures are not mislabeled as wallet eligibility failures', () => {
  const start = client.indexOf('const validateLink = useCallback(async () => {');
  const end = client.indexOf('}, [previewMode, referralKey]);', start);
  assert.ok(start >= 0 && end > start);
  const validation = client.slice(start, end);
  assert.match(validation, /setErrorCode\('linkCheck'\)/);
  assert.doesNotMatch(validation, /setErrorCode\('eligibility'\)/);
  assert.match(client, /errorCode === 'linkCheck'[\s\S]*t\.tryAgain/);
});

test('expired/unavailable link screens always provide a recheck action', () => {
  assert.match(client, /errorCode === 'full' \|\| errorCode === 'eligibility' \|\| errorCode === 'invalidLink' \|\| errorCode === 'linkCheck'/);
  assert.match(client, /onClick=\{\(\) => void validateLink\(\)\}/);
});

test('security and referral business rules remain mandatory', () => {
  assert.match(claim, /await requireWalletSession\(\{ request, expectedWallet: inviteeAddress \}\)/);
  assert.match(claim, /anyActiveSybilV2Restriction/);
  assert.match(claim, /checkVeBetterEntryEligibility/);
  assert.match(claim, /claim_permanent_referral_with_entry_proof/);
  assert.match(verifier, /Certificate\.of\(\{[\s\S]*\}\)\.verify\(\)/);
});
