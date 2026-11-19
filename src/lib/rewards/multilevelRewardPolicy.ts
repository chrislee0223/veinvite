/**
 * VeInvite five-level reward policy — isolated STAGING calculator.
 *
 * No database/network access, no payout, no production policy switch.
 * Inputs MUST be finalized, Sybil-cleared, chain-verified event snapshots.
 * All amounts are exact B3TR Wei strings. This is not a payout authority:
 * production integration needs an atomic, versioned ledger and guarded signer.
 *
 * Onboarding: 3 rewarded dApps in entry round, vote in the FOLLOWING round.
 * Active network: only subsequent rounds, rewarded dApp activity + any vote.
 */
export type MultilevelCategory = 'onboarding' | 'active' | 'leader';

export type VerifiedUpline = {
  wallet: string | null;
  /** Qualified by rewarded dApp activity AND a vote in the settlement round. */
  active: boolean;
};

export type VerifiedNetworkEvent = {
  /** Globally unique across both categories in this round. */
  eventId: string;
  actorWallet: string;
  /** A durable evidence reference; producer must independently verify it. */
  proofId: string;
  /** Direct inviter first, then levels 2–5; absent levels may be null. */
  uplines: readonly VerifiedUpline[];
};

export type MultilevelRoundInput = {
  roundId: number;
  /** ALREADY the participant share (80%); NEVER deduct operator fee again. */
  participantPoolWei: string;
  /** Same-category carryover from the prior round, not general returns. */
  previousCategoryCarryWei?: Partial<Record<MultilevelCategory, string>>;
  /** Finalized first-ever onboardings completed in this round. */
  onboardingEvents: readonly VerifiedNetworkEvent[];
  /** Finalized, deduplicated activity from users onboarded BEFORE this round. */
  activeEvents: readonly VerifiedNetworkEvent[];
};

export type MultilevelEntitlement = {
  /** Immutable idempotency key for future SQL uniqueness. */
  entitlementId: string;
  category: MultilevelCategory;
  eventId: string;
  recipientWallet: string;
  level: number;
  grossWei: string;
  baseClaimWei: string;
  xShareHeldWei: string;
};

export type MultilevelReturn = {
  returnId: string;
  category: MultilevelCategory | 'general';
  reason: 'ROUNDING_DUST' | 'MISSING_UPLINE' | 'INACTIVE_UPLINE' | 'EMPTY_CATEGORY_GENERAL';
  eventId: string | null;
  level: number;
  amountWei: string;
};

export type MultilevelRoundResult = {
  roundId: number;
  budgetByCategoryWei: Record<MultilevelCategory, string>;
  entitlements: MultilevelEntitlement[];
  categoryCarryNextWei: Record<MultilevelCategory, string>;
  generalReturnDetails: MultilevelReturn[];
  generalReturnNextWei: string;
  grossEntitlementsWei: string;
  totalBudgetWei: string;
  reconciled: true;
};

const LEVEL_WEIGHTS = [70n, 15n, 8n, 5n, 2n] as const;
const WALLET = /^0x[0-9a-f]{40}$/;
const EVENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ZERO: Record<MultilevelCategory, bigint> = {
  onboarding: 0n, active: 0n, leader: 0n,
};

function exactWei(raw: string | undefined, field: string): bigint {
  if (typeof raw !== 'string' || !/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error('INVALID_EXACT_WEI:' + field);
  }
  return BigInt(raw);
}

function normalizedWallet(value: string, field: string): string {
  if (typeof value !== 'string' || !WALLET.test(value.toLowerCase())) {
    throw new Error('INVALID_WALLET:' + field);
  }
  return value.toLowerCase();
}

