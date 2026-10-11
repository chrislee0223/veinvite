// Privacy-safe, bounded diagnostic buckets for anonymous wallet-auth events.
// No wallet address, raw error, nonce, URL, certificate or challenge is emitted.
export type WalletAuthFailureBucket =
  | 'wallet_provider'
  | 'wallet_signature'
  | 'wallet_signature_timeout'
  | 'wallet_challenge'
  | 'wallet_verification'
  | 'wallet_session'
  | 'wallet_rate_limit';

type FailureContext = {
  code: string;
  stage: string;
  message?: string;
};

export function walletAuthFailureBucket({
  code,
  stage,
  message,
}: FailureContext): WalletAuthFailureBucket {
  // Only internally generated timeout messages; never send free-form messages.
  if (
    message === 'Wallet signature request timed out.' ||
    message === 'Wallet message signature request timed out.'
  ) {
    return 'wallet_signature_timeout';
  }

  if (code === 'AUTH_RATE_LIMITED' || code === 'AUTH_RATE_LIMIT_UNAVAILABLE') {
    return 'wallet_rate_limit';
  }

  if (
    code.startsWith('AUTH_CERTIFICATE_') ||
    code.startsWith('AUTH_TYPED_') ||
    code.startsWith('AUTH_MESSAGE_') ||
    code === 'AUTH_MIXED_PROOF' ||
    code === 'AUTH_MISSING_PROOF' ||
    code === 'AUTH_UNSUPPORTED_PROOF'
  ) {
    return 'wallet_signature';
  }

  if (code.startsWith('AUTH_CHALLENGE_') || code === 'AUTH_CONTEXT_CHANGED') {
    return 'wallet_challenge';
  }

  if (code.startsWith('AUTH_SESSION_')) {
    return 'wallet_session';
  }

  if (code === 'AUTH_WALLET_PROVIDER') return 'wallet_provider';
  if (code === 'AUTH_WALLET_SIGNATURE') return 'wallet_signature';

  if (code === 'AUTH_SERVER_VERIFICATION' || code === 'AUTH_UNKNOWN_VERIFICATION_FAILURE') {
    return 'wallet_verification';
  }

  if (stage === 'AUTH_CHALLENGE_REQUEST') return 'wallet_challenge';
  if (stage === 'AUTH_WALLET_PROVIDER') return 'wallet_provider';
  if (stage === 'AUTH_WALLET_SIGNATURE') return 'wallet_signature';
  if (stage === 'AUTH_SERVER_VERIFICATION') return 'wallet_verification';

  return 'wallet_session';
}
