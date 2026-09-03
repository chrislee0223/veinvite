export const PERMANENT_REFERRAL_SLOT_LIMIT = 2 as const;

export type ReferralLinkRecord = {
  key: string;
  createdAt: string;
  slotsAvailable: number;
};

export function createReferralKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const binary = Array.from(bytes, (value) =>
    String.fromCharCode(value),
  ).join('');

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export function normalizeReferralKey(value: string): string {
  return value.trim();
}

export function isReferralKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{22,64}$/.test(value);
}

export function clampAvailableSlots(value: number): number {
  return Math.max(
    0,
    Math.min(PERMANENT_REFERRAL_SLOT_LIMIT, Math.trunc(value)),
  );
}
