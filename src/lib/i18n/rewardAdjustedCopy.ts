import type { SupportedLocale } from './locales';

type RewardAdjustedCopy = {
  title: string;
  body: string;
};

const COPY: Partial<Record<SupportedLocale, RewardAdjustedCopy>> = {
  en: {
    title: 'Referral reward update',
    body: 'Your referral reward was adjusted under VeInvite reward policy. The successful referral was still recorded.',
  },
  ko: {
    title: '초대 보상 안내',
    body: '친구 초대 보상이 VeInvite 보상 정책에 따라 조정되었습니다. 정상 초대 활동은 기록되었습니다.',
  },
  zh: {
    title: '邀请奖励调整',
    body: '本次有效邀请奖励已用于抵扣此前的奖励调整，因此不会新增发放 B3TR。该次有效邀请仍会正常记录。',
  },
  hi: {
    title: 'रेफ़रल रिवॉर्ड समायोजन',
    body: 'इस वैध रेफ़रल का रिवॉर्ड पिछले रिवॉर्ड समायोजन में लगाया गया है, इसलिए नया B3TR ट्रांसफ़र नहीं होगा। सफल रेफ़रल फिर भी दर्ज रहेगा।',
  },
  es: {
    title: 'Ajuste de recompensa por invitación',
    body: 'La recompensa de esta invitación válida se aplicó a un ajuste anterior, por lo que no se transferirá B3TR adicional. La invitación válida sigue registrada.',
  },
  ja: {
    title: '招待報酬の調整',
    body: '今回の有効な招待報酬は以前の報酬調整に充当されたため、新たな B3TR の送金はありません。有効な招待実績はそのまま記録されます。',
  },
  it: {
    title: 'Adeguamento ricompensa invito',
    body: 'La ricompensa di questo invito valido è stata applicata a un precedente adeguamento, quindi non verranno trasferiti nuovi B3TR. L’invito valido resta registrato.',
  },
  tr: {
    title: 'Davet ödülü güncellemesi',
    body: 'Davet ödülünüz VeInvite ödül politikasına göre ayarlandı. Geçerli davet başarınız kaydedildi.',
  },
  nl: {
    title: 'Aanpassing uitnodigingsbeloning',
    body: 'De beloning voor deze geldige uitnodiging is verrekend met een eerdere beloningsaanpassing, daarom wordt geen nieuwe B3TR overgemaakt. De geldige uitnodiging blijft geregistreerd.',
  },
  de: {
    title: 'Anpassung der Einladungsbelohnung',
    body: 'Die Belohnung für diese gültige Einladung wurde mit einer früheren Belohnungsanpassung verrechnet. Daher wird kein neues B3TR übertragen. Die gültige Einladung bleibt erfasst.',
  },
  fr: {
    title: 'Ajustement de la récompense de parrainage',
    body: 'La récompense de ce parrainage valide a été appliquée à un ajustement antérieur, donc aucun nouveau B3TR ne sera versé. Le parrainage valide reste enregistré.',
  },
  ar: {
    title: 'تعديل مكافأة الدعوة',
    body: 'تم احتساب مكافأة هذه الدعوة الصالحة ضمن تسوية مكافأة سابقة، لذلك لن يتم تحويل B3TR جديد. وستظل الدعوة الصالحة مسجلة.',
  },
  bn: {
    title: 'রেফারেল রিওয়ার্ড সমন্বয়',
    body: 'এই বৈধ রেফারেলের রিওয়ার্ড আগের একটি রিওয়ার্ড সমন্বয়ে প্রয়োগ করা হয়েছে, তাই নতুন B3TR ট্রান্সফার হবে না। বৈধ রেফারেলটি তবুও রেকর্ড থাকবে।',
  },
  pt: {
    title: 'Ajuste da recompensa de convite',
    body: 'A recompensa deste convite válido foi aplicada a um ajuste anterior, por isso não haverá nova transferência de B3TR. O convite válido continua registrado.',
  },
  ru: {
    title: 'Корректировка награды за приглашение',
    body: 'Награда за это действительное приглашение была зачтена в предыдущую корректировку, поэтому новый перевод B3TR не выполняется. Само действительное приглашение остаётся учтённым.',
  },
  id: {
    title: 'Penyesuaian reward referral',
    body: 'Reward untuk referral yang valid ini diterapkan pada penyesuaian reward sebelumnya, sehingga tidak ada transfer B3TR baru. Referral yang valid tetap tercatat.',
  },
  vi: {
    title: 'Cập nhật phần thưởng giới thiệu',
    body: 'Phần thưởng giới thiệu của bạn đã được điều chỉnh theo chính sách phần thưởng của VeInvite. Lượt giới thiệu hợp lệ vẫn được ghi nhận.',
  },
};

export function rewardAdjustedCopy(
  locale: SupportedLocale,
): RewardAdjustedCopy {
  return COPY[locale] ?? COPY.en!;
}
