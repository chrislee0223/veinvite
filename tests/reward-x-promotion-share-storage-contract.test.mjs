import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const migration = await readFile(
 new URL('../supabase/migrations/20261112001100_unify_x_share_storage_and_preflight.sql',import.meta.url),'utf8');

test('X Post storage and server preflight enforce one identical immutable canonical URL shape',() => {
 assert.match(migration,/IMMUTABLE STRICT/);
 assert.match(migration,/reward_x_promotion_canonical_share_url_shape_v1\(matched_expanded_url\)/);
 assert.match(migration,/reward_x_promotion_canonical_share_url_shape_v1\(v_url\)/);
 assert.match(migration,/\(v=\[a-z0-9_-\]\{1,32\}&\)\?xp=/);
 assert.match(migration,/reward_x_promotion_post_verifications_canonical_share_url_check/);
});
test('preserve strict canonical URL owner, immutable UUID token and revocation checks',() => {
 assert.match(migration,/v_token<>lower\(p_share_token::text\)/);
 assert.match(migration,/r\.referral_key=v_referral_key/);
 assert.match(migration,/lower\(r\.inviter_wallet\)=v_wallet/);
 assert.match(migration,/r\.status<>'REVOKED'/);
 assert.match(migration,/p_require_active OR r\.status='ACTIVE'/);
 assert.match(migration,/\[1-5\]\[0-9a-f\]\{3\}/);
 assert.match(migration,/\[89ab\]\[0-9a-f\]\{3\}/);
 assert.doesNotMatch(migration,/INSERT INTO public\.reward_x_promotion_/i);
 assert.doesNotMatch(migration,/UPDATE public\.reward_x_promotion_/i);
});
test('anonymous and authenticated cannot call new private URL predicate',() => {
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.reward_x_promotion_canonical_share_url_shape_v1\(text\) FROM PUBLIC,anon,authenticated/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.reward_x_promotion_canonical_share_url_shape_v1\(text\) TO service_role/);
 assert.doesNotMatch(migration,/\bTO\s+(anon|authenticated|PUBLIC)\b/i);
});
