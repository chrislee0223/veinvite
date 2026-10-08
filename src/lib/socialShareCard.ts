export const VEINVITE_SITE_URL = 'https://veinvite.vercel.app';
export const SOCIAL_SHARE_CARD_VERSION = '20261008b';

export const INVITE_OG_IMAGE_URL =
  `${VEINVITE_SITE_URL}/veinvite-og-invite-v2.png`;
export const REWARD_OG_IMAGE_URL =
  `${VEINVITE_SITE_URL}/veinvite-og-reward-v2.png`;

export function applySocialShareCardVersion(url: URL): URL {
  url.searchParams.set('v', SOCIAL_SHARE_CARD_VERSION);
  return url;
}

export function buildProductionSharePageUrl(
  kind: 'r' | 's' | 'i',
  key: string,
): string {
  const url = new URL(
    `/${kind}/${encodeURIComponent(key.trim())}`,
    VEINVITE_SITE_URL,
  );
  applySocialShareCardVersion(url);
  return url.toString();
}
