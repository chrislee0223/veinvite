import 'server-only';

import {
  averageWei,
  formatWeiAsB3tr,
} from '@/lib/reporting/roundReport';
import type {
  VeBetterRoundReport,
} from '@/lib/reporting/veBetterRoundReport';
import { supabaseAdmin } from '@/lib/supabaseServer';

export type RewardXPromotionReportingTotals = {
  currentPaidWei: string;
  priorPaidWei: string;
  cumulativePaidWei: string;
  unresolvedCurrentCount: number;
};

function unsignedWei(
  value: unknown,
  label: string,
): string {
  const normalized = String(value ?? '');

  if (!/^\d+$/u.test(normalized)) {
    throw new Error(
      `X promotion reporting returned invalid ${label}.`,
    );
  }

  return BigInt(normalized).toString();
}

function nonNegativeCount(
  value: unknown,
  label: string,
): number {
  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0
  ) {
    throw new Error(
      `X promotion reporting returned invalid ${label}.`,
    );
  }

  return parsed;
}

export async function readRewardXPromotionReportingTotals({
  network,
  appId,
  currentAllocationReceiptId,
}: {
  network: string;
  appId: string;
  currentAllocationReceiptId: string;
}): Promise<RewardXPromotionReportingTotals> {
  const { data, error } = await supabaseAdmin.rpc(
    'read_reward_x_promotion_reporting_totals_v1',
    {
      p_network: network,
      p_app_id: appId,
      p_current_allocation_receipt_id:
        currentAllocationReceiptId,
    },
  );

  if (error) {
    throw new Error(
      `X promotion reporting totals could not be loaded: ${error.message}`,
    );
  }

  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    throw new Error(
      'X promotion reporting totals returned malformed data.',
    );
  }

  const row =
    data as Record<string, unknown>;

  return {
    currentPaidWei:
      unsignedWei(
        row.currentPaidWei,
        'current paid amount',
      ),
    priorPaidWei:
      unsignedWei(
        row.priorPaidWei,
        'prior paid amount',
      ),
    cumulativePaidWei:
      unsignedWei(
        row.cumulativePaidWei,
        'cumulative paid amount',
      ),
    unresolvedCurrentCount:
      nonNegativeCount(
        row.unresolvedCurrentCount,
        'unresolved count',
      ),
  };
}

function subtractWei(
  left: string,
  right: string,
  label: string,
): string {
  const result =
    BigInt(left) - BigInt(right);

  if (result < 0n) {
    throw new Error(
      `X promotion reporting would make ${label} negative.`,
    );
  }

  return result.toString();
}

export function addPaidXPromotionToVeBetterRoundReport(
  report: VeBetterRoundReport,
  totals: RewardXPromotionReportingTotals,
): VeBetterRoundReport {
  const currentPaid =
    BigInt(totals.currentPaidWei);
  const priorPaid =
    BigInt(totals.priorPaidWei);
  const cumulativePaid =
    BigInt(totals.cumulativePaidWei);

  if (
    currentPaid === 0n &&
    priorPaid === 0n &&
    cumulativePaid === 0n &&
    totals.unresolvedCurrentCount === 0
  ) {
    return report;
  }

  const distributedWei = (
    BigInt(report.rewards.distributedWei) +
    currentPaid
  ).toString();

  const cumulativeDistributedWei = (
    BigInt(report.cumulative.distributedWei) +
    cumulativePaid
  ).toString();

  const ledgerOpeningCarryoverWei =
    subtractWei(
      report.funding.ledgerOpeningCarryoverWei,
      totals.priorPaidWei,
      'ledger opening carryover',
    );

  const openingCarryoverWei =
    report.funding.carryoverSource ===
      'RECORDED_ALLOCATION_LEDGER'
      ? ledgerOpeningCarryoverWei
      : report.funding.openingCarryoverWei;

  const closingCarryoverWei =
    subtractWei(
      (
        BigInt(openingCarryoverWei) +
        BigInt(
          report.funding.rewardPoolAllocationWei,
        )
      ).toString(),
      distributedWei,
      'closing carryover',
    );

  const averageRewardWei =
    averageWei(
      distributedWei,
      report.rewards.successfulReferralsPaid,
    );

  return {
    ...report,
    // A source cohort is not financially final while an optional promotion
    // obligation is still reserved or held. Keep the existing core queue count
    // unchanged so one referral can never be counted twice as a candidate.
    reportComplete:
      report.reportComplete &&
      totals.unresolvedCurrentCount === 0,
    funding: {
      ...report.funding,
      openingCarryoverWei,
      openingCarryoverB3tr:
        formatWeiAsB3tr(
          openingCarryoverWei,
          6,
        ),
      closingCarryoverWei,
      closingCarryoverB3tr:
        formatWeiAsB3tr(
          closingCarryoverWei,
          6,
        ),
      ledgerOpeningCarryoverWei,
    },
    rewards: {
      ...report.rewards,
      distributedWei,
      distributedB3tr:
        formatWeiAsB3tr(
          distributedWei,
          6,
        ),
      averageRewardWei,
      averageRewardB3tr:
        formatWeiAsB3tr(
          averageRewardWei,
          6,
        ),
    },
    cumulative: {
      ...report.cumulative,
      distributedWei:
        cumulativeDistributedWei,
      distributedB3tr:
        formatWeiAsB3tr(
          cumulativeDistributedWei,
          6,
        ),
    },
  };
}
