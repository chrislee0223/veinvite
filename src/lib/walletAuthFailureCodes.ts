// Privacy-safe, stable support codes for wallet proof verification.
// Keep this module dependency-free so the behavior can be unit tested.
export const WALLET_VERIFY_FAILURE_CODES: Readonly<Record<string, string>> = {
  "Invalid JSON body.": "AUTH_INVALID_JSON",
  "walletAddress, nonce, and wallet proof are required.": "AUTH_MISSING_PROOF",
  "Invalid wallet authentication request.": "AUTH_INVALID_REQUEST",
  "Failed to verify wallet.": "AUTH_CHALLENGE_STORAGE_ERROR",
  "Wallet verification request was not found.": "AUTH_CHALLENGE_NOT_FOUND",
  "Wallet verification request was already used.": "AUTH_CHALLENGE_USED",
  "Wallet verification request has expired.": "AUTH_CHALLENGE_EXPIRED",
  "Wallet verification request is no longer valid. Please start verification again.": "AUTH_CONTEXT_CHANGED",
  "Unsupported wallet proof type.": "AUTH_UNSUPPORTED_PROOF",
  "Wallet proof types cannot be mixed.": "AUTH_MIXED_PROOF",
  "Invalid typed wallet signature.": "AUTH_TYPED_SIGNATURE_INVALID",
  "The typed signature does not match the connected wallet.": "AUTH_TYPED_SIGNER_MISMATCH",
  "VeWorld certificate proof is missing.": "AUTH_CERTIFICATE_MISSING",
  "Wallet proof signatures do not match.": "AUTH_CERTIFICATE_SIGNATURE_MISMATCH",
  "Invalid wallet signature.": "AUTH_MESSAGE_SIGNATURE_INVALID",
  "The signature does not match the connected wallet.": "AUTH_MESSAGE_SIGNER_MISMATCH",
  "Failed to create wallet session.": "AUTH_SESSION_ISSUE_FAILED",
  "Wallet verification request is no longer valid.": "AUTH_SESSION_CHALLENGE_CONFLICT",

  "Invalid VeWorld certificate payload.": "AUTH_CERTIFICATE_PAYLOAD_INVALID",
  "Invalid VeWorld certificate signer.": "AUTH_CERTIFICATE_SIGNER_INVALID",
  "The certificate does not match the connected wallet.": "AUTH_CERTIFICATE_SIGNER_MISMATCH",
  "The VeWorld certificate was signed for a different site.": "AUTH_CERTIFICATE_DOMAIN_MISMATCH",
  "The VeWorld certificate timestamp is outside the verification window.": "AUTH_CERTIFICATE_TIMESTAMP_INVALID",
  "Invalid VeWorld certificate signature.": "AUTH_CERTIFICATE_SIGNATURE_INVALID",
};

export function walletVerifyFailureCodeForMessage(message: string): string {
  return WALLET_VERIFY_FAILURE_CODES[message] ??
    'AUTH_UNKNOWN_VERIFICATION_FAILURE';
}
