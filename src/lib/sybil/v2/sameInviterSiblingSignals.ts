import type { SybilV2Signal } from '@/lib/sybil/v2/policy';

// A shared client remains one SECURITY_IDENTITY evidence domain even
// if several sibling referrals match. Neither signal auto-blacklists.
export function siblingSecuritySignals(
  sharedClientId: string,
  immediateSwitch: boolean,
): SybilV2Signal[] {
  const signals: SybilV2Signal[] = [{
    code: 'SECURITY_CLIENT_SIBLING_LINK',
    family: 'SECURITY_IDENTITY',
    strength: 'MEDIUM',
    score: 60,
    independentKey: sharedClientId,
  }];

  if (immediateSwitch) {
    signals.push({
      code: 'SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH',
      family: 'SECURITY_IDENTITY',
      strength: 'HIGH',
      score: 100,
      independentKey: sharedClientId,
    });
  }
  return signals;
}

// Deduplicate by the shared client and signal code, not by referral count.
export function distinctSiblingSecuritySignals(
  signals: SybilV2Signal[],
): SybilV2Signal[] {
  return [...new Map(
    signals.map((signal) => [
      `${signal.code}:${signal.independentKey ?? ''}`,
      signal,
    ]),
  ).values()];
}
