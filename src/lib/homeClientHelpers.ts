import {
  isReferralKey,
  type ReferralLinkRecord,
} from '@/lib/referralLinks';
import type { InviteRecord } from '@/lib/types';

const REFERRAL_LINK_SESSION_PREFIX = 'veinvite_referral_link_v1:';
const B3TR_DECIMALS = 18n;
const B3TR_SCALE = 10n ** B3TR_DECIMALS;

function referralLinkSessionKey(wallet: string): string {
  return `${REFERRAL_LINK_SESSION_PREFIX}${wallet.toLowerCase()}`;
}

export function readCachedReferralLink(
  wallet: string,
): ReferralLinkRecord | null {
  try {
    const raw = window.sessionStorage.getItem(
      referralLinkSessionKey(wallet),
    );
    if (!raw) return null;

    const parsed = JSON.parse(raw) as {
      key?: unknown;
      createdAt?: unknown;
    };
    if (
      typeof parsed.key !== 'string' ||
      !isReferralKey(parsed.key) ||
      typeof parsed.createdAt !== 'string'
    ) {
      window.sessionStorage.removeItem(
        referralLinkSessionKey(wallet),
      );
      return null;
    }

    return {
      key: parsed.key,
      createdAt: parsed.createdAt,
      slotsAvailable: 0,
    };
  } catch {
    return null;
  }
}

export function writeCachedReferralLink(
  wallet: string,
  link: ReferralLinkRecord,
): void {
  try {
    window.sessionStorage.setItem(
      referralLinkSessionKey(wallet),
      JSON.stringify({
        key: link.key,
        createdAt: link.createdAt,
      }),
    );
  } catch {
    // Session cache is an optimization only.
  }
}

export function sameWallet(
  left: string | null,
  right: string,
): boolean {
  return left?.toLowerCase() === right.toLowerCase();
}

export function formatB3trWei(value: string): string {
  if (!/^\d+$/.test(value)) return '—';

  const wei = BigInt(value);
  const whole = wei / B3TR_SCALE;
  const fraction = (wei % B3TR_SCALE)
    .toString()
    .padStart(Number(B3TR_DECIMALS), '0')
    .slice(0, 2)
    .replace(/0+$/, '');

  return fraction
    ? `${whole}.${fraction}`
    : whole.toString();
}

export function missionFlags(invite: InviteRecord): boolean[] {
  const apps = Math.max(
    0,
    Math.min(3, invite.appsCompleted ?? 0),
  );

  return [
    apps >= 1,
    apps >= 2,
    apps >= 3,
    invite.vot3Converted === true,
    invite.voteCompleted === true,
  ];
}

export function nextMissionLabel(
  invite: InviteRecord,
): string {
  const flags = missionFlags(invite);
  const next = flags.findIndex((done) => !done);

  if (next === 0) return 'dApp 1/3';
  if (next === 1) return 'dApp 2/3';
  if (next === 2) return 'dApp 3/3';
  if (next === 3) return 'VOT3';
  if (next === 4) return 'Vote';
  return '';
}
