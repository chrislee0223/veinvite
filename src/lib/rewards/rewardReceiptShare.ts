import type { SupportedLocale } from '@/lib/i18n/locales';

type RewardReceiptShareCopy = {
  label: string;
};

export const REWARD_RECEIPT_SHARE_COPY: Record<
  SupportedLocale,
  RewardReceiptShareCopy
> = {
  en: {
    label: 'Share on X',
  },
  ko: {
    label: 'X에 공유',
  },
  zh: {
    label: '分享到 X',
  },
  hi: {
    label: 'X पर शेयर करें',
  },
  es: {
    label: 'Compartir en X',
  },
  ja: {
    label: 'Xでシェア',
  },
  it: {
    label: 'Condividi su X',
  },
  tr: {
    label: "X'te paylaş",
  },
  nl: {
    label: 'Delen op X',
  },
  de: {
    label: 'Auf X teilen',
  },
  fr: {
    label: 'Partager sur X',
  },
  ar: {
    label: 'مشاركة على X',
  },
  bn: {
    label: 'X-এ শেয়ার করুন',
  },
  pt: {
    label: 'Compartilhar no X',
  },
  ru: {
    label: 'Поделиться в X',
  },
  id: {
    label: 'Bagikan di X',
  },
  vi: {
    label: 'Chia sẻ lên X',
  },
  'zh-tw': {
    label: '分享到 X',
  },
  sv: {
    label: 'Dela på X',
  },
  ro: {
    label: 'Distribuie pe X',
  },
  ur: {
    label: 'X پر شیئر کریں',
  },
  pcm: {
    label: 'Share am for X',
  },
  arz: {
    label: 'شارك على X',
  },
  mr: {
    label: 'X वर शेअर करा',
  },
  te: {
    label: 'Xలో షేర్ చేయండి',
  },
  sw: {
    label: 'Shiriki kwenye X',
  },
  ha: {
    label: 'Raba a X',
  },
  el: {
    label: 'Κοινοποίηση στο X',
  },
  cs: {
    label: 'Sdílet na X',
  },
};

export function formatRewardShareAmount(value: string): string {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) return normalized;

  const whole = match[1];
  const fraction = match[2] ?? '';
  if (fraction.length <= 2) return normalized;

  let cents =
    BigInt(whole) * 100n +
    BigInt(fraction.slice(0, 2).padEnd(2, '0'));

  if (fraction[2] >= '5') cents += 1n;

  const roundedWhole = cents / 100n;
  const roundedFraction = (cents % 100n)
    .toString()
    .padStart(2, '0')
    .replace(/0+$/, '');

  return roundedFraction
    ? `${roundedWhole.toString()}.${roundedFraction}`
    : roundedWhole.toString();
}

// Public X campaign posts intentionally use one concise global English
// template so campaign wording and discovery tags stay consistent. The
// surrounding in-app share controls remain localized through this registry.
export function rewardReceiptShareText({
  locale: _locale,
  amountB3tr,
}: {
  locale: SupportedLocale;
  amountB3tr: string;
}): string {
  const amount = formatRewardShareAmount(amountB3tr);

  return [
    `I just earned ${amount} #B3TR`,
    'with @Veinvite on #VeBetterDAO 🎉',
    '',
    'Join. Verify. Earn B3TR. 👇',
  ].join('\n');
}

export function rewardReceiptShareLabel(
  locale: SupportedLocale,
): string {
  return REWARD_RECEIPT_SHARE_COPY[locale].label;
}

export function rewardReceiptXIntentUrl({
  locale,
  amountB3tr,
  referralUrl,
}: {
  locale: SupportedLocale;
  amountB3tr: string;
  referralUrl: string;
}): string {
  const intent = new URL('https://x.com/intent/post');
  intent.searchParams.set(
    'text',
    [
      rewardReceiptShareText({ locale, amountB3tr }),
      referralUrl,
      '#VeChain #Web3 #Crypto',
    ].join('\n\n'),
  );
  return intent.toString();
}


const X_PROMOTION_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export function rewardXPromotionShareUrl({
  referralUrl,
  shareToken,
}: {
  referralUrl: string;
  shareToken: string;
}): string {
  const token = shareToken.trim().toLowerCase();

  if (!X_PROMOTION_TOKEN_PATTERN.test(token)) {
    return '';
  }

  try {
    const url = new URL(referralUrl);

    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'veinvite.vercel.app' ||
      !/^\/s\/(?:[A-Za-z0-9_-]{16}|[A-Za-z0-9_-]{22,64})\/?$/u.test(url.pathname)
    ) {
      return '';
    }

    url.searchParams.set('xp', token);
    return url.toString();
  } catch {
    return '';
  }
}
