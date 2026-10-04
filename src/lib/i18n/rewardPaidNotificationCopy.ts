import type { SupportedLocale } from './locales';

const REWARD_PAID_NOTIFICATION_BODY: Record<SupportedLocale, string> = {
  en: 'Your referral reward of {amount} B3TR was paid to your wallet.',
  ko: '친구 초대 보상으로 {amount} B3TR이 지갑에 지급됐어요.',
  zh: '你的邀请奖励 {amount} B3TR 已发放到钱包。',
  hi: 'आपके रेफ़रल इनाम के {amount} B3TR आपके वॉलेट में भेज दिए गए हैं।',
  es: 'Se han enviado {amount} B3TR de recompensa por invitación a tu cartera.',
  ja: '招待報酬の {amount} B3TR がウォレットに支払われました。',
  it: 'La ricompensa invito di {amount} B3TR è stata inviata al tuo wallet.',
  tr: 'Davet ödülü olarak {amount} B3TR cüzdanına gönderildi.',
  nl: 'Je uitnodigingsbeloning van {amount} B3TR is naar je wallet uitbetaald.',
  de: 'Deine Einladungsbelohnung von {amount} B3TR wurde an deine Wallet ausgezahlt.',
  fr: 'Votre récompense de parrainage de {amount} B3TR a été versée sur votre wallet.',
  ar: 'تم إرسال مكافأة الدعوة بقيمة {amount} B3TR إلى محفظتك.',
  bn: 'আপনার আমন্ত্রণ পুরস্কার হিসেবে {amount} B3TR আপনার ওয়ালেটে পাঠানো হয়েছে।',
  pt: 'Sua recompensa de convite de {amount} B3TR foi enviada para sua carteira.',
  ru: 'Награда за приглашение в размере {amount} B3TR отправлена в ваш кошелёк.',
  id: 'Reward referral sebesar {amount} B3TR telah dikirim ke wallet Anda.',
  vi: 'Phần thưởng giới thiệu {amount} B3TR đã được gửi vào ví của bạn.',
  'zh-tw': '你的邀請獎勵 {amount} B3TR 已發放到錢包。',
  sv: 'Din värvningsbelöning på {amount} B3TR har skickats till din plånbok.',
  ro: 'Recompensa ta de recomandare de {amount} B3TR a fost trimisă în portofel.',
  ur: 'آپ کا {amount} B3TR ریفرل انعام آپ کے والٹ میں بھیج دیا گیا ہے۔',
  pcm: 'Your {amount} B3TR referral reward don enter your wallet.',
  arz: 'مكافأة الدعوة بتاعتك {amount} B3TR وصلت للمحفظة.',
  mr: 'तुमचे {amount} B3TR रेफरल रिवॉर्ड तुमच्या वॉलेटमध्ये पाठवले आहे.',
  te: 'మీ {amount} B3TR రిఫరల్ రివార్డ్ మీ వాలెట్‌కు పంపబడింది.',
  sw: 'Zawadi yako ya rufaa ya {amount} B3TR imetumwa kwenye pochi yako.',
  ha: 'An aika ladan gayyatarka na {amount} B3TR zuwa walat ɗinka.',
  el: 'Η ανταμοιβή πρόσκλησης {amount} B3TR στάλθηκε στο πορτοφόλι σας.',
  cs: 'Odměna za doporučení {amount} B3TR byla odeslána do vaší peněženky.',
};

export function rewardPaidNotificationBody(
  locale: SupportedLocale,
  amountB3tr: string,
): string {
  return REWARD_PAID_NOTIFICATION_BODY[locale].replace(
    '{amount}',
    amountB3tr,
  );
}
