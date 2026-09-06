import type {
  OnchainCorrelationContext,
  OnchainRiskIndicator,
} from '@/lib/sybil/onchainAnalytics';

export const SYBIL_OBSERVATION_POLICY_VERSION = 'observation-v1';

/**
 * VeInvite is an onboarding product, so a young wallet or inviter-funded VTHO
 * is expected behavior and must stay weak on its own. This policy turns raw
 * chain observations into deliberately conservative review signals. Nothing
 * here is payout authority and no single funding signal is auto-blocking.
 */
export function applySybilObservationV1Policy({
  indicators,
  correlation,
}: {
  indicators: OnchainRiskIndicator[];
  correlation: OnchainCorrelationContext;
}): OnchainRiskIndicator[] {
  return indicators.map((indicator) => {
    switch (indicator.code) {
      case 'VERY_NEW_WALLET_ACTIVITY':
        return {
          ...indicator,
          level: 'INFO',
          score: 4,
          message:
            'Very recent wallet activity was observed. VeInvite intentionally onboards new wallets, so this is context only unless independent behavior signals also match.',
        };
      case 'NEW_WALLET_ACTIVITY':
        return {
          ...indicator,
          level: 'INFO',
          score: 2,
          message:
            'Recent wallet activity was observed. This is expected for many legitimate VeInvite users and is context only.',
        };
      case 'SAME_FUNDER_MULTI_ASSET':
        return {
          ...indicator,
          level: 'INFO',
          score: 3,
          message:
            'The first observed inbound VET and VTHO came from the same wallet. A friend may legitimately fund onboarding, so this is only an auxiliary signal.',
        };
      case 'SHARED_VET_FUNDER': {
        const count = correlation.vetFunderReferralCount;
        return {
          ...indicator,
          level: count >= 5 ? 'MEDIUM' : 'LOW',
          score: Math.min(25, 5 + count * 3),
          message:
            `The first inbound VET funder is shared by ${count} observed VeInvite referrals. Treat this as review context and require independent behavioral similarity before escalating.`,
        };
      }
      case 'SHARED_VTHO_FUNDER': {
        const count = correlation.vthoFunderReferralCount;
        return {
          ...indicator,
          level: 'LOW',
          score: Math.min(15, 2 + count * 2),
          message:
            `The first inbound VTHO funder is shared by ${count} observed VeInvite referrals. Small VTHO sponsorship is a legitimate onboarding pattern, so this signal is intentionally weak by itself.`,
        };
      }
      default:
        return indicator;
    }
  });
}
