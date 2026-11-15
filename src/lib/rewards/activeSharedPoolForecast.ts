/**
 * READ-ONLY public participation scenarios, not actual payout quotes.
 * Every unsettled referral (including long-idle older participants) may
 * finish later. Only the canonical reservation writer authorizes payments.
 */
export const PUBLIC_ACTIVE_FORECAST_MODEL_VERSION = 'shared-pool-possibility-range-v3';

export type UnsettledReferralRow = {
  status: string | null;
  sybil_status: string | null;
  reward_status: string | null;
  apps_completed: number | null;
  ineligible_at: string | null;
};

export function summarizeUnsettledPoolReferrals(rows: readonly UnsettledReferralRow[]) {
  let possibleRecipients = 0;
  let missionProgressParticipants = 0;
  let eligibleCompletedRecipients = 0;
  for (const row of rows) {
    if (row.ineligible_at !== null || row.sybil_status === 'BLOCKED' ||
        row.reward_status === 'PAID' || row.reward_status === 'FORFEITED') continue;
    if (row.status === 'COMPLETED' && row.reward_status === 'ELIGIBLE') {
      possibleRecipients++;
      eligibleCompletedRecipients++;
    } else if (row.status === 'ACTIVATING' && row.reward_status === 'PENDING') {
      possibleRecipients++;
      if (typeof row.apps_completed === 'number' &&
          Number.isSafeInteger(row.apps_completed) && row.apps_completed > 0) {
        missionProgressParticipants++;
      }
    }
  }
  return { possibleRecipients, missionProgressParticipants, eligibleCompletedRecipients };
}

/**
 * NOT a guaranteed payout interval:
 * high = only one eligible completer against today's pool;
 * low = every currently unsettled potentially eligible invite completing
 * together against that same pool. Future participation/funding can change it.
 */
export function estimateUnsettledRewardScenarios(
  oneWinnerWei: string,
  xReservePerWinnerWei: string,
  possibleRecipients: number,
): { scenarioLowWei: string; scenarioHighWei: string; scenarioMaxRecipients: number } {
  if (!/^(0|[1-9][0-9]*)$/.test(oneWinnerWei) ||
      !/^(0|[1-9][0-9]*)$/.test(xReservePerWinnerWei) ||
      !Number.isSafeInteger(possibleRecipients) ||
      possibleRecipients < 0 || possibleRecipients >= 1000) {
    throw new Error('Invalid public reward scenario inputs');
  }
  const scenarioMaxRecipients = Math.max(1, possibleRecipients);
  if (oneWinnerWei === '0') {
    return { scenarioLowWei: '0', scenarioHighWei: '0', scenarioMaxRecipients };
  }
  const one = BigInt(oneWinnerWei);
  const reserve = BigInt(xReservePerWinnerWei);
  const n = BigInt(scenarioMaxRecipients);
  const afterOptions = one + reserve - n * reserve;
  return {
    scenarioLowWei: (afterOptions > 0n ? afterOptions / n : 0n).toString(),
    scenarioHighWei: oneWinnerWei,
    scenarioMaxRecipients,
  };
}
