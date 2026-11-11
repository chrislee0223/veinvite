/**
 * Presentation-only estimate selection. This must never be used to reserve,
 * approve or transfer rewards: payout amounts are finalized separately.
 */
export type ElasticRewardPreview =
  | { mode: 'PENDING' | 'LEGACY' }
  | {
      mode: 'ELASTIC_SCENARIOS';
      oneWinnerWei: string;
      twoWinnersWei: string;
      threeWinnersWei: string;
      acceptedParticipants: number;
      rewardCohortRoundId: number;
      observedAt: string;
    };

const INTEGER_WEI = /^[0-9]+$/;

export function normalizeElasticRewardPreview(value: unknown): ElasticRewardPreview {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { mode: 'PENDING' };
  }
  const record = value as Record<string, unknown>;
  if (record.mode === 'PENDING' || record.mode === 'LEGACY') {
    return { mode: record.mode };
  }
  if (record.mode !== 'ELASTIC_SCENARIOS' ||
      ![record.oneWinnerWei, record.twoWinnersWei, record.threeWinnersWei]
        .every((amount) => typeof amount === 'string' && INTEGER_WEI.test(amount)) ||
      !Number.isSafeInteger(record.acceptedParticipants) ||
      Number(record.acceptedParticipants) < 0 ||
      !Number.isSafeInteger(record.rewardCohortRoundId) ||
      Number(record.rewardCohortRoundId) < 1 ||
      typeof record.observedAt !== 'string' ||
      !Number.isFinite(Date.parse(record.observedAt))) {
    return { mode: 'PENDING' };
  }
  const oneWinnerWei = String(record.oneWinnerWei);
  const twoWinnersWei = String(record.twoWinnersWei);
  const threeWinnersWei = String(record.threeWinnersWei);
  // A malformed/contradictory preview must not advertise a misleading reward.
  if (BigInt(oneWinnerWei) < BigInt(twoWinnersWei) ||
      BigInt(twoWinnersWei) < BigInt(threeWinnersWei)) {
    return { mode: 'PENDING' };
  }
  return {
    mode: 'ELASTIC_SCENARIOS',
    oneWinnerWei,
    twoWinnersWei,
    threeWinnersWei,
    acceptedParticipants: Number(record.acceptedParticipants),
    rewardCohortRoundId: Number(record.rewardCohortRoundId),
    observedAt: record.observedAt,
  };
}

/**
 * The database's elastic scenarios are authoritative *only* for displaying
 * conditional scenarios, not a payment guarantee. Avoid showing the
 * single-winner maximum as a normal expected payout.
 *
 * - Already accepted participants cannot be ignored.
 * - Keep one slot for a potential later entrant.
 * - The existing forecast's recipientLow reflects historical completion data.
 * - When >3 winners are plausible, these three scenarios are insufficient:
 *   fail closed rather than showing an optimistic three-winner quote.
 */
export function selectRealisticElasticRewardWei(input: {
  preview: ElasticRewardPreview;
  historicalRecipientLow?: number;
}): string | null {
  const { preview, historicalRecipientLow } = input;
  if (preview.mode !== 'ELASTIC_SCENARIOS') return null;

  const historyFloor =
    typeof historicalRecipientLow === 'number' &&
    Number.isSafeInteger(historicalRecipientLow) &&
    historicalRecipientLow > 0
      ? historicalRecipientLow
      : 2;
  const projectedWinners = Math.max(
    historyFloor,
    preview.acceptedParticipants + 1,
    2,
  );
  if (projectedWinners > 3) return null;
  const amount = projectedWinners === 2
    ? preview.twoWinnersWei
    : preview.threeWinnersWei;
  return BigInt(amount) > 0n ? amount : null;
}
