import type {
  RewardActionItem,
} from '@/lib/notifications/rewardAction';

export const REWARD_ACTION_PENDING_TRANSFER_POLL_MS = 5_000;
export const REWARD_ACTION_IDLE_POLL_MS = 60_000;

export type RewardActionPollingMode =
  | 'pending-transfer'
  | 'idle';

export function getRewardActionPollingMode(
  actions: readonly RewardActionItem[],
): RewardActionPollingMode {
  return actions.some(
    (action) =>
      action.status !== 'AWAITING_CLAIM' &&
      (!action.broadcastConfirmedAt || !action.txId),
  )
    ? 'pending-transfer'
    : 'idle';
}

export function rewardActionPollingIntervalMs(
  mode: RewardActionPollingMode,
): number {
  return mode === 'pending-transfer'
    ? REWARD_ACTION_PENDING_TRANSFER_POLL_MS
    : REWARD_ACTION_IDLE_POLL_MS;
}
