import type { SupportedLocale } from './locales';

/**
 * The receipt panel's generic "X promotion bonus" heading is used while the
 * promotion is still pending. A PAID notification needs its own completed
 * status, so the bell never reads like an unclaimed offer.
 *
 * Kept separate from REWARD_X_PROMOTION_COPY.title: that title is also used
 * by verification, retention, and payout-preparation screens.
 */
export const REWARD_X_PROMOTION_PAID_TITLE: Record<SupportedLocale, string> = {
  en: 'X bonus paid',
  ko: 'X 추가 보상 지급 완료',
  zh: 'X 额外奖励已发放',
  hi: 'X बोनस का भुगतान हो गया',
  es: '¡Bono de X pagado!',
  ja: 'X追加報酬の支払い完了',
  it: 'Bonus X accreditato',
  tr: 'X bonusun ödendi',
  nl: 'X-bonus uitbetaald',
  de: 'X-Bonus ausgezahlt',
  fr: 'Bonus X versé',
  ar: 'تم صرف مكافأة X',
  bn: 'X বোনাস প্রদান করা হয়েছে',
  pt: 'Bônus do X pago',
  ru: 'Бонус X выплачен',
  id: 'Bonus X sudah dibayarkan',
  vi: 'Đã trả thưởng X',
  'zh-tw': 'X 額外獎勵已發放',
  sv: 'X-bonus utbetald',
  ro: 'Bonusul X a fost plătit',
  ur: 'X بونس ادا کر دیا گیا',
  pcm: 'X bonus don pay',
  arz: 'بونص X اتدفع',
  mr: 'X बोनस जमा झाला',
  te: 'X బోనస్ చెల్లించబడింది',
  sw: 'Bonasi ya X imelipwa',
  ha: 'An biya kyautar X',
  el: 'Το μπόνους X καταβλήθηκε',
  cs: 'Bonus X byl vyplacen',
};