function prepareEvents(
  items: readonly VerifiedNetworkEvent[],
  kind: 'onboarding' | 'active',
  seenEventIds: Set<string>,
  seenActors: Set<string>,
): VerifiedNetworkEvent[] {
  if (!Array.isArray(items) || items.length > 100000) {
    throw new Error('INVALID_EVENT_COLLECTION:' + kind);
  }
  return items.map((item) => {
    if (!item || typeof item.eventId !== 'string' || !EVENT_ID.test(item.eventId) ||
      typeof item.proofId !== 'string' || item.proofId.trim().length < 1 ||
      item.proofId.length > 512) {
      throw new Error('INVALID_EVENT_PROOF:' + kind);
    }
    if (seenEventIds.has(item.eventId)) throw new Error('DUPLICATE_EVENT_ID');
    seenEventIds.add(item.eventId);

    const actorWallet = normalizedWallet(item.actorWallet, 'actor');
    // A person cannot create two active events, or onboard and activate in
    // the same round. First-ever onboarding may only be recognized once.
    if (seenActors.has(actorWallet)) throw new Error('DUPLICATE_ACTOR_IN_ROUND');
    seenActors.add(actorWallet);

    if (!Array.isArray(item.uplines) || item.uplines.length > 5) {
      throw new Error('INVALID_UPLINES');
    }
    const seenUplines = new Set<string>([actorWallet]);
    const uplines = (item.uplines as readonly VerifiedUpline[]).map((entry: VerifiedUpline, i: number) => {
      if (!entry || typeof entry.active !== 'boolean') {
        throw new Error('INVALID_UPLINE_ACTIVITY');
      }
      if (entry.wallet === null) return { wallet: null, active: false };
      const wallet = normalizedWallet(entry.wallet, 'upline:' + i);
      if (seenUplines.has(wallet)) throw new Error('CYCLIC_OR_DUPLICATE_UPLINE');
      seenUplines.add(wallet);
      return { wallet, active: entry.active };
    });
    if (kind === 'onboarding' && !uplines[0]?.wallet) {
      throw new Error('ONBOARDING_REQUIRES_DIRECT_INVITER');
    }
    return { eventId: item.eventId, proofId: item.proofId, actorWallet, uplines };
  });
}

/** The 10% is HELD INSIDE gross, never an additional 10% from the treasury. */
export function splitXShareWithinGross(grossWei: string): {
  baseClaimWei: string; xShareHeldWei: string;
} {
  const gross = exactWei(grossWei, 'grossWei');
  const held = gross / 10n;
  return { baseClaimWei: (gross - held).toString(), xShareHeldWei: held.toString() };
}

/** Personalized home estimate; callers must supply a vetted positive forecast count. */
export function forecastDirectOnboardingWei(
  onboardingBudgetWei: string,
  projectedQualifyingCount: number,
): string {
  if (!Number.isSafeInteger(projectedQualifyingCount) ||
      projectedQualifyingCount < 1) {
    throw new Error('INVALID_FORECAST_COUNT');
  }
  const budget = exactWei(onboardingBudgetWei, 'onboardingBudgetWei');
  return ((budget / BigInt(projectedQualifyingCount)) * 70n / 100n).toString();
}

