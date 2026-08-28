import { formatWeiAsB3tr } from '@/lib/reporting/roundReport';

type JsonObject = Record<string, unknown>;

export type VeBetterRoundReport = {
  reportVersion: 'veinvite-vebetter-round-report-v2';
  reportComplete: boolean;
  queuedCandidatesAwaitingReward: number;
  network: string;
  appId: string;
  veBetterRoundId: string;
  allocationReceiptId: string;
  allocationClaimTxId: string;
  allocationClaimedAt: string;
  periodStart: string;
  periodEnd: string;
  periodSource: string;
  funding: {
    totalAppAllocationWei: string;
    totalAppAllocationB3tr: string;
    teamAllocationWei: string;
    teamAllocationB3tr: string;
    rewardPoolAllocationWei: string;
    rewardPoolAllocationB3tr: string;
    openingCarryoverWei: string;
    openingCarryoverB3tr: string;
    closingCarryoverWei: string;
    closingCarryoverB3tr: string;
    carryoverSource: string;
    ledgerOpeningCarryoverWei: string;
  };
  participation: {
    eligibilityChecks: number;
    checkedWallets: number;
    newUsers: number;
    returningUsers: number;
    eligibleUsers: number;
    activeExistingUsers: number;
    completedOnboardings: number;
    sybilBlocked: number;
  };
  rewards: {
    rewardRoundId: string | null;
    rewardRoundStatus: string | null;
    successfulReferralsPaid: number;
    rewardedInviters: number;
    newUserReferralsPaid: number;
    returningUserReferralsPaid: number;
    distributedWei: string;
    distributedB3tr: string;
    averageRewardWei: string;
    averageRewardB3tr: string;
  };
  cumulative: {
    newUsers: number;
    returningUsers: number;
    eligibleUsers: number;
    completedOnboardings: number;
    paidReferralRewards: number;
    rewardedInviters: number;
    distributedWei: string;
    distributedB3tr: string;
  };
};

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not an object.`);
  }
  return value as JsonObject;
}

function stringValue(value: unknown, label: string): string {
  const result = String(value ?? '');
  if (!result) {
    throw new Error(`${label} is missing.`);
  }
  return result;
}

function optionalString(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : String(value);
}

function unsignedInteger(value: unknown, label: string): string {
  const result = String(value ?? '');
  if (!/^\d+$/.test(result)) {
    throw new Error(`${label} is not an unsigned integer.`);
  }
  return BigInt(result).toString();
}

function safeCount(value: unknown, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`${label} is not a safe non-negative integer.`);
  }
  return result;
}

function formatWithThousands(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

export function normalizeVeBetterRoundReport(
  value: unknown,
): VeBetterRoundReport {
  const root = asObject(value, 'VeBetter round report');
  const reportVersion = stringValue(
    root.reportVersion,
    'Report version',
  );

  if (
    reportVersion !==
    'veinvite-vebetter-round-report-v2'
  ) {
    throw new Error(
      `Unsupported VeBetter round report version: ${reportVersion}`,
    );
  }

  const funding = asObject(root.funding, 'Funding report');
  const participation = asObject(root.participation, 'Participation report');
  const rewards = asObject(root.rewards, 'Reward report');
  const cumulative = asObject(root.cumulative, 'Cumulative report');

  const totalAppAllocationWei = unsignedInteger(
    funding.totalAppAllocationWei,
    'Total app allocation',
  );
  const teamAllocationWei = unsignedInteger(
    funding.teamAllocationWei,
    'Team allocation',
  );
  const rewardPoolAllocationWei = unsignedInteger(
    funding.rewardPoolAllocationWei,
    'Reward-pool allocation',
  );
  const openingCarryoverWei = unsignedInteger(
    funding.openingCarryoverWei,
    'Opening carryover',
  );
  const closingCarryoverWei = unsignedInteger(
    funding.closingCarryoverWei,
    'Closing carryover',
  );
  const ledgerOpeningCarryoverWei = unsignedInteger(
    funding.ledgerOpeningCarryoverWei,
    'Ledger opening carryover',
  );
  const distributedWei = unsignedInteger(
    rewards.distributedWei,
    'Distributed reward',
  );
  const cumulativeDistributedWei = unsignedInteger(
    cumulative.distributedWei,
    'Cumulative distributed reward',
  );
  const successfulReferralsPaid = safeCount(
    rewards.successfulReferralsPaid,
    'Successful referrals paid',
  );
  const averageRewardWei =
    successfulReferralsPaid === 0
      ? '0'
      : (
          BigInt(distributedWei) /
          BigInt(successfulReferralsPaid)
        ).toString();

  return {
    reportVersion:
      'veinvite-vebetter-round-report-v2',
    reportComplete: root.reportComplete === true,
    queuedCandidatesAwaitingReward:
      safeCount(
        root.queuedCandidatesAwaitingReward,
        'Queued candidates awaiting reward',
      ),
    network: stringValue(root.network, 'Network'),
    appId: stringValue(root.appId, 'App id'),
    veBetterRoundId: unsignedInteger(root.veBetterRoundId, 'VeBetter round id'),
    allocationReceiptId: unsignedInteger(
      root.allocationReceiptId,
      'Allocation receipt id',
    ),
    allocationClaimTxId: stringValue(
      root.allocationClaimTxId,
      'Allocation claim transaction id',
    ),
    allocationClaimedAt: stringValue(
      root.allocationClaimedAt,
      'Allocation claim time',
    ),
    periodStart: stringValue(root.periodStart, 'Period start'),
    periodEnd: stringValue(root.periodEnd, 'Period end'),
    periodSource: stringValue(root.periodSource, 'Period source'),
    funding: {
      totalAppAllocationWei,
      totalAppAllocationB3tr: formatWeiAsB3tr(totalAppAllocationWei, 6),
      teamAllocationWei,
      teamAllocationB3tr: formatWeiAsB3tr(teamAllocationWei, 6),
      rewardPoolAllocationWei,
      rewardPoolAllocationB3tr: formatWeiAsB3tr(rewardPoolAllocationWei, 6),
      openingCarryoverWei,
      openingCarryoverB3tr: formatWeiAsB3tr(openingCarryoverWei, 6),
      closingCarryoverWei,
      closingCarryoverB3tr: formatWeiAsB3tr(closingCarryoverWei, 6),
      carryoverSource: stringValue(
        funding.carryoverSource,
        'Carryover source',
      ),
      ledgerOpeningCarryoverWei,
    },
    participation: {
      eligibilityChecks: safeCount(
        participation.eligibilityChecks,
        'Eligibility checks',
      ),
      checkedWallets: safeCount(
        participation.checkedWallets,
        'Checked wallets',
      ),
      newUsers: safeCount(participation.newUsers, 'New users'),
      returningUsers: safeCount(
        participation.returningUsers,
        'Returning users',
      ),
      eligibleUsers: safeCount(
        participation.eligibleUsers,
        'Eligible users',
      ),
      activeExistingUsers: safeCount(
        participation.activeExistingUsers,
        'Active existing users',
      ),
      completedOnboardings: safeCount(
        participation.completedOnboardings,
        'Completed onboardings',
      ),
      sybilBlocked: safeCount(
        participation.sybilBlocked,
        'Sybil blocked',
      ),
    },
    rewards: {
      rewardRoundId: optionalString(rewards.rewardRoundId),
      rewardRoundStatus: optionalString(rewards.rewardRoundStatus),
      successfulReferralsPaid,
      rewardedInviters: safeCount(
        rewards.rewardedInviters,
        'Rewarded inviters',
      ),
      newUserReferralsPaid: safeCount(
        rewards.newUserReferralsPaid,
        'New-user referrals paid',
      ),
      returningUserReferralsPaid: safeCount(
        rewards.returningUserReferralsPaid,
        'Returning-user referrals paid',
      ),
      distributedWei,
      distributedB3tr: formatWeiAsB3tr(distributedWei, 6),
      averageRewardWei,
      averageRewardB3tr: formatWeiAsB3tr(averageRewardWei, 6),
    },
    cumulative: {
      newUsers: safeCount(cumulative.newUsers, 'Cumulative new users'),
      returningUsers: safeCount(
        cumulative.returningUsers,
        'Cumulative returning users',
      ),
      eligibleUsers: safeCount(
        cumulative.eligibleUsers,
        'Cumulative eligible users',
      ),
      completedOnboardings: safeCount(
        cumulative.completedOnboardings,
        'Cumulative completed onboardings',
      ),
      paidReferralRewards: safeCount(
        cumulative.paidReferralRewards,
        'Cumulative paid referrals',
      ),
      rewardedInviters: safeCount(
        cumulative.rewardedInviters,
        'Cumulative rewarded inviters',
      ),
      distributedWei: cumulativeDistributedWei,
      distributedB3tr: formatWeiAsB3tr(cumulativeDistributedWei, 6),
    },
  };
}

export function buildVeBetterRoundReportPosts(
  report: VeBetterRoundReport,
): { en: string; ko: string } {
  const p = report.participation;
  const r = report.rewards;
  const f = report.funding;
  const c = report.cumulative;
  const allocated = formatWithThousands(f.totalAppAllocationB3tr);
  const paid = formatWithThousands(r.distributedB3tr);
  const cumulativeOnboarded = formatWithThousands(
    String(c.completedOnboardings),
  );

  const statusEn = report.reportComplete
    ? ''
    : `\n⏳ Reward processing is not final yet (${report.queuedCandidatesAwaitingReward} queued).`;
  const statusKo = report.reportComplete
    ? ''
    : `\n⏳ 아직 보상 처리가 최종 완료되지 않았습니다 (대기 ${report.queuedCandidatesAwaitingReward}건).`;

  return {
    en: [
      `VeInvite · VeBetterDAO Round ${report.veBetterRoundId}`,
      `👥 Checked ${p.checkedWallets} | 🆕 ${p.newUsers} | 🔄 ${p.returningUsers} | 🚫 ${p.activeExistingUsers}`,
      `✅ Onboarded ${p.completedOnboardings} | 🤝 Paid ${r.successfulReferralsPaid}`,
      `💰 ${paid} B3TR paid | 🏦 ${allocated} B3TR allocated`,
      `🛡️ Sybil blocked ${p.sybilBlocked} | 📈 Cumulative onboarded ${cumulativeOnboarded}${statusEn}`,
    ].join('\n'),
    ko: [
      `VeInvite · VeBetterDAO ${report.veBetterRoundId} 라운드`,
      `👥 참여 확인 ${p.checkedWallets} | 🆕 신규 ${p.newUsers} | 🔄 복귀 ${p.returningUsers} | 🚫 대상 제외 ${p.activeExistingUsers}`,
      `✅ 온보딩 완료 ${p.completedOnboardings} | 🤝 보상 지급 ${r.successfulReferralsPaid}건`,
      `💰 ${paid} B3TR 지급 | 🏦 ${allocated} B3TR 할당`,
      `🛡️ Sybil 차단 ${p.sybilBlocked} | 📈 누적 온보딩 ${cumulativeOnboarded}${statusKo}`,
    ].join('\n'),
  };
}
