import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [v1Migration, v2Migration, securityClientServer, sessionRoute, sybilRisk] =
  await Promise.all([
    read('supabase/migrations/20260907081307_add_security_client_identity_gate_v1.sql'),
    read('supabase/migrations/20260907103318_harden_security_client_unknown_and_reward_gate_v2.sql'),
    read('src/lib/securityClientServer.ts'),
    read('src/app/api/auth/session/route.ts'),
    read('src/lib/sybil/risk.ts'),
  ]);

function sliceFunction(sql, functionName, nextFunctionName) {
  const start = sql.indexOf(
    `create or replace function public.${functionName}`,
  );
  assert.ok(start >= 0, `${functionName} must exist`);

  const end = nextFunctionName
    ? sql.indexOf(
        `create or replace function public.${nextFunctionName}`,
        start + 1,
      )
    : sql.length;

  assert.ok(
    end > start,
    `${functionName} must have a valid function boundary`,
  );

  return sql.slice(start, end);
}

const identityGateV2 = sliceFunction(
  v2Migration,
  'enforce_security_client_identity_gate',
  'invalidate_security_identity_on_new_wallet_mapping',
);
const invalidationGateV2 = sliceFunction(
  v2Migration,
  'invalidate_security_identity_on_new_wallet_mapping',
  'enforce_invitation_identity_reward_gate',
);
const invitationRewardGateV2 = sliceFunction(
  v2Migration,
  'enforce_invitation_identity_reward_gate',
  'enforce_reward_queue_identity_gate',
);
const rewardQueueGateV2 = sliceFunction(
  v2Migration,
  'enforce_reward_queue_identity_gate',
  null,
);

test(
  'security-client identity remains independent from product analytics and stores only a hash server-side',
  () => {
    assert.match(securityClientServer, /__Host-veinvite_security_client/);
    assert.match(securityClientServer, /httpOnly:\s*true/);
    assert.match(securityClientServer, /sameSite:\s*'lax'/);
    assert.match(securityClientServer, /createHash\('sha256'\)/);
    assert.match(securityClientServer, /p_client_hash:\s*clientHash/);
    assert.doesNotMatch(
      securityClientServer,
      /from ['"]@\/lib\/[^'"]*analytics/i,
    );
    assert.doesNotMatch(
      `${v1Migration}\n${v2Migration}`,
      /\b(ip_address|user_agent|device_model|imei|phone_number|advertising_id)\b/i,
    );
  },
);

test(
  'security-client observation is recorded only after a verified wallet session exists and survives logout',
  () => {
    const calls = sessionRoute.match(
      /await ensureSecurityClientForWallet\(\{/g,
    );
    assert.equal(
      calls?.length,
      2,
      'authenticated GET and renewal POST should record the relationship',
    );
    assert.match(
      sessionRoute,
      /Deliberately keep the security-client cookie on logout/,
    );
  },
);

test(
  'v2 treats missing observation as UNKNOWN and only clean observed wallets as NO_KNOWN_LINK',
  () => {
    assert.match(identityGateV2, /v_status text := 'UNKNOWN'/);
    assert.match(identityGateV2, /v_observed_client_count integer := 0/);
    assert.match(
      identityGateV2,
      /if v_observed_client_count > 0 then[\s\S]*v_status := 'NO_KNOWN_LINK'/,
    );
    assert.match(identityGateV2, /'observedClientCount'/);
    assert.match(v2Migration, /security_client_v2/);
    assert.match(
      v2Migration,
      /observedClientCount'[\s\S]*\^\[1-9\]\[0-9\]\*\$/,
    );
  },
);

test(
  'every new wallet mapping re-evaluates unsettled CLEAR invitations and forced new evidence invalidates old operator approval',
  () => {
    assert.doesNotMatch(
      invalidationGateV2,
      /if not exists \([\s\S]*return new;/,
    );
    assert.match(
      invalidationGateV2,
      /NEW_SECURITY_CLIENT_WALLET_MAPPING/,
    );
    assert.match(invalidationGateV2, /sybil_status = i\.sybil_status/);
    assert.match(identityGateV2, /v_forced_new_evidence boolean := false/);
    assert.match(
      identityGateV2,
      /and not v_forced_new_evidence/,
    );
    assert.match(
      identityGateV2,
      /old\.identity_link_status = 'OPERATOR_CLEARED'/,
    );
  },
);

test(
  'shared-client evidence remains REVIEW-only and never auto-blocks',
  () => {
    assert.match(identityGateV2, /v_score := 90/);
    assert.match(identityGateV2, /v_score := 80/);
    assert.match(identityGateV2, /v_score := 60/);
    assert.match(identityGateV2, /new\.sybil_status := 'REVIEW'/);
    assert.doesNotMatch(
      identityGateV2,
      /new\.sybil_status\s*:=\s*'BLOCKED'/,
    );
    assert.match(sybilRisk, /\| 'SECURITY_CLIENT'/);
  },
);

test(
  'reward eligibility and active reward queue states require a fresh supported v2 identity assessment',
  () => {
    assert.match(
      v2Migration,
      /create or replace function public\.security_identity_reward_gate_passes/,
    );
    assert.match(
      v2Migration,
      /p_checked_at >= p_vote_completed_at/,
    );
    assert.match(
      v2Migration,
      /p_status = 'OPERATOR_CLEARED'[\s\S]*operatorOverride/,
    );
    assert.match(
      invitationRewardGateV2,
      /new\.reward_status := 'PENDING'/,
    );
    assert.match(
      invitationRewardGateV2,
      /PAID_REWARD_IDENTITY_GATE_NOT_SATISFIED/,
    );
    assert.match(
      rewardQueueGateV2,
      /AWAITING_CLAIM','QUEUED','ASSIGNED/,
    );
    assert.match(
      rewardQueueGateV2,
      /REWARD_QUEUE_IDENTITY_GATE_NOT_SATISFIED/,
    );
    assert.match(
      v2Migration,
      /invitations_no_known_link_requires_observation_v2/,
    );
    assert.match(
      v2Migration,
      /invitations_reward_identity_gate_v2/,
    );
    assert.match(
      v2Migration,
      /validate constraint invitations_no_known_link_requires_observation_v2/,
    );
    assert.match(
      v2Migration,
      /validate constraint invitations_reward_identity_gate_v2/,
    );
  },
);

test(
  'new evidence cannot rewrite already assigned or paid reward accounting',
  () => {
    assert.match(invalidationGateV2, /i\.reward_status <> 'PAID'/);
    assert.match(invalidationGateV2, /q\.status = 'ASSIGNED'/);
    assert.match(invalidationGateV2, /q\.assigned_round_id is not null/);
  },
);

test(
  'security identity tables remain server-only under the v1 foundation',
  () => {
    for (const table of [
      'security_clients',
      'security_client_wallet_observations',
      'security_identity_assessment_events',
    ]) {
      assert.match(
        v1Migration,
        new RegExp(
          `revoke all on table public\\.${table}[\\s\\S]{0,100}from public, anon, authenticated`,
          'i',
        ),
      );
    }

    assert.match(
      v1Migration,
      /grant execute[\s\S]*record_security_client_wallet_observation[\s\S]*to service_role/,
    );
  },
);
