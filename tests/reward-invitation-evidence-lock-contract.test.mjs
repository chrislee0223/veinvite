import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const helperSource = readFileSync(
  new URL('../src/lib/impact/reconcileInvitationWithLease.ts', import.meta.url),
  'utf8',
);
const cronSource = readFileSync(
  new URL('../src/app/api/cron/vote-reconcile/route.ts', import.meta.url),
  'utf8',
);
const batchSource = readFileSync(
  new URL('../src/lib/impact/reconcileBatch.ts', import.meta.url),
  'utf8',
);
const apiSource = readFileSync(
  new URL('../src/app/api/invites/[code]/route.ts', import.meta.url),
  'utf8',
);
const inviteeSource = readFileSync(
  new URL('../src/components/InviteeClient.tsx', import.meta.url),
  'utf8',
);
const runtimeSource = readFileSync(
  new URL('../src/components/WalletRuntimeLifecycle.tsx', import.meta.url),
  'utf8',
);

const invitation = { invite_code: 'HJKM234', sybil_status: 'CLEAR' };

function harness({ sync = async (row) => ({ row, progress: { voteCompleted: true } }) } = {}) {
  const locks = new Map();
  const trace = [];
  let row = { ...invitation };
  let count = 0;
  const supabaseAdmin = {
    async rpc(name, args) {
      trace.push(name);
      if (name === 'try_acquire_operator_lock') {
        assert.equal(args.p_lease_seconds, 360);
        assert.equal(args.p_lock_name.startsWith('invite_evidence_sync:'), true);
        if (locks.has(args.p_lock_name)) return { data: false, error: null };
        locks.set(args.p_lock_name, args.p_owner_token);
        return { data: true, error: null };
      }
      if (name === 'release_operator_lock') {
        assert.equal(locks.get(args.p_lock_name), args.p_owner_token);
        locks.delete(args.p_lock_name);
        return { data: true, error: null };
      }
      throw new Error('Unexpected RPC ' + name);
    },
    from(name) {
      assert.equal(name, 'invitations');
      return {
        select(columns) {
          assert.equal(columns, '*');
          return this;
        },
        eq(name, value) {
          assert.equal(name, 'invite_code');
          assert.equal(value, row.invite_code);
          return this;
        },
        async maybeSingle() {
          return { data: { ...row }, error: null };
        },
      };
    },
  };
  const mocks = {
    'node:crypto': { randomUUID: () => 'lock-token-' + ++count },
    '@/lib/impact/syncInvitation': { syncInvitationEvidence: sync },
    '@/lib/supabaseServer': { supabaseAdmin },
  };
  const js = ts.transpileModule(helperSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { module: { exports: {} }, console, require(id) {
    assert.ok(id in mocks, 'Unexpected import ' + id);
    return mocks[id];
  } };
  context.exports = context.module.exports;
  runInNewContext(js, context, { filename: 'reconcileInvitationWithLease.js' });
  return {
    reconcile: context.module.exports.reconcileInvitationWithLease,
    setRow: (next) => { row = { ...next }; },
    locks, trace,
  };
}

test('same invitation cannot be verified by two workers concurrently, even if the result is pending', async () => {
  let unblock;
  const gate = new Promise((resolve) => { unblock = resolve; });
  let observed = 0;
  const h = harness({ sync: async (row) => {
    observed += 1;
    await gate;
    return { row, progress: { voteCompleted: false } };
  } });
  const first = h.reconcile(invitation.invite_code);
  // Let the first request acquire its SQL lease.
  await new Promise((resolve) => setImmediate(resolve));
  const second = await h.reconcile(invitation.invite_code);
  assert.equal(second.acquired, false);
  assert.equal(observed, 1);
  unblock();
  const result = await first;
  assert.equal(result.acquired, true);
  assert.equal(h.locks.size, 0);
});

test('lease reloads current database verdict and releases on thrown verifier errors', async () => {
  let seen;
  const h = harness({ sync: async (row) => {
    seen = row.sybil_status;
    throw new Error('node unavailable');
  } });
  h.setRow({ ...invitation, sybil_status: 'BLOCKED' });
  await assert.rejects(() => h.reconcile(invitation.invite_code), /node unavailable/);
  assert.equal(seen, 'BLOCKED');
  assert.equal(h.locks.size, 0);
  assert.deepEqual(h.trace, [
    'try_acquire_operator_lock',
    'release_operator_lock',
  ]);
});

test('all three sync entry points share the same per-code lock and do not consume checkpoints on contention', () => {
  assert.match(helperSource, /invite_evidence_sync:/);
  assert.match(apiSource, /invite_evidence_sync:/);
  assert.match(apiSource, /INVITE_SYNC_LOCK_SECONDS = INVITATION_EVIDENCE_LEASE_SECONDS/);
  assert.match(batchSource, /reconcileInvitationWithLease\(row\.invite_code\)/);
  assert.match(batchSource, /if \(!guarded\.acquired\) \{/);
  assert.match(batchSource, /impactSyncComplete: false/);
  assert.match(cronSource, /reconcileInvitationWithLease\(row\.invite_code\)/);
  assert.match(cronSource, /if \(!guarded\.acquired\) \{[\s\S]*failed \+= 1/);
  assert.match(cronSource, /reconciliation\.failed === 0/);
  assert.doesNotMatch(cronSource, /await syncInvitationEvidence\(row\)/);
  assert.doesNotMatch(batchSource, /await syncInvitationEvidence\(row\)/);
});

test('invitee progress and silent wallet renewal use bounded waits without unsafe repeated POSTs', () => {
  assert.match(inviteeSource, /signal: AbortSignal\.timeout\(mode === 'sync' \? 15_000 : 10_000\)/);
  assert.match(inviteeSource, /mode === 'sync' && response\.status === 409/);
  assert.match(inviteeSource, /method: 'GET',[\s\S]*signal: AbortSignal\.timeout\(10_000\)/);
  assert.match(inviteeSource, /try \{[\s\S]*window\.localStorage\.getItem\(LANGUAGE_STORAGE_KEY\)[\s\S]*\} catch \{/);
  assert.match(inviteeSource, /try \{[\s\S]*window\.localStorage\.setItem\(LANGUAGE_STORAGE_KEY, nextLocale\)[\s\S]*\} catch \{/);
  assert.match(runtimeSource, /X-VeInvite-Session-Intent':\s*SESSION_RENEWAL_INTENT/);
  assert.match(runtimeSource, /signal: AbortSignal\.timeout\(10_000\)/);
});
