import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  'supabase/migrations/20261001090554_complete_preclaim_security_notification_lifecycle.sql',
  'utf8',
);
const restrictionRoute = await readFile(
  'src/app/api/auth/restriction/route.ts',
  'utf8',
);
const sessionGate = await readFile(
  'src/components/WalletSessionGate.tsx',
  'utf8',
);

test('pre-claim Sybil lifecycle notifies inviter on HOLD and final restriction', () => {
  assert.match(migration, /new\.state = 'HOLD'/u);
  assert.match(migration, /'SECURITY_REVIEW_STARTED'/u);
  assert.match(migration, /'preclaim-r' \|\| new\.revision::text/u);

  assert.match(migration, /new\.state = 'RESTRICTED'/u);
  assert.match(migration, /'SECURITY_RESTRICTION_CONFIRMED'/u);
  assert.match(
    migration,
    /'preclaim-restricted-r' \|\| new\.revision::text/u,
  );
});

test('wallet restriction API surfaces pending HOLDs as an actual app gate', () => {
  assert.match(restrictionRoute, /restricted: true/u);
  assert.match(
    restrictionRoute,
    /restrictionKind: restriction\.restriction_kind/u,
  );
  assert.match(
    restrictionRoute,
    /reviewPending: !blacklisted/u,
  );
});

test('wallet session gate renders neutral review copy for pending HOLDs', () => {
  assert.match(sessionGate, /'PRE_CLAIM_HOLD'/u);
  assert.match(sessionGate, /'POST_PAYOUT_HOLD'/u);
  assert.match(sessionGate, /'INVITER_ESCALATION_HOLD'/u);
  assert.match(
    sessionGate,
    /permanent\s*\? security\.restrictionTitle\s*:\s*security\.reviewTitle/u,
  );
  assert.match(
    sessionGate,
    /permanent\s*\? security\.restrictionBody\s*:\s*security\.reviewBody/u,
  );
});
