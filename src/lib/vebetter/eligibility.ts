import type { EligibilityResult } from '@/lib/types';

/**
 * Production integration point.
 * Replace the demo decision with indexed VeBetterDAO and VePassport data.
 */
export async function checkEligibility(args: {
  inviterAddress: string;
  inviteeAddress: string;
  requestedDemoOutcome?: string;
}): Promise<EligibilityResult> {
  const inviter = args.inviterAddress.toLowerCase();
  const invitee = args.inviteeAddress.toLowerCase();

  if (inviter === invitee) {
    return { outcome: 'self_referral', message: '자기 자신을 초대할 수 없습니다.' };
  }

  switch (args.requestedDemoOutcome) {
    case 'existing':
      return {
        outcome: 'existing_vebetter_user',
        message: '이미 VeBetterDAO를 이용한 지갑입니다.',
      };
    case 'other':
      return {
        outcome: 'already_referred',
        message: '이미 다른 추천인에게 연결된 지갑입니다.',
      };
    case 'review':
      return {
        outcome: 'review',
        message: '추가 안전성 검토가 필요합니다.',
      };
    default:
      return { outcome: 'eligible', message: '참여 자격을 확인했습니다.' };
  }
}
