import 'server-only';

import {
  readStaleEligibleRewardReservationLiveness,
} from '@/lib/rewards/rewardReservation';

export async function assertRewardReservationLiveness(
  staleMinutes = 15,
): Promise<void> {
  const state =
    await readStaleEligibleRewardReservationLiveness(
      staleMinutes,
    );

  if (state.missingCount === 0) {
    return;
  }

  throw new Error(
    [
      `CLEAR reward reservation liveness failed for ${state.missingCount} referral(s).`,
      state.oldestRewardEligibleAt
        ? `oldest=${state.oldestRewardEligibleAt}`
        : null,
      state.inviteCodes.length > 0
        ? `inviteCodes=${state.inviteCodes.join(',')}`
        : null,
    ]
      .filter(Boolean)
      .join(' '),
  );
}
