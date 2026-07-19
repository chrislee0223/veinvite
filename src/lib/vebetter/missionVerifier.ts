export interface ActivationEvidence {
  walletConnected: boolean;
  distinctVeBetterAppsUsed: number;
  b3trEarned: boolean;
  convertedToVot3: boolean;
  voted: boolean;
}

export interface ActivationVerification {
  complete: boolean;
  reason: string;
}

/**
 * The UI exposes three simple mission groups, while the server verifies five conditions.
 * Replace this demo verifier with official indexer/API or contract-event checks.
 */
export function verifyActivation(evidence: ActivationEvidence): ActivationVerification {
  const complete =
    evidence.walletConnected &&
    evidence.distinctVeBetterAppsUsed >= 3 &&
    evidence.b3trEarned &&
    evidence.convertedToVot3 &&
    evidence.voted;

  return {
    complete,
    reason: complete
      ? 'All activation requirements were verified.'
      : 'One or more activation requirements are incomplete.',
  };
}