export function calculateMultilevelRound(
  input: MultilevelRoundInput,
): MultilevelRoundResult {
  if (!Number.isSafeInteger(input.roundId) || input.roundId < 1) {
    throw new Error('INVALID_ROUND');
  }
  const participant = exactWei(input.participantPoolWei, 'participantPoolWei');
  const prev = input.previousCategoryCarryWei ?? {};
  const prior: Record<MultilevelCategory, bigint> = {
    onboarding: exactWei(prev.onboarding ?? '0', 'carryOnboarding'),
    active: exactWei(prev.active ?? '0', 'carryActive'),
    leader: exactWei(prev.leader ?? '0', 'carryLeader'),
  };
  const budget: Record<MultilevelCategory, bigint> = {
    onboarding: (participant * 60n) / 100n + prior.onboarding,
    active: (participant * 30n) / 100n + prior.active,
    leader: (participant * 10n) / 100n + prior.leader,
  };
  const total = participant + prior.onboarding + prior.active + prior.leader;
  // Every return is given its own deterministic key for an exactly-once
  // future return ledger; the total alone is insufficient for auditing.
  let generalReturn = 0n;
  const generalReturnDetails: MultilevelReturn[] = [];
  const returnWei = (category: MultilevelCategory | 'general',
    reason: MultilevelReturn['reason'], amount: bigint,
    eventId: string | null = null, level = 0) => {
    if (amount <= 0n) return;
    const returnId = [input.roundId,category,eventId ?? 'round',level,reason].join(':');
    generalReturnDetails.push({
      returnId,category,reason,eventId,level,amountWei:amount.toString(),
    });
    generalReturn += amount;
  };
  returnWei('general','ROUNDING_DUST',
    total - budget.onboarding - budget.active - budget.leader);
  const carry = { ...ZERO };
  const entries: MultilevelEntitlement[] = [];
  let grossTotal = 0n;

  const emit = (category: MultilevelCategory, eventId: string,
    level: number, wallet: string, amount: bigint) => {
    if (amount <= 0n) return;
    const xHeld = amount / 10n;
    entries.push({
      entitlementId: [input.roundId, category, eventId, level, wallet].join(':'),
      category, eventId, level, recipientWallet: wallet,
      grossWei: amount.toString(),
      baseClaimWei: (amount - xHeld).toString(),
      xShareHeldWei: xHeld.toString(),
    });
    grossTotal += amount;
  };
  const emptyCategory = (category: MultilevelCategory) => {
    carry[category] += budget[category] / 2n;
    returnWei(category,'EMPTY_CATEGORY_GENERAL',
      budget[category] - budget[category] / 2n);
  };

  const ids = new Set<string>();
  const actors = new Set<string>();
  const onboardings = prepareEvents(input.onboardingEvents, 'onboarding', ids, actors);
  const activities = prepareEvents(input.activeEvents, 'active', ids, actors);

  const distribute = (
    category: 'onboarding' | 'active',
    events: readonly VerifiedNetworkEvent[],
  ) => {
    if (events.length === 0) { emptyCategory(category); return; }
    const perEvent = budget[category] / BigInt(events.length);
    returnWei(category,'ROUNDING_DUST',
      budget[category] % BigInt(events.length));
    for (const event of events) {
      let splitTotal = 0n;
      LEVEL_WEIGHTS.forEach((weight, i) => {
        const portion = (perEvent * weight) / 100n;
        splitTotal += portion;
        const ancestor = event.uplines[i];
        // Onboarding level 1 is ALWAYS earned for a valid new user, even
        // if the direct inviter has no vote. Higher levels require activity.
        if (portion > 0n && ancestor?.wallet &&
          ((category === 'onboarding' && i === 0) || ancestor.active)) {
          emit(category, event.eventId, i + 1, ancestor.wallet, portion);
        } else if (portion > 0n) {
          returnWei(category,ancestor?.wallet ? 'INACTIVE_UPLINE' : 'MISSING_UPLINE',
            portion,event.eventId,i+1);
        }
      });
      // Wei dust from flooring each percentage does not go to ancestors.
      returnWei(category,'ROUNDING_DUST',perEvent - splitTotal,event.eventId);
    }
  };
  distribute('onboarding', onboardings);
  distribute('active', activities);

  // Leader = most *direct* successful new onboardings this round; ties split.
  const leaderCounts = new Map<string, number>();
  for (const event of onboardings) {
    const direct = event.uplines[0]!.wallet!;
    leaderCounts.set(direct, (leaderCounts.get(direct) ?? 0) + 1);
  }
  if (leaderCounts.size === 0) {
    emptyCategory('leader');
  } else {
    // Do not spread a potentially large inviter set into Math.max(...).
    let high = 0;
    for (const count of leaderCounts.values()) high = Math.max(high, count);
    const winners = [...leaderCounts].filter(([, n]) => n === high)
      .map(([wallet]) => wallet).sort();
    const each = budget.leader / BigInt(winners.length);
    returnWei('leader','ROUNDING_DUST',budget.leader % BigInt(winners.length));
    for (const wallet of winners) {
      emit('leader', 'direct-onboarding-leader', 0, wallet, each);
    }
  }
  const nextTotal = generalReturn + grossTotal +
    carry.onboarding + carry.active + carry.leader;
  if (nextTotal !== total) throw new Error('UNBALANCED_REWARD_LEDGER');
  const returnCheck = generalReturnDetails.reduce(
    (sum, item) => sum + BigInt(item.amountWei),0n);
  if (returnCheck !== generalReturn ||
      new Set(generalReturnDetails.map(item=>item.returnId)).size !== generalReturnDetails.length) {
    throw new Error('INVALID_RETURN_LEDGER');
  }

  return {
    roundId: input.roundId,
    budgetByCategoryWei: {
      onboarding: budget.onboarding.toString(),
      active: budget.active.toString(),
      leader: budget.leader.toString(),
    },
    entitlements: entries,
    categoryCarryNextWei: {
      onboarding: carry.onboarding.toString(),
      active: carry.active.toString(),
      leader: carry.leader.toString(),
    },
    generalReturnDetails,
    generalReturnNextWei: generalReturn.toString(),
    grossEntitlementsWei: grossTotal.toString(),
    totalBudgetWei: total.toString(),
    reconciled: true,
  };
}
