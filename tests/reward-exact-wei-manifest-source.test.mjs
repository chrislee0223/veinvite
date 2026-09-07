import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const EXACT_WEI = '191252137695939520698';

test('production-sized wei cannot safely round-trip through JavaScript Number', () => {
  assert.notEqual(String(Number(EXACT_WEI)), EXACT_WEI);
  assert.equal(BigInt(EXACT_WEI).toString(), EXACT_WEI);
});

test('automatic payout loads exact manifest financial fields through the service RPC', async () => {
  const source = await readFile(
    new URL('../src/lib/rewards/automaticRewardPayout.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /rpc\(\s*'read_reward_manifest_source'/);
  assert.match(source, /const manifestRound:[\s\S]*\.\.\.exactSource\.round/);
  assert.match(source, /const manifestPayouts = exactSource\.payouts/);
  assert.match(source, /const exactManifest = exactSource\.manifest \?\? null/);
  assert.match(source, /round: manifestRound/);
  assert.match(source, /payouts: manifestPayouts/);
});

test('exact manifest-source migrations cast all wei fields to text and keep the RPC server-only', async () => {
  const v1 = await readFile(
    new URL(
      '../supabase/migrations/20260907155645_add_exact_reward_manifest_source_v1.sql',
      import.meta.url,
    ),
    'utf8',
  );
  const v2 = await readFile(
    new URL(
      '../supabase/migrations/20260907161852_extend_exact_reward_manifest_source_v2.sql',
      import.meta.url,
    ),
    'utf8',
  );

  const combined = `${v1}\n${v2}`;
  assert.match(combined, /distributable_wei::text/);
  assert.match(combined, /amount_wei::text/);
  assert.match(v2, /total_amount_wei::text/);
  assert.match(v2, /revoke all on function public\.read_reward_manifest_source\(bigint\) from anon/);
  assert.match(v2, /revoke all on function public\.read_reward_manifest_source\(bigint\) from authenticated/);
  assert.match(v2, /grant execute on function public\.read_reward_manifest_source\(bigint\) to service_role/);
});
