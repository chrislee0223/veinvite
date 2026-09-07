import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const [migration, securityClientServer, sessionRoute, sybilRisk] =
  await Promise.all([
    read(
      'supabase/migrations/20260907071000_add_security_client_identity_gate_v1.sql',
    ),
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

const identityGate = sliceFunction(
  migration,
  'enforce_security_client_identity_gate',
  'log_security_identity_assessment',
);
const invalidationGate = sliceFunction(
  migration,
  'invalidate_security_identity_on_new_wallet_mapping',
  null,
);

test(
  'security-client identity remains independent from product analytics and stores only a hash server-side',
  () => {
    assert.match(
      securityClientServer,
      /__Host-veinvite_security_client/,
    );
    assert.match(securityClientServer, /httpOnly:\s*true/);
    assert.match(securityClientServer, /sameSite:\s*'lax'/);
    assert.match(securityClientServer, /createHash\('sha256'\)/);
    assert.match(
      securityClientServer,
      /p_client_hash:\s*clientHash/,
    );
    assert.doesNotMatch(
      securityClientServer,
      /from ['"]@\/lib\/[^'"]*analytics/i,
    );
    assert.doesNotMatch(
      migration,
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
    assert.doesNotMatch(
      sessionRoute,
      /clearSessionCookie\([\s\S]{0,160}SECURITY_CLIENT_COOKIE_NAME/,
    );
  },
);

test(
  'shared-client evidence can pause rewards for review but can never auto-block in v1',
  () => {
    assert.match(identityGate, /v_score := 90/);
    assert.match(identityGate, /v_score := 80/);
    assert.match(identityGate, /v_score := 60/);
    assert.match(
      identityGate,
      /new\.sybil_status := 'REVIEW'/,
    );
    assert.doesNotMatch(
      identityGate,
      /new\.sybil_status\s*:=\s*'BLOCKED'/,
    );
    assert.match(sybilRisk, /\| 'SECURITY_CLIENT'/);
  },
);

test(
  'a wallet moving alone to a new client is not treated as new relationship evidence',
  () => {
    assert.match(
      invalidationGate,
      /if not exists \([\s\S]*o\.client_id = new\.client_id[\s\S]*o\.wallet_address <> new\.wallet_address[\s\S]*then[\s\S]*return new;/,
    );
    assert.match(
      invalidationGate,
      /NEW_SHARED_SECURITY_CLIENT_WALLET_MAPPING/,
    );
  },
);

test(
  'operator-cleared shared-client reviews stay auditable until genuinely new shared-wallet evidence arrives',
  () => {
    assert.match(
      identityGate,
      /new\.sybil_source = 'OPERATOR'/,
    );
    assert.match(
      identityGate,
      /old\.identity_link_status = 'OPERATOR_CLEARED'/,
    );
    assert.match(
      identityGate,
      /new\.identity_link_status := 'OPERATOR_CLEARED'/,
    );
    assert.match(
      migration,
      /security_identity_assessment_events_append_only/,
    );
    assert.match(
      migration,
      /execute function public\.prevent_operator_ledger_mutation\(\)/,
    );
  },
);

test(
  'new shared-wallet evidence cannot rewrite already assigned or paid reward accounting',
  () => {
    assert.match(
      invalidationGate,
      /i\.reward_status <> 'PAID'/,
    );
    assert.match(
      invalidationGate,
      /q\.status = 'ASSIGNED'/,
    );
    assert.match(
      invalidationGate,
      /q\.assigned_round_id is not null/,
    );
  },
);

test(
  'security identity tables remain server-only',
  () => {
    for (const table of [
      'security_clients',
      'security_client_wallet_observations',
      'security_identity_assessment_events',
    ]) {
      assert.match(
        migration,
        new RegExp(
          `revoke all on table public\\.${table}[\\s\\S]{0,100}from public, anon, authenticated`,
          'i',
        ),
      );
    }

    assert.match(
      migration,
      /grant execute[\s\S]*record_security_client_wallet_observation[\s\S]*to service_role/,
    );
  },
);
