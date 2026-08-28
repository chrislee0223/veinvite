export type RoundReportParticipation = {
  eligibilityChecks: number;
  checkedWallets: number;
  newUsers: number;
  returningUsers: number;
  eligibleUsers: number;
  activeExistingUsers: number;
  completedOnboardings: number;
  sybilBlocked: number;
};

export type RoundReportFunding = {
  veBetterRoundId: string;
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
};

export type RoundReportRewards = {
  successfulReferralsPaid: number;
  rewardedInviters: number;
  newUserReferralsPaid: number;
  returningUserReferralsPaid: number;
  distributedWei: string;
  distributedB3tr: string;
  averageRewardWei: string;
  averageRewardB3tr: string;
};

export type RoundReportCumulative = {
  newUsers: number;
  returningUsers: number;
  eligibleUsers: number;
  completedOnboardings: number;
  paidReferralRewards: number;
  rewardedInviters: number;
  b3trDistributedWei: string;
  b3trDistributed: string;
};

export type RoundReport = {
  rewardRoundId: string;
  network: string;
  periodStart: string;
  periodEnd: string;
  funding: RoundReportFunding;
  participation: RoundReportParticipation;
  rewards: RoundReportRewards;
  cumulative: RoundReportCumulative;
};

const B3TR_DECIMALS = 18n;
const B3TR_SCALE = 10n ** B3TR_DECIMALS;

export function formatWeiAsB3tr(
  rawWei: string,
  maximumFractionDigits = 2,
): string {
  if (!/^\d+$/.test(rawWei)) {
    throw new Error(
      'B3TR wei value must be an unsigned integer string.',
    );
  }

  if (
    !Number.isInteger(maximumFractionDigits) ||
    maximumFractionDigits < 0 ||
    maximumFractionDigits > 18
  ) {
    throw new Error(
      'maximumFractionDigits must be between 0 and 18.',
    );
  }

  const wei = BigInt(rawWei);
  const whole = wei / B3TR_SCALE;
  const remainder = wei % B3TR_SCALE;

  if (
    maximumFractionDigits === 0 ||
    remainder === 0n
  ) {
    return whole.toString();
  }

  const fraction = remainder
    .toString()
    .padStart(Number(B3TR_DECIMALS), '0')
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, '');

  return fraction
    ? `${whole.toString()}.${fraction}`
    : whole.toString();
}

export function averageWei(
  totalWei: string,
  count: number,
): string {
  if (!/^\d+$/.test(totalWei)) {
    throw new Error(
      'Total wei must be an unsigned integer string.',
    );
  }

  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(
      'Reward count must be a safe non-negative integer.',
    );
  }

  if (count === 0) {
    return '0';
  }

  return (
    BigInt(totalWei) / BigInt(count)
  ).toString();
}

function withThousands(value: string): string {
  const [whole, fraction] = value.split('.');
  const grouped = whole.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ',',
  );

  return fraction
    ? `${grouped}.${fraction}`
    : grouped;
}

export function buildRoundReportPosts(
  report: RoundReport,
): { en: string; ko: string } {
  const f = report.funding;
  const p = report.participation;
  const r = report.rewards;
  const c = report.cumulative;
  const allocated = withThousands(
    f.totalAppAllocationB3tr,
  );
  const rewardPool = withThousands(
    f.rewardPoolAllocationB3tr,
  );
  const operations = withThousands(
    f.teamAllocationB3tr,
  );
  const distributed = withThousands(
    r.distributedB3tr,
  );
  const openingCarryover = withThousands(
    f.openingCarryoverB3tr,
  );
  const closingCarryover = withThousands(
    f.closingCarryoverB3tr,
  );
  const cumulativeEligible = withThousands(
    String(c.eligibleUsers),
  );
  const hasCarryover =
    BigInt(f.openingCarryoverWei) > 0n ||
    BigInt(f.closingCarryoverWei) > 0n;

  const en = [
    `VeInvite — VeBetterDAO Round ${f.veBetterRoundId}`,
    '',
    `👥 Checked ${p.checkedWallets} | ✅ Onboarded ${p.completedOnboardings}`,
    `🆕 New ${p.newUsers} | 🔄 Returning ${p.returningUsers} | 🚫 Active ${p.activeExistingUsers}`,
    `🤝 Referrals paid: ${r.successfulReferralsPaid}`,
    `🏦 Allocation: ${allocated} B3TR (Rewards ${rewardPool} / Ops ${operations})`,
    `💰 Referral rewards paid: ${distributed} B3TR`,
    ...(hasCarryover
      ? [`↪️ Carryover: ${openingCarryover} → ${closingCarryover} B3TR`]
      : []),
    `🛡️ Sybil blocked: ${p.sybilBlocked}`,
    `📈 Cumulative onboarded: ${cumulativeEligible}`,
  ].join('\n');

  const ko = [
    `VeInvite — VeBetterDAO ${f.veBetterRoundId} 라운드`,
    '',
    `👥 참여 확인 ${p.checkedWallets} | ✅ 온보딩 완료 ${p.completedOnboardings}`,
    `🆕 신규 ${p.newUsers} | 🔄 복귀 ${p.returningUsers} | 🚫 기존 활성 ${p.activeExistingUsers}`,
    `🤝 추천 보상 지급: ${r.successfulReferralsPaid}건`,
    `🏦 할당: ${allocated} B3TR (추천 보상 ${rewardPool} / 운영 ${operations})`,
    `💰 실제 추천 보상 지급: ${distributed} B3TR`,
    ...(hasCarryover
      ? [`↪️ 이월: ${openingCarryover} → ${closingCarryover} B3TR`]
      : []),
    `🛡️ Sybil 차단: ${p.sybilBlocked}`,
    `📈 누적 신규·복귀 온보딩: ${cumulativeEligible}`,
  ].join('\n');

  return { en, ko };
}
