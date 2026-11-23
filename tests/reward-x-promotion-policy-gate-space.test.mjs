import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration=await readFile(
  new URL('../supabase/migrations/20261123111001_fix_x_promotion_policy_not_operator.sql',import.meta.url),'utf8'
);

test('all nine X promotion policy gates contain a standalone NOT operator',()=>{
  const functions=[
    'create_reward_x_promotion_opportunity_v1',
    'guard_reward_x_promotion_external_verification_readiness_v1',
    'guard_reward_x_promotion_live_activation_interlock',
    'read_reward_x_promotion_offer_readiness_v1',
    'read_reward_x_promotion_offer_readiness_v2',
    'sync_reward_x_promotion_shadow_splits',
    'validate_reward_x_promotion_opportunity_insert',
    'validate_reward_x_promotion_post_submission_insert',
    'validate_reward_x_promotion_post_verification_insert'
  ];
  for(const fn of functions){
    assert.match(migration,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+fn+'\\('));
  }
  assert.doesNotMatch(migration,/policy_versionnot\\s+in/);
  assert.match(migration,/policy_version not in/);
});
