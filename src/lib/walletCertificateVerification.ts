import { Address, Blake2b256, Certificate, HexUInt, Secp256k1 } from '@vechain/sdk-core';

// This is the exact verifier used by the production authentication route.
// Keep it dependency-light so a signed wallet response can be exercised
// directly in CI without connecting to the live user or changing production DB.
const CERTIFICATE_CLOCK_SKEW_MS = 2 * 60 * 1000;
const CERTIFICATE_CHALLENGE_WINDOW_MS = 10 * 60 * 1000;

export type WalletCertificate = {
  purpose?: string;
  payload?: {
    type?: string;
    content?: string;
  };
  domain?: string;
  timestamp?: number;
  signer?: string;
  signature?: string;
};


// VeChain certificate signatures encode a recoverable secp256k1 signature
// using v = 0 or 1. Some EVM-compatible signers encode the identical recovery
// bit as 27 or 28. Only normalize those two *encoding aliases*; ownership is
// still verified against the entire signed VeChain certificate/challenge.
export function normalizeVeWorldCertificateRecoverySignature(
  signature: string,
): string {
  if (!/^0x[0-9a-f]{130}$/i.test(signature)) {
    return signature;
  }

  const recovery = Number.parseInt(signature.slice(-2), 16);
  if (recovery !== 27 && recovery !== 28) {
    return signature;
  }

  return `${signature.slice(0, -2)}0${recovery - 27}`;
}

export type WalletCertificateSignerDiagnostic = {
  recoveryByteFormat: 'vechain' | 'evm_legacy' | 'unsupported' | 'malformed';
  recoveredSignerMatchesClaimed: boolean | null;
};

// For rejected signatures only. Never return or log the recovered address,
// certificate, challenge, raw signature, signer or nonce. This distinguishes
// a malformed recovery byte from a valid signed hash that recovers the wrong
// signer, including potential smart-wallet / switched-account cases.
export function diagnoseVeWorldCertificateSignature(
  certificate: WalletCertificate,
): WalletCertificateSignerDiagnostic {
  const raw = certificate.signature ?? '';
  if (!/^0x[0-9a-f]{130}$/i.test(raw)) {
    return {
      recoveryByteFormat: 'malformed',
      recoveredSignerMatchesClaimed: null,
    };
  }

  const v = Number.parseInt(raw.slice(-2), 16);
  const recoveryByteFormat =
    v === 0 || v === 1
      ? 'vechain'
      : v === 27 || v === 28
        ? 'evm_legacy'
        : 'unsupported';

  if (recoveryByteFormat === 'unsupported') {
    return { recoveryByteFormat, recoveredSignerMatchesClaimed: null };
  }

  try {
    const canonical = Certificate.of({
      purpose: certificate.purpose!,
      payload: {
        type: certificate.payload!.type!,
        content: certificate.payload!.content!,
      },
      domain: certificate.domain!,
      timestamp: certificate.timestamp!,
      signer: certificate.signer!,
      signature: normalizeVeWorldCertificateRecoverySignature(raw),
    });
    const recovered = Address.ofPublicKey(
      Secp256k1.recover(
        Blake2b256.of(canonical.encode()).bytes,
        HexUInt.of(canonical.signature!).bytes,
      ),
    ).toString().toLowerCase();

    return {
      recoveryByteFormat,
      recoveredSignerMatchesClaimed:
        recovered === canonical.signer,
    };
  } catch {
    return {
      recoveryByteFormat,
      recoveredSignerMatchesClaimed: null,
    };
  }
}

type CertificateWalletChallenge = {
  expires_at: string;
  message: string | null;
  origin: string | null;
};

function certificateDomainMatchesOrigin(
  domain: string,
  origin: string,
): boolean {
  const rawDomain =
    domain.trim().toLowerCase();

  if (!rawDomain) {
    return false;
  }

  try {
    const originUrl =
      new URL(origin);
    let certificateHost = rawDomain;

    if (
      /^[a-z][a-z0-9+.-]*:\/\//i.test(
        rawDomain,
      )
    ) {
      certificateHost =
        new URL(rawDomain).host
          .toLowerCase();
    } else if (
      rawDomain.includes('/') ||
      rawDomain.includes('?') ||
      rawDomain.includes('#')
    ) {
      return false;
    }

    return (
      certificateHost ===
        originUrl.host.toLowerCase() ||
      certificateHost ===
        originUrl.hostname.toLowerCase()
    );
  } catch {
    return false;
  }
}

export function verifyVeWorldCertificate({
  certificate,
  challenge,
  walletAddress,
  now,
}: {
  certificate: WalletCertificate;
  challenge: CertificateWalletChallenge;
  walletAddress: string;
  now: Date;
}): string | null {
  if (
    certificate.purpose !==
      'agreement' ||
    certificate.payload?.type !==
      'text' ||
    certificate.payload.content !==
      challenge.message ||
    !certificate.domain ||
    !certificate.signer ||
    !certificate.signature ||
    !Number.isSafeInteger(
      certificate.timestamp,
    ) ||
    !certificate.timestamp ||
    certificate.timestamp <= 0
  ) {
    return 'Invalid VeWorld certificate payload.';
  }

  let certificateSigner: string;

  try {
    certificateSigner =
      certificate.signer.trim().toLowerCase();
  } catch {
    return 'Invalid VeWorld certificate signer.';
  }

  if (
    certificateSigner !==
    walletAddress
  ) {
    return 'The certificate does not match the connected wallet.';
  }

  if (
    !certificateDomainMatchesOrigin(
      certificate.domain,
      challenge.origin || '',
    )
  ) {
    return 'The VeWorld certificate was signed for a different site.';
  }

  const expiresAtMs =
    new Date(
      challenge.expires_at,
    ).getTime();
  // VeWorld certificates use Unix seconds. Convert only for local Date-based
  // freshness checks; the SDK signature verifier must receive the original
  // seconds value because that exact timestamp is part of the signed payload.
  const certificateTimestampSeconds =
    certificate.timestamp;
  const certificateTimestampMs =
    certificateTimestampSeconds * 1000;

  if (
    certificateTimestampMs <
      expiresAtMs -
        CERTIFICATE_CHALLENGE_WINDOW_MS ||
    certificateTimestampMs >
      now.getTime() +
        CERTIFICATE_CLOCK_SKEW_MS
  ) {
    return 'The VeWorld certificate timestamp is outside the verification window.';
  }

  try {
    Certificate.of({
      purpose: 'agreement',
      payload: {
        type: 'text',
        content:
          certificate.payload.content,
      },
      domain:
        certificate.domain,
      timestamp:
        certificateTimestampSeconds,
      signer:
        certificateSigner,
      signature:
        normalizeVeWorldCertificateRecoverySignature(
          certificate.signature,
        ),
    }).verify();
  } catch {
    return 'Invalid VeWorld certificate signature.';
  }

  return null;
}

