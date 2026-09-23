import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Sybil v2 rollout starts in shadow mode by default', async () => {
  const sql = await readFile(
    'supabase/migrations/20260923060000_prepare_sybil_v2_shadow_rollout.sql',
    'utf8',
  );

  assert.match(
    sql,
    /sybil_v2_enforcement_enabled boolean not null default false/u,
  );
  assert.match(
    sql,
    /sybil_v2_enforcement_changed_at timestamptz/u,
  );
  assert.match(
    sql,
    /create or replace function public\.sybil_v2_enforcement_enabled/u,
  );
});

test('shadow mode does not require v2 clearance for legacy reward reservation', async () => {
  const sql = await readFile(
    'supabase/migrations/20260923061000_finalize_sybil_v2_shadow_compatibility.sql',
    'utf8',
  );

  assert.match(
    sql,
    /not public\.sybil_v2_enforcement_enabled\(\)/u,
  );
  assert.match(
    sql,
    /v_sybil_v2_enforced and not found/u,
  );
  assert.match(
    sql,
    /case when v_sybil_v2_enforced then v_clearance\.id else null end/u,
  );
});

test('shadow mode keeps temporary HOLDs and user security notifications inactive', async () => {
  const sql = await readFile(
    'supabase/migrations/20260923061000_finalize_sybil_v2_shadow_compatibility.sql',
    'utf8',
  );

  assert.match(
    sql,
    /where public\.sybil_v2_enforcement_enabled\(\)\s+and a\.state = 'HOLD'/u,
  );
  assert.match(
    sql,
    /if not public\.sybil_v2_enforcement_enabled\(\) then\s+return new;/u,
  );
});

test('eligible reward flow continues in shadow but fails closed after enforcement', async () => {
  const source = await readFile(
    'src/lib/impact/syncInvitation.ts',
    'utf8',
  );

  assert.match(
    source,
    /isSybilV2EnforcementEnabled/u,
  );
  assert.match(
    source,
    /if \(!sybilV2Enforced \|\| v2Ready\)/u,
  );
  assert.match(
    source,
    /Shadow mode must never alter current reward UX/u,
  );
  assert.match(
    source,
    /Enforcement mode is fail-closed/u,
  );
});

test('pre-enforcement Claim-ready rewards are grandfathered in monitoring', async () => {
  const sql = await readFile(
    'supabase/migrations/20260923060100_add_sybil_pipeline_v2_foundation.sql',
    'utf8',
  );

  assert.match(
    sql,
    /q\.reserved_at >= coalesce/u,
  );
  assert.match(
    sql,
    /sybil_v2_enforcement_changed_at/u,
  );
});


test('wallet restrictions remain non-authoritative in shadow mode', async () => {
  const source = await readFile(
    'src/lib/sybil/v2/restrictions.ts',
    'utf8',
  );

  assert.match(source, /isSybilV2EnforcementEnabled/u);
  assert.match(
    source,
    /if \(!\(await isSybilV2EnforcementEnabled\(\)\)\) \{\s*return null;/u,
  );
});


test('reward reservation queue is non-blocking in shadow mode', async () => {
  const source = await readFile(
    'src/app/api/queues/reward-reservation/route.ts',
    'utf8',
  );

  assert.match(source, /isSybilV2EnforcementEnabled/u);
  assert.match(source, /if \(sybilV2Enforced\) \{/u);
  assert.match(
    source,
    /Shadow mode records\/retries analysis but must never block the legacy/u,
  );
  assert.match(
    source,
    /await reserveEligibleReferralRewards\(\)/u,
  );
});


test('Vercel binds the Sybil v2 evidence topic to its queue consumer', async () => {
  const config = JSON.parse(
    await readFile('vercel.json', 'utf8'),
  );

  const trigger =
    config.functions?.[
      'src/app/api/queues/sybil-v2-evidence/route.ts'
    ]?.experimentalTriggers?.[0];

  assert.equal(trigger?.type, 'queue/v2beta');
  assert.equal(
    trigger?.topic,
    'veinvite-sybil-v2-evidence',
  );
  assert.equal(trigger?.initialDelaySeconds, 0);
  assert.equal(trigger?.retryAfterSeconds, 60);
});
