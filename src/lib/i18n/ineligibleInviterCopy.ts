import type { SupportedLocale } from './locales';

type IneligibleInviterCopy = {
  title: string;
  body: string;
};

export const INELIGIBLE_INVITER_COPY: Record<
  SupportedLocale,
  IneligibleInviterCopy
> = {
  en: {
    title: 'Your invite is available again',
    body: 'The friend who checked this invite does not currently meet VeInvite participation requirements. This invite has ended, so you can invite someone else now.',
  },
  ko: {
    title: '다른 친구를 초대할 수 있어요',
    body: '초대한 친구가 현재 VeInvite 참여 조건에 해당하지 않아 이번 초대가 종료됐어요. 이제 다른 친구를 초대할 수 있어요.',
  },
  zh: {
    title: '你现在可以邀请其他好友了',
    body: '查看此邀请的好友目前不符合 VeInvite 的参与条件，因此本次邀请已结束。你现在可以邀请其他好友。',
  },
  hi: {
    title: 'अब आप किसी और दोस्त को आमंत्रित कर सकते हैं',
    body: 'जिस दोस्त ने यह आमंत्रण जाँचा, वह अभी VeInvite की भागीदारी शर्तों को पूरा नहीं करता। यह आमंत्रण समाप्त हो गया है, इसलिए अब आप किसी और दोस्त को आमंत्रित कर सकते हैं।',
  },
  es: {
    title: 'Ya puedes invitar a otra persona',
    body: 'La persona que revisó esta invitación no cumple actualmente los requisitos de participación de VeInvite. Esta invitación ha finalizado, así que ya puedes invitar a otra persona.',
  },
  ja: {
    title: '別の友だちを招待できます',
    body: 'この招待を確認した友だちは現在 VeInvite の参加条件を満たしていないため、この招待は終了しました。別の友だちを招待できます。',
  },
  it: {
    title: 'Ora puoi invitare un’altra persona',
    body: 'La persona che ha verificato questo invito non soddisfa attualmente i requisiti di partecipazione di VeInvite. L’invito è terminato, quindi ora puoi invitare un’altra persona.',
  },
  tr: {
    title: 'Artık başka bir arkadaşını davet edebilirsin',
    body: 'Bu daveti kontrol eden arkadaşın şu anda VeInvite katılım koşullarını karşılamıyor. Bu davet sona erdi; artık başka bir arkadaşını davet edebilirsin.',
  },
  nl: {
    title: 'Je kunt nu iemand anders uitnodigen',
    body: 'De persoon die deze uitnodiging heeft gecontroleerd voldoet momenteel niet aan de deelnamevoorwaarden van VeInvite. Deze uitnodiging is beëindigd, dus je kunt nu iemand anders uitnodigen.',
  },
  de: {
    title: 'Du kannst jetzt jemand anderen einladen',
    body: 'Die Person, die diese Einladung geprüft hat, erfüllt derzeit nicht die Teilnahmebedingungen von VeInvite. Diese Einladung wurde beendet, daher kannst du jetzt jemand anderen einladen.',
  },
  fr: {
    title: 'Vous pouvez maintenant inviter une autre personne',
    body: 'La personne qui a vérifié cette invitation ne remplit actuellement pas les conditions de participation à VeInvite. Cette invitation est terminée, vous pouvez donc inviter une autre personne.',
  },
  ar: {
    title: 'يمكنك الآن دعوة شخص آخر',
    body: 'الشخص الذي تحقّق من هذه الدعوة لا يستوفي حاليًا شروط المشاركة في VeInvite. تم إنهاء هذه الدعوة، ويمكنك الآن دعوة شخص آخر.',
  },
  bn: {
    title: 'এখন আপনি অন্য একজন বন্ধুকে আমন্ত্রণ জানাতে পারেন',
    body: 'যে বন্ধু এই আমন্ত্রণটি যাচাই করেছেন, তিনি বর্তমানে VeInvite-এর অংশগ্রহণের শর্ত পূরণ করেন না। এই আমন্ত্রণটি শেষ হয়েছে, তাই এখন আপনি অন্য একজন বন্ধুকে আমন্ত্রণ জানাতে পারেন।',
  },
  pt: {
    title: 'Agora você pode convidar outra pessoa',
    body: 'A pessoa que verificou este convite não atende atualmente aos requisitos de participação do VeInvite. Este convite foi encerrado, então agora você pode convidar outra pessoa.',
  },
  ru: {
    title: 'Теперь можно пригласить другого человека',
    body: 'Человек, который проверил это приглашение, сейчас не соответствует условиям участия в VeInvite. Это приглашение завершено, поэтому теперь можно пригласить другого человека.',
  },
  id: {
    title: 'Sekarang kamu bisa mengundang teman lain',
    body: 'Teman yang memeriksa undangan ini saat ini belum memenuhi persyaratan VeInvite. Undangan ini telah berakhir, jadi sekarang kamu bisa mengundang teman lain.',
  },
  vi: {
    title: 'Bạn có thể mời một người bạn khác',
    body: 'Người bạn đã kiểm tra lời mời này hiện chưa đáp ứng điều kiện tham gia VeInvite. Lời mời này đã kết thúc, vì vậy bạn có thể mời một người bạn khác ngay bây giờ.',
  },
  'zh-tw': {
    title: '你現在可以邀請其他朋友了',
    body: '查看此邀請的朋友目前不符合 VeInvite 的參與條件，因此這次邀請已結束。你現在可以邀請其他朋友。',
  },
  sv: {
    title: 'Du kan nu bjuda in någon annan',
    body: 'Personen som kontrollerade den här inbjudan uppfyller inte VeInvites deltagarkrav just nu. Inbjudan har avslutats, så du kan nu bjuda in någon annan.',
  },
  ro: {
    title: 'Acum poți invita pe altcineva',
    body: 'Persoana care a verificat această invitație nu îndeplinește în prezent condițiile de participare VeInvite. Invitația s-a încheiat, așa că acum poți invita pe altcineva.',
  },
  ur: {
    title: 'اب آپ کسی اور دوست کو دعوت دے سکتے ہیں',
    body: 'جس دوست نے اس دعوت کو چیک کیا وہ فی الحال VeInvite کی شرکت کی شرائط پوری نہیں کرتا۔ یہ دعوت ختم ہو گئی ہے، اس لیے اب آپ کسی اور دوست کو دعوت دے سکتے ہیں۔',
  },
  pcm: {
    title: 'You fit invite another person now',
    body: 'The person wey check this invite no meet VeInvite participation condition for now. This invite don end, so you fit invite another person now.',
  },
  arz: {
    title: 'تقدر دلوقتي تعزم شخص تاني',
    body: 'الشخص اللي راجع الدعوة دي مش مستوفي حاليًا شروط المشاركة في VeInvite. الدعوة دي انتهت، وتقدر دلوقتي تعزم شخص تاني.',
  },
  mr: {
    title: 'आता तुम्ही दुसऱ्या मित्राला आमंत्रित करू शकता',
    body: 'ज्या मित्राने हे आमंत्रण तपासले तो सध्या VeInvite च्या सहभागाच्या अटी पूर्ण करत नाही. हे आमंत्रण संपले आहे, त्यामुळे आता तुम्ही दुसऱ्या मित्राला आमंत्रित करू शकता.',
  },
  te: {
    title: 'ఇప్పుడు మీరు మరో స్నేహితుడిని ఆహ్వానించవచ్చు',
    body: 'ఈ ఆహ్వానాన్ని తనిఖీ చేసిన స్నేహితుడు ప్రస్తుతం VeInvite పాల్గొనే అర్హతలను పూర్తి చేయడం లేదు. ఈ ఆహ్వానం ముగిసింది, కాబట్టి ఇప్పుడు మీరు మరో స్నేహితుడిని ఆహ్వానించవచ్చు.',
  },
  sw: {
    title: 'Sasa unaweza kumwalika rafiki mwingine',
    body: 'Rafiki aliyekagua mwaliko huu kwa sasa hatimizi masharti ya kushiriki VeInvite. Mwaliko huu umefungwa, kwa hiyo sasa unaweza kumwalika rafiki mwingine.',
  },
  ha: {
    title: 'Yanzu za ka iya gayyatar wani aboki',
    body: 'Abokin da ya duba wannan gayyata bai cika sharuddan shiga VeInvite a halin yanzu ba. An rufe wannan gayyatar, don haka yanzu za ka iya gayyatar wani aboki.',
  },
};
