import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const proofPage = await readFile(
  new URL('../src/app/proofs/[payoutId]/page.tsx', import.meta.url),
  'utf8',
);
const migration = await readFile(
  new URL(
    '../supabase/migrations/20260914160000_harden_v3_reward_proofs.sql',
    import.meta.url,
  ),
  'utf8',
);

test('public reward Proof pages are opaque, verifiable, and excluded from search indexing', () => {
  assert.match(proofPage, /PUBLIC_PROOF_ID_PATTERN/u);
  assert.match(proofPage, /\.eq\('public_proof_id', publicProofId\)/u);
  assert.match(proofPage, /index:\s*false/u);
  assert.match(proofPage, /follow:\s*false/u);
  assert.match(proofPage, /shortenHex\(recipientWallet\)/u);
  assert.match(proofPage, /invite_code/u);
  assert.match(proofPage, /\.from\('invitations'\)/u);
  assert.match(proofPage, /\.from\('invite_impact_events'\)/u);
  assert.match(proofPage, />Referee wallet</u);
  assert.match(proofPage, /Qualifying dApps/u);
  assert.match(proofPage, /Governance vote/u);
  assert.match(proofPage, /unique human/u);
  assert.doesNotMatch(proofPage, /formatUnits/u);
  assert.doesNotMatch(proofPage, /amount_wei/u);
  assert.doesNotMatch(proofPage, />Payout ID</u);
  assert.doesNotMatch(
    proofPage,
    /sybil_status|sybil_risk|identity_link|operator_note|security_client/u,
  );
});

test('v3 database hardening creates immutable opaque Proof IDs', () => {
  assert.match(
    migration,
    /add column if not exists public_proof_id uuid not null default gen_random_uuid\(\)/u,
  );
  assert.match(
    migration,
    /create unique index if not exists reward_payouts_public_proof_id_uidx/u,
  );
  assert.match(
    migration,
    /new\.public_proof_id is distinct from old\.public_proof_id/u,
  );
});

test('manifest creation explicitly selects v3 instead of relying on trigger ordering', () => {
  assert.match(
    migration,
    /then 'veinvite-payout-manifest-v3'[\s\S]*else 'veinvite-payout-manifest-v2'/u,
  );
  assert.match(
    migration,
    /insert into public\.reward_payout_manifests\([\s\S]*manifest_version/u,
  );
  assert.match(
    migration,
    /p\.clause->>'publicProofId' = e\.public_proof_id/u,
  );
});

test('manifest inference runs before the validator and v3 links bind to the payout Proof ID', () => {
  assert.match(
    migration,
    /create trigger reward_payout_manifests_00_infer_version/u,
  );
  assert.match(
    migration,
    /veinvite:referral-onboarding:v2:proof:/u,
  );
  assert.match(
    migration,
    /https:\/\/veinvite\.vercel\.app\/proofs\//u,
  );
  assert.match(
    migration,
    /rp\.public_proof_id::text = c\.value->>'publicProofId'/u,
  );
});
