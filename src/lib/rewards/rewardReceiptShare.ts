import type { SupportedLocale } from '@/lib/i18n/locales';

export function rewardReceiptShareText({
  locale,
  amountB3tr,
}: {
  locale: SupportedLocale;
  amountB3tr: string;
}): string {
  if (locale === 'ko') {
    return [
      `VeInvite에서 친구 초대 보상으로 ${amountB3tr} B3TR을 받았어요 🎉`,
      'VeInvite를 통해 친구를 초대해 보세요!',
    ].join('\n\n');
  }

  return [
    `I just received ${amountB3tr} B3TR in referral rewards on VeInvite 🎉`,
    'Invite your friends through VeInvite!',
  ].join('\n\n');
}

export function rewardReceiptShareLabel(
  locale: SupportedLocale,
): string {
  return locale === 'ko' ? 'X에 공유' : 'Share on X';
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
    rewardReceiptShareText({ locale, amountB3tr }),
  );
  intent.searchParams.set('url', referralUrl);
  return intent.toString();
}
