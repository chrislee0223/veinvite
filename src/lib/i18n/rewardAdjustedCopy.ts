import type { SupportedLocale } from './locales';

type RewardAdjustedCopy = {
  title: string;
  body: string;
};

const COPY: Record<SupportedLocale, RewardAdjustedCopy> = {
  en: {
    title: 'Referral reward adjustment',
    body: 'This valid referral reward was applied to a previous reward adjustment, so no new B3TR was transferred. The successful referral is still recorded.',
  },
  ko: {
    title: '초대 보상 조정 안내',
    body: '이번 정상 초대 보상은 이전 보상 조정에 반영되어 새 B3TR 지급은 없습니다. 정상 초대 1건은 그대로 인정돼요.',
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
    title: 'Davet ödülü düzeltmesi',
    body: 'Bu geçerli davetin ödülü önceki bir ödül düzeltmesine uygulandı, bu nedenle yeni B3TR transferi yapılmayacak. Geçerli davet yine de kaydedilir.',
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
    title: 'Điều chỉnh phần thưởng giới thiệu',
    body: 'Phần thưởng của lượt giới thiệu hợp lệ này được dùng để bù cho một điều chỉnh trước đó, nên sẽ không có B3TR mới được chuyển. Lượt giới thiệu hợp lệ vẫn được ghi nhận.',
  },
  'zh-tw': {
    title: '邀請獎勵調整',
    body: '本次有效邀請獎勵已用於抵扣先前的獎勵調整，因此不會新增發放 B3TR。該次有效邀請仍會正常記錄。',
  },
  sv: {
    title: 'Justering av värvningsbelöning',
    body: 'Belöningen för denna giltiga värvning användes till en tidigare belöningsjustering, så ingen ny B3TR överförs. Den giltiga värvningen registreras fortfarande.',
  },
  ro: {
    title: 'Ajustarea recompensei de recomandare',
    body: 'Recompensa pentru această recomandare validă a fost aplicată unei ajustări anterioare, astfel că nu se transferă B3TR nou. Recomandarea validă rămâne înregistrată.',
  },
  ur: {
    title: 'ریفرل انعام کی ایڈجسٹمنٹ',
    body: 'اس درست ریفرل کا انعام پچھلی ریوارڈ ایڈجسٹمنٹ میں شامل کیا گیا ہے، اس لیے نیا B3TR منتقل نہیں ہوگا۔ درست ریفرل پھر بھی ریکارڈ رہے گا۔',
  },
  pcm: {
    title: 'Referral reward adjustment',
    body: 'Reward for this valid referral don go settle one earlier reward adjustment, so no new B3TR transfer go happen. The valid referral still dey recorded.',
  },
  arz: {
    title: 'تسوية مكافأة الدعوة',
    body: 'مكافأة الدعوة الصحيحة دي اتحسبت ضمن تسوية مكافأة سابقة، علشان كده مفيش تحويل B3TR جديد. الدعوة الصحيحة هتفضل متسجلة.',
  },
  mr: {
    title: 'रेफरल रिवॉर्ड समायोजन',
    body: 'या वैध रेफरलचे रिवॉर्ड मागील रिवॉर्ड समायोजनासाठी वापरले गेले आहे, त्यामुळे नवीन B3TR ट्रान्सफर होणार नाही. वैध रेफरलची नोंद मात्र राहील.',
  },
  te: {
    title: 'రిఫరల్ రివార్డ్ సర్దుబాటు',
    body: 'ఈ చెల్లుబాటు అయ్యే రిఫరల్ రివార్డ్‌ను గత రివార్డ్ సర్దుబాటుకు వర్తింపజేశారు, కాబట్టి కొత్త B3TR బదిలీ ఉండదు. చెల్లుబాటు అయ్యే రిఫరల్ మాత్రం నమోదు అవుతుంది.',
  },
  sw: {
    title: 'Marekebisho ya zawadi ya rufaa',
    body: 'Zawadi ya rufaa hii halali imetumika kwenye marekebisho ya zawadi ya awali, kwa hiyo hakuna B3TR mpya itakayohamishwa. Rufaa halali bado itahesabiwa.',
  },
  ha: {
    title: 'Daidaita ladan gayyata',
    body: 'An yi amfani da ladan wannan gayyata mai inganci wajen daidaita wani tsohon lada, saboda haka ba za a tura sabon B3TR ba. Gayyatar mai inganci za ta ci gaba da kasancewa a rubuce.',
  },
  el: {
    title: 'Προσαρμογή ανταμοιβής πρόσκλησης',
    body: 'Η ανταμοιβή αυτής της έγκυρης πρόσκλησης εφαρμόστηκε σε προηγούμενη προσαρμογή ανταμοιβής, οπότε δεν θα μεταφερθεί νέο B3TR. Η έγκυρη πρόσκληση εξακολουθεί να καταγράφεται.',
  },
  cs: {
    title: 'Úprava odměny za doporučení',
    body: 'Odměna za toto platné doporučení byla použita na dřívější úpravu odměny, takže nebude převedeno nové B3TR. Platné doporučení zůstává započítáno.',
  },
};

export function rewardAdjustedCopy(
  locale: SupportedLocale,
): RewardAdjustedCopy {
  return COPY[locale];
}
