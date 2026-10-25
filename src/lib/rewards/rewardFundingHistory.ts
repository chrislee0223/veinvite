import 'server-only';

import { supabaseAdmin } from '@/lib/supabaseServer';
import { RECIPIENT_DEMAND_HISTORY_LIMIT } from '@/lib/rewards/recipientDemandFloor';

const INTEGER_PATTERN = /^\d+$/;
const ALLOCATION_HISTORY_LIMIT = 8;

function readIntegerString(value: unknown, fieldName: string): string {
  const normalized = String(value ?? '');
  if (!INTEGER_PATTERN.test(normalized)) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
  return BigInt(normalized).toString();
}

function readCount(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer.`);
  }
  return value;
}

export async function readRewardFundingHistory(input: {
  network: string;
  appId: string;
}): Promise<{
  recentAllocationWeiNewestFirst: string[];
  completedRewardRoundRecipientCounts: number[];
}> {
  const { data, error } = await supabaseAdmin.rpc('read_reward_forecast_history', {
    p_network: input.network,
    p_app_id: input.appId,
    p_allocation_limit: ALLOCATION_HISTORY_LIMIT,
    p_recipient_limit: RECIPIENT_DEMAND_HISTORY_LIMIT,
  });
  if (error) {
    throw new Error(`Reward funding history could not be loaded: ${error.message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Reward funding history is malformed.');
  }
  const record = data as Record<string, unknown>;
  const allocations = record.allocationWeiNewestFirst;
  const recipientCounts = record.completedRecipientCountsNewestFirst;
  if (!Array.isArray(allocations) || allocations.length > ALLOCATION_HISTORY_LIMIT ||
      !Array.isArray(recipientCounts) || recipientCounts.length > RECIPIENT_DEMAND_HISTORY_LIMIT) {
    throw new Error('Reward funding history arrays are malformed.');
  }
  return {
    recentAllocationWeiNewestFirst: allocations.map((value, index) =>
      readIntegerString(value, `allocationHistory[${index}]`)),
    completedRewardRoundRecipientCounts: recipientCounts.map((value, index) =>
      readCount(value, `rewardRecipientHistory[${index}]`)),
  };
}
