import { createHash } from 'node:crypto';

/**
 * Correlate failed verification retries with a later successful proof for the
 * same short-lived challenge, without recording wallet IDs or signing data.
 */
export function walletChallengeTraceId(challenge: {
  id: number;
  nonce: string;
}): string {
  return createHash('sha256')
    .update(`${challenge.id}:${challenge.nonce}`)
    .digest('hex')
    .slice(0, 16);
}
