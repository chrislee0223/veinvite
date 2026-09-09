import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [ownerApi, publicApi, claimApi, permanentPage, permanentClient] = await Promise.all([
  readFile(new URL('../src/app/api/referral-links/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/referral-links/[key]/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/referral-links/[key]/claim/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/r/[key]/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/PermanentReferralClient.tsx', import.meta.url), 'utf8'),
]);

test('existing permanent referral keys are returned unchanged before any new key is generated', () => {
  assert.match(ownerApi, /const \[existing, slotsAvailable\][\s\S]*if \(existing\)[\s\S]*responsePayload\(existing, slotsAvailable\)/i);
  assert.match(ownerApi, /for \(let attempt = 0; attempt < 5; attempt \+= 1\)[\s\S]*createReferralKey\(\)/i);
});

test('permanent referral routes preserve case-sensitive base64url keys', () => {
  assert.match(publicApi, /const normalizedKey = key\.trim\(\)/i);
  assert.match(claimApi, /const referralKey = key\.trim\(\)/i);
  assert.match(permanentPage, /referralKey=\{key\.trim\(\)\}/i);
  assert.doesNotMatch(publicApi, /toUpperCase\(\)|toLowerCase\(\)/i);
  assert.doesNotMatch(claimApi, /referralKey[^\n]*(?:toUpperCase|toLowerCase)/i);
  assert.doesNotMatch(permanentPage, /key[^\n]*(?:toUpperCase|toLowerCase)/i);
});

test('client URL-encodes the permanent key without changing its value', () => {
  assert.match(permanentClient, /\/api\/referral-links\/\$\{encodeURIComponent\(referralKey\)\}/i);
  assert.match(permanentClient, /\/api\/referral-links\/\$\{encodeURIComponent\(referralKey\)\}\/claim/i);
});
