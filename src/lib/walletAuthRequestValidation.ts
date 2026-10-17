import type { WalletCertificate } from './walletCertificateVerification';

// A JSON payload is untrusted even when TypeScript says it has a type.
// Keep this module dependency-free so malformed requests can be tested
// without contacting the wallet, the rate-limit store or Supabase.
export type WalletChallengeRequestBody = {
  walletAddress?: string;
};

export type WalletVerifyRequestBody = {
  walletAddress?: string;
  nonce?: string;
  signature?: string;
  proofType?: 'typed_data' | 'certificate' | 'message';
  certificate?: WalletCertificate;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isCertificatePayload(value: unknown): boolean {
  return isRecord(value) &&
    isOptionalString(value.type) &&
    isOptionalString(value.content);
}

function isCertificate(value: unknown): value is WalletCertificate {
  if (!isRecord(value)) return false;
  return isOptionalString(value.purpose) &&
    (value.payload === undefined || isCertificatePayload(value.payload)) &&
    isOptionalString(value.domain) &&
    (value.timestamp === undefined ||
      (typeof value.timestamp === 'number' &&
        Number.isSafeInteger(value.timestamp))) &&
    isOptionalString(value.signer) &&
    isOptionalString(value.signature);
}

// Only validate runtime *types* here. The existing route continues to
// validate wallet format, nonce, supported proof type, signed challenge,
// one-time use, site/network binding, signer and cryptographic ownership.
export function isWalletChallengeRequestBody(
  value: unknown,
): value is WalletChallengeRequestBody {
  return isRecord(value) && isOptionalString(value.walletAddress);
}

export function isWalletVerifyRequestBody(
  value: unknown,
): value is WalletVerifyRequestBody {
  return isRecord(value) &&
    isOptionalString(value.walletAddress) &&
    isOptionalString(value.nonce) &&
    isOptionalString(value.signature) &&
    (value.proofType === undefined ||
      value.proofType === 'typed_data' ||
      value.proofType === 'certificate' ||
      value.proofType === 'message' ||
      typeof value.proofType === 'string') &&
    (value.certificate === undefined || isCertificate(value.certificate));
}
