import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

async function fileMissing(path) {
  try {
    await access(path);
    return false;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return true;
    throw error;
  }
}

test('recently added paid sibling review is absent from app code and existing admin workflow remains', async () => {
  const page = await readFile('src/app/admin/sybil-review/page.tsx', 'utf8');
  assert.doesNotMatch(page, /PaidSiblingRechecks|paid-siblings/u);
  assert.match(page, /Human-in-the-loop safety/u);
  assert.match(page, /초기|수동 Sybil 검토/u);
  assert.equal(await fileMissing('src/components/admin/PaidSiblingRechecks.tsx'), true);
  assert.equal(await fileMissing('src/app/api/admin/sybil/paid-siblings/route.ts'), true);
});

test('existing Sybil decisions, appeals and post-payout monitoring remain available', async () => {
  for (const required of [
    'src/app/api/admin/sybil/review/route.ts',
    'src/app/api/admin/sybil/appeals/route.ts',
    'src/lib/sybil/v2/watchFollowup.ts',
    'src/lib/sybil/v2/postPayout.ts',
    'src/app/api/cron/sybil-post-vote-observation/route.ts',
    'src/lib/sybil/v2/evidenceQueue.ts',
    'supabase/migrations/20260923060500_add_sybil_v2_post_payout_reviews.sql',
    'supabase/migrations/20261017234500_paid_sibling_recheck_queue.sql',
    'supabase/migrations/20261018011500_gate_paid_sibling_rechecks_on_independent_evidence.sql',
  ]) assert.equal(await fileMissing(required), false, required);
  const review = await readFile('src/app/api/admin/sybil/review/route.ts', 'utf8');
  assert.match(review, /resolve_sybil_v2_historical_referral/u);
  assert.match(review, /resolve_sybil_v2_post_payout_review/u);
});
