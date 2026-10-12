import { supabaseAdmin } from '@/lib/supabaseServer';

type SiblingSwitchContext = {
  inviteCode: string;
  network: string | null;
  inviterWallet: string;
  inviteeWallet: string;
  siblingWallet: string;
  siblingInviteCode: string;
  sharedClientId: string;
  switchGapSeconds: number | null;
  activationGapSeconds: number | null;
  siblingActivationGapSeconds: number | null;
};

/**
 * A later alternating login can overlap aggregate first/last observation
 * windows, making the original sequential gap unobservable. Only replay a
 * previously recorded, independently bounded switch for this exact pair.
 * Shared devices alone still never trigger an automatic BLACK decision.
 */
export async function confirmedSiblingImmediateSwitch({
  inviteCode,
  network,
  inviterWallet,
  inviteeWallet,
  siblingWallet,
  siblingInviteCode,
  sharedClientId,
  switchGapSeconds,
  activationGapSeconds,
  siblingActivationGapSeconds,
}: SiblingSwitchContext): Promise<boolean> {
  const nearActivation =
    activationGapSeconds !== null &&
    siblingActivationGapSeconds !== null &&
    activationGapSeconds >= 0 &&
    activationGapSeconds <= 600 &&
    siblingActivationGapSeconds >= 0 &&
    siblingActivationGapSeconds <= 600;

  if (!nearActivation) return false;

  // A current strictly sequential observation remains authoritative.
  if (switchGapSeconds !== null) {
    return switchGapSeconds >= 0 && switchGapSeconds <= 600;
  }

  if (!network) return false;

  const evidenceKey =
    `sybil-v2:${inviteCode}:security_client_sibling_immediate_switch:${sharedClientId}:${siblingInviteCode}`;
  const { data, error } = await supabaseAdmin
    .from('sybil_v2_evidence_records')
    .select('evidence')
    .eq('dedupe_key', evidenceKey)
    .eq('network', network)
    .eq('invite_code', inviteCode)
    .eq('subject_wallet', inviteeWallet)
    .eq('related_wallet', siblingWallet)
    .eq('signal_code', 'SECURITY_CLIENT_SIBLING_IMMEDIATE_SWITCH')
    .maybeSingle();

  if (error) {
    throw new Error(
      `Verified sequential switch evidence could not be loaded: ${error.message}`,
    );
  }

  const saved = data?.evidence;
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    return false;
  }

  const evidence = saved as Record<string, unknown>;
  const bounded = (value: unknown) =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 600;

  return (
    evidence.immediateSwitch === true &&
    evidence.sameInviterSibling === true &&
    evidence.inviterWallet === inviterWallet &&
    evidence.peerWallet === siblingWallet &&
    evidence.peerInviteCode === siblingInviteCode &&
    evidence.sharedClientId === sharedClientId &&
    bounded(evidence.switchGapSeconds) &&
    bounded(evidence.activationGapSeconds) &&
    bounded(evidence.peerActivationGapSeconds)
  );
}
