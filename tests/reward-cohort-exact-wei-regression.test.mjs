import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const EXACT_COMMITTED_WEI = '221610878663833681920';
const allocationWei = '775638075323417886720';
const source = await readFile(
  new URL('../src/lib/rewards/predictivePlanning.ts', import.meta.url),
  'utf8',
);

function createPlanningHarness(rawCohortWei) {
  const calls = [];
  const policyInputs = [];
  const snapshot = {
    reservedExistingWei: '0',
    cohortReservedWei: rawCohortWei,
    fundingAdjustmentWei: '0',
    reserveNetFlowWei: '0',
    designatedBudgetWei: '1551276150646835773440',
    rewardCohortRoundId: 119,
    pipeline: {
      queuedEligibleCount: 1,
      voteReadyCount: 0,
      vot3ReadyCount: 0,
      appsTwoCount: 0,
      appsOneCount: 0,
      activatedZeroCount: 0,
      pendingAcceptanceCount: 35,
    },
    latestAllocation: {
      id: 6,
      veBetterRoundId: 118,
      rewardsAllocationWei: allocationWei,
      claimBlockTimestamp: '2026-10-05T07:26:30Z',
    },
    activeEpoch: null,
  };
  const supabaseAdmin = {
    rpc: async (name) => {
      calls.push(name);
      if (name === 'read_reward_cohort_planning_snapshot') {
        return { data: snapshot, error: null };
      }
      if (name === 'read_sybil_v2_cleared_unreserved_count') {
        return { data: 1, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}. Numeric-returning Wei RPCs are not safe through JSON.`);
    },
  };
  const context = { exports: {}, module: { exports: {} }, BigInt, Number, String, Date };
  context.exports = context.module.exports;
  context.require = (name) => {
    if (name === '@/lib/supabaseServer') return { supabaseAdmin };
    if (name === '@/lib/rewards/rewardFundingHistory') {
      return { readRewardFundingHistory: async () => ({
        recentAllocationWeiNewestFirst: [allocationWei],
        completedRewardRoundRecipientCounts: [5, 3, 0, 1, 3, 3, 2],
      }) };
    }
    if (name === '@/lib/rewards/predictivePolicy') {
      return {
        calculatePredictiveRewardPolicy: (input) => {
          policyInputs.push(input);
          return { rewardPerInviteWei: '1', algorithmVersion: 'unit-test', availablePoolWei: '1' };
        },
      };
    }
    throw new Error(`Unexpected import ${name}`);
  };
  const code = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  runInNewContext(code, context, { filename: 'predictivePlanning.test.js' });
  return { read: context.module.exports.readPredictiveRewardPlanning, calls, policyInputs };
}

const input = {
  network: 'mainnet',
  appId: '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
  rewardCohortRoundId: 119,
  allocationReceiptId: 6,
  observedPoolBalanceWei: '6084932543946418626270',
  includePendingAcceptance: false,
};

test('PostgREST numeric JSON rounds the production Wei amount by 1,920', () => {
  assert.equal(
    BigInt(EXACT_COMMITTED_WEI) - BigInt(String(Number(EXACT_COMMITTED_WEI))),
    1920n,
  );
  assert.equal(Number.isSafeInteger(Number(EXACT_COMMITTED_WEI)), false);
});

test('planning uses snapshot numeric-as-text exactly; no additional numeric RPC', async () => {
  const harness = createPlanningHarness(EXACT_COMMITTED_WEI);
  const planning = await harness.read(input);
  assert.equal(planning.cohortReservedWei, EXACT_COMMITTED_WEI);
  assert.equal(harness.policyInputs.length, 1);
  assert.equal(harness.policyInputs[0].cohortReservedWei, EXACT_COMMITTED_WEI);
  assert.deepEqual(Array.from(harness.policyInputs[0].completedRewardRoundRecipientCounts), [5, 3, 0, 1, 3, 3, 2]);
  assert.deepEqual(harness.calls, [
    'read_reward_cohort_planning_snapshot',
    'read_sybil_v2_cleared_unreserved_count',
  ]);
  assert.equal(planning.pipeline.pendingAcceptanceCount, 0);
  assert.equal(planning.pipeline.queuedEligibleCount, 1);
});

test('a numeric-rounded cohort snapshot fails closed rather than reserving inaccurate Wei', async () => {
  const harness = createPlanningHarness(Number(EXACT_COMMITTED_WEI));
  await assert.rejects(
    harness.read(input),
    /cohortReservedWei must be an exact decimal string/,
  );
  assert.equal(harness.policyInputs.length, 0);
});
