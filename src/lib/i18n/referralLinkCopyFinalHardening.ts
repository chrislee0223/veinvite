import { HOME_COPY } from './homeCopy';
import { REFERRAL_LINK_COPY } from './referralLinkCopy';
import {
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from './locales';

// Final copy alignment for the permanent-link rollout. Legacy one-time invites
// can still exist for users who created them before the rollout, so their
// cancellation dialog must explain exactly what is being cancelled: the old
// one-time link, not the user's permanent referral link or referral history.
const LEGACY_CANCEL_DESCRIPTION: Record<SupportedLocale, string> = {
  en: 'This old one-time link will stop working. Your permanent invite link stays valid, and this friend slot becomes available again.',
  ko: '이 기존 1회용 링크는 더 이상 사용할 수 없어요. 영구 초대 링크는 그대로 유지되고, 이 친구 슬롯은 다시 사용할 수 있어요.',
  zh: '这个旧的一次性邀请链接将停止使用。你的永久邀请链接仍然有效，这个好友名额会重新可用。',
  hi: 'यह पुराना एक बार इस्तेमाल होने वाला आमंत्रण लिंक काम करना बंद कर देगा। आपका स्थायी आमंत्रण लिंक वैध रहेगा और यह मित्र स्लॉट फिर उपलब्ध हो जाएगा।',
  es: 'Este antiguo enlace de un solo uso dejará de funcionar. Tu enlace de invitación permanente seguirá válido y este cupo para amigos volverá a estar disponible.',
  ja: 'この旧1回限りの招待リンクは使えなくなります。永久招待リンクはそのまま有効で、この友だち枠は再び利用できます。',
  it: 'Questo vecchio link monouso smetterà di funzionare. Il tuo link di invito permanente resterà valido e questo posto per un amico tornerà disponibile.',
  tr: 'Bu eski tek kullanımlık davet bağlantısı artık çalışmayacak. Kalıcı davet bağlantın geçerli kalacak ve bu arkadaş yuvası yeniden kullanılabilir olacak.',
  nl: 'Deze oude eenmalige uitnodigingslink werkt daarna niet meer. Je permanente uitnodigingslink blijft geldig en deze vriendplek komt weer vrij.',
  de: 'Dieser alte Einmal-Einladungslink funktioniert danach nicht mehr. Dein permanenter Einladungslink bleibt gültig und dieser Freund-Platz wird wieder frei.',
  fr: 'Cet ancien lien d’invitation à usage unique cessera de fonctionner. Votre lien permanent restera valide et cette place pour un ami sera de nouveau disponible.',
  ar: 'سيتوقف رابط الدعوة القديم ذو الاستخدام الواحد عن العمل. سيبقى رابط دعوتك الدائم صالحًا، وسيصبح مكان هذا الصديق متاحًا من جديد.',
  bn: 'এই পুরোনো একবার ব্যবহারযোগ্য আমন্ত্রণ লিংকটি আর কাজ করবে না। আপনার স্থায়ী আমন্ত্রণ লিংকটি চালু থাকবে এবং এই বন্ধুর স্লটটি আবার খালি হবে।',
  pt: 'Este antigo link de convite de uso único deixará de funcionar. Seu link de convite permanente continuará válido e esta vaga para amigo ficará disponível novamente.',
  ru: 'Эта старая одноразовая ссылка-приглашение перестанет работать. Ваша постоянная ссылка останется действительной, а это место для друга снова освободится.',
  id: 'Tautan undangan sekali pakai yang lama ini akan berhenti berfungsi. Tautan undangan permanenmu tetap berlaku dan slot teman ini akan tersedia lagi.',
  vi: 'Liên kết mời dùng một lần cũ này sẽ ngừng hoạt động. Liên kết mời vĩnh viễn của bạn vẫn còn hiệu lực và suất bạn bè này sẽ trống lại.',
  'zh-tw': '這個舊的一次性邀請連結將停止使用。你的永久邀請連結仍然有效，這個好友名額會重新可用。',
  sv: 'Den här gamla engångslänken slutar att fungera. Din permanenta inbjudningslänk fortsätter att gälla och den här vänplatsen blir ledig igen.',
  ro: 'Acest link vechi de invitație, de unică folosință, nu va mai funcționa. Linkul tău permanent rămâne valabil, iar acest loc pentru un prieten devine din nou disponibil.',
  ur: 'یہ پرانا ایک بار استعمال ہونے والا دعوتی لنک کام کرنا بند کر دے گا۔ آپ کا مستقل دعوتی لنک بدستور درست رہے گا اور یہ دوست سلاٹ دوبارہ دستیاب ہو جائے گا۔',
  pcm: 'This old one-time invite link no go work again. Your permanent invite link still dey valid, and this friend slot go free again.',
  arz: 'لينك الدعوة القديم اللي بيتستخدم مرة واحدة هيبطل يشتغل. لينك دعوتك الدائم هيفضل صالح، والمكان ده هيبقى متاح تاني.',
  mr: 'ही जुनी एकदाच वापरायची आमंत्रण लिंक यानंतर काम करणार नाही. तुमची कायमची आमंत्रण लिंक वैध राहील आणि हा मित्र स्लॉट पुन्हा उपलब्ध होईल.',
  te: 'ఈ పాత ఒక్కసారి ఉపయోగించే ఆహ్వాన లింక్ ఇక పనిచేయదు. మీ శాశ్వత ఆహ్వాన లింక్ చెల్లుబాటులోనే ఉంటుంది మరియు ఈ స్నేహితుడి స్లాట్ మళ్లీ అందుబాటులోకి వస్తుంది.',
  sw: 'Kiungo hiki cha zamani cha mwaliko wa matumizi ya mara moja kitaacha kufanya kazi. Kiungo chako cha kudumu kitaendelea kuwa halali na nafasi hii ya rafiki itapatikana tena.',
  ha: 'Wannan tsohuwar mahadar gayyata ta amfani sau ɗaya ba za ta ƙara aiki ba. Dindindin mahadar gayyatarka za ta ci gaba da aiki, kuma wannan wurin aboki zai sake samuwa.',
};

const LEGACY_CANCEL_SUCCESS: Record<SupportedLocale, string> = {
  en: 'Old invite link cancelled. Your permanent invite link is unchanged, and this friend slot is available again.',
  ko: '기존 1회용 초대 링크를 취소했어요. 영구 초대 링크는 그대로이며, 이 친구 슬롯을 다시 사용할 수 있어요.',
  zh: '旧的一次性邀请链接已取消。你的永久邀请链接保持不变，这个好友名额现在可以再次使用。',
  hi: 'पुराना एक बार उपयोग होने वाला आमंत्रण लिंक रद्द कर दिया गया है। आपका स्थायी आमंत्रण लिंक वही है और यह मित्र स्लॉट फिर उपलब्ध है।',
  es: 'Se canceló el antiguo enlace de un solo uso. Tu enlace de invitación permanente no cambia y este cupo vuelve a estar disponible.',
  ja: '旧1回限りの招待リンクをキャンセルしました。永久招待リンクはそのままで、この友だち枠を再び利用できます。',
  it: 'Il vecchio link monouso è stato annullato. Il link di invito permanente non cambia e questo posto è di nuovo disponibile.',
  tr: 'Eski tek kullanımlık davet bağlantısı iptal edildi. Kalıcı davet bağlantın değişmedi ve bu arkadaş yuvası yeniden kullanılabilir.',
  nl: 'De oude eenmalige uitnodigingslink is geannuleerd. Je permanente uitnodigingslink blijft hetzelfde en deze vriendplek is weer beschikbaar.',
  de: 'Der alte Einmal-Einladungslink wurde abgebrochen. Dein permanenter Einladungslink bleibt unverändert und dieser Freund-Platz ist wieder verfügbar.',
  fr: 'L’ancien lien d’invitation à usage unique a été annulé. Votre lien permanent reste inchangé et cette place est de nouveau disponible.',
  ar: 'تم إلغاء رابط الدعوة القديم ذي الاستخدام الواحد. رابط دعوتك الدائم لم يتغير، وأصبح مكان هذا الصديق متاحًا من جديد.',
  bn: 'পুরোনো একবার ব্যবহারযোগ্য আমন্ত্রণ লিংকটি বাতিল করা হয়েছে। আপনার স্থায়ী আমন্ত্রণ লিংক অপরিবর্তিত আছে এবং এই বন্ধুর স্লটটি আবার ব্যবহার করা যাবে।',
  pt: 'O antigo link de convite de uso único foi cancelado. Seu link de convite permanente não mudou e esta vaga está disponível novamente.',
  ru: 'Старая одноразовая ссылка-приглашение отменена. Постоянная ссылка не изменилась, и это место для друга снова доступно.',
  id: 'Tautan undangan sekali pakai lama telah dibatalkan. Tautan undangan permanenmu tetap sama dan slot teman ini tersedia lagi.',
  vi: 'Đã hủy liên kết mời dùng một lần cũ. Liên kết mời vĩnh viễn của bạn vẫn giữ nguyên và suất bạn bè này đã có thể dùng lại.',
  'zh-tw': '舊的一次性邀請連結已取消。你的永久邀請連結維持不變，這個好友名額現在可以再次使用。',
  sv: 'Den gamla engångslänken har avbrutits. Din permanenta inbjudningslänk är oförändrad och den här vänplatsen är ledig igen.',
  ro: 'Linkul vechi de invitație de unică folosință a fost anulat. Linkul tău permanent rămâne neschimbat, iar acest loc este din nou disponibil.',
  ur: 'پرانا ایک بار استعمال ہونے والا دعوتی لنک منسوخ کر دیا گیا ہے۔ آپ کا مستقل دعوتی لنک وہی رہے گا اور یہ دوست سلاٹ دوبارہ دستیاب ہے۔',
  pcm: 'We don cancel di old one-time invite link. Your permanent invite link still remain di same, and dis friend slot don free again.',
  arz: 'لينك الدعوة القديم اللي بيتستخدم مرة واحدة اتلغى. لينك دعوتك الدائم زي ما هو، والمكان ده متاح تاني.',
  mr: 'जुनी एकदाच वापरायची आमंत्रण लिंक रद्द केली आहे. तुमची कायमची आमंत्रण लिंक तशीच आहे आणि हा मित्र स्लॉट पुन्हा उपलब्ध आहे.',
  te: 'పాత ఒక్కసారి ఉపయోగించే ఆహ్వాన లింక్‌ను రద్దు చేశాం. మీ శాశ్వత ఆహ్వాన లింక్ మారదు, ఈ స్నేహితుడి స్లాట్ మళ్లీ అందుబాటులో ఉంది.',
  sw: 'Kiungo cha zamani cha mwaliko wa matumizi ya mara moja kimeghairiwa. Kiungo chako cha kudumu hakijabadilika na nafasi hii ya rafiki inapatikana tena.',
  ha: 'An soke tsohuwar mahadar gayyata ta amfani sau ɗaya. Mahadar gayyatarka ta dindindin ba ta canza ba, kuma wannan wurin aboki ya sake samuwa.',
};

for (const locale of SUPPORTED_LOCALES) {
  HOME_COPY[locale].cancelDescriptionWaiting =
    LEGACY_CANCEL_DESCRIPTION[locale];
  HOME_COPY[locale].cancelled = LEGACY_CANCEL_SUCCESS[locale];
}

// The numeric badge on Home is an active-friend count (0/2 → 2/2), not a
// remaining-capacity count. Keep the Korean heading semantically identical to
// the other reviewed locales.
REFERRAL_LINK_COPY.ko.slotsLabel = '진행 중인 친구';
REFERRAL_LINK_COPY.ko.slotsFullHelp =
  '현재 이 링크로 친구 2명이 이미 진행 중이에요. 영구 링크는 계속 유효하니 나중에 같은 링크로 다시 시도해 주세요.';