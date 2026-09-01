export const PUBLIC_PROFILE_BUCKET = 'profile-avatars';
export const PUBLIC_PROFILE_MAX_NAME_LENGTH = 32;
export const PUBLIC_PROFILE_MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const WALLET_PATTERN = /^0x[0-9a-f]{40}$/;
const CONTROL_OR_BIDI_PATTERN =
  /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;

export type PublicWalletProfile = {
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export function normalizePublicProfileWallet(
  value: string,
): string | null {
  const normalized = value.trim().toLowerCase();
  return WALLET_PATTERN.test(normalized) ? normalized : null;
}

export function normalizePublicDisplayName(
  value: unknown,
): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new Error('Display name must be text.');
  }

  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!normalized) return null;

  if (
    normalized.length > PUBLIC_PROFILE_MAX_NAME_LENGTH ||
    CONTROL_OR_BIDI_PATTERN.test(normalized)
  ) {
    throw new Error('Display name is not valid.');
  }

  return normalized;
}

export function detectPublicAvatarType(
  bytes: Uint8Array,
): { mime: 'image/png' | 'image/jpeg' | 'image/webp'; extension: 'png' | 'jpg' | 'webp' } | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: 'image/png', extension: 'png' };
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', extension: 'webp' };
  }

  return null;
}
