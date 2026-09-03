import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [ownerApi, claimApi] = await Promise.all([
  readFile(new URL('../src/app/api/referral-links/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/api/referral-links/[key]/claim/route.ts', import.meta.url), 'utf8'),
]);

function assertReservationAwareCapacity(source, label) {
  assert.match(
    source,
    /slot_released_at:\s*string\s*\|\s*null/i,
    `${label} must read the slot release marker`,
  );
  assert.match(
    source,
    /\.select\('[^']*slot_released_at[^']*'\)/i,
    `${label} must select slot_released_at`,
  );
  assert.match(
    source,
    /\.in\('status',\s*\[[^\]]*'COMPLETED'[^\]]*\]\)/i,
    `${label} must include COMPLETED invitations in capacity reads`,
  );
  assert.match(
    source,
    /invitation\.status === 'COMPLETED'[\s\S]*invitation\.slot_released_at === null/i,
    `${label} must hold a completed slot until reward reservation releases it`,
  );
}

test('owner slot availability stays aligned with the database reservation-release rule', () => {
  assertReservationAwareCapacity(ownerApi, 'owner API');
});

test('claim capacity precheck stays aligned with the database reservation-release rule', () => {
  assertReservationAwareCapacity(claimApi, 'claim API');
});
