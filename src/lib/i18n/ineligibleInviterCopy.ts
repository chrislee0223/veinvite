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
    title: 'You can invite someone else now',
    body: 'The friend you invited does not currently meet VeInvite participation requirements, so this invite has ended. You can invite someone else now.',
  },
  ko: {
    title: '다른 친구를 초대할 수 있어요',
    body: '초대한 친구가 현재 VeInvite 참여 조건에 해당하지 않아 이번 초대가 종료됐어요. 이제 다른 친구를 초대할 수 있어요.',
  },
  zh: {
    title: '你现在可以邀请其他好友了',
    body: '你邀请的好友目前不符合 VeInvite 的参与条件，因此本次邀请已结束。你现在可以邀请其他好友。',
  },
  hi: {
    title: 'अब आप किसी और दोस्त को आमंत्रित कर सकते हैं',
    body: 'आपने जिस दोस्त को आमंत्रित किया है, वह अभी VeInvite की भागीदारी शर्तों को पूरा नहीं करता। इसलिए यह आमंत्रण समाप्त हो गया है और अब आप किसी और दोस्त को आमंत्रित कर सकते हैं।',
  },
  es: {
    title: 'Ya puedes invitar a otra persona',
    body: 'La persona que invitaste no cumple actualmente los requisitos de participación de VeInvite, así que esta invitación ha finalizado. Ya puedes invitar a otra persona.',
  },
  ja: {
    title: '別の友だちを招待できます',
    body: '招待した友だちは現在 VeInvite の参加条件を満たしていないため、この招待は終了しました。別の友だちを招待できます。',
  },
  it: {
    title: 'Ora puoi invitare un’altra persona',
    body: 'La persona che hai invitato non soddisfa attualmente i requisiti di partecipazione di VeInvite, quindi questo invito è terminato. Ora puoi invitare un’altra persona.',
  },
  tr: {
    title: 'Artık başka bir arkadaşını davet edebilirsin',
    body: 'Davet ettiğin arkadaşın şu anda VeInvite katılım koşullarını karşılamıyor. Bu nedenle bu davet sona erdi ve artık başka bir arkadaşını davet edebilirsin.',
  },
  nl: {
    title: 'Je kunt nu iemand anders uitnodigen',
    body: 'De persoon die je hebt uitgenodigd voldoet momenteel niet aan de deelnamevoorwaarden van VeInvite. Daarom is deze uitnodiging beëindigd en kun je nu iemand anders uitnodigen.',
  },
  de: {
    title: 'Du kannst jetzt jemand anderen einladen',
    body: 'Die von dir eingeladene Person erfüllt derzeit nicht die Teilnahmebedingungen von VeInvite. Deshalb wurde diese Einladung beendet und du kannst jetzt jemand anderen einladen.',
  },
  fr: {
    title: 'Vous pouvez maintenant inviter une autre personne',
    body: 'La personne que vous avez invitée ne remplit actuellement pas les conditions de participation à VeInvite. Cette invitation est donc terminée et vous pouvez maintenant inviter une autre personne.',
  },
  ar: {
    title: 'يمكنك الآن دعوة شخص آخر',
    body: 'الشخص الذي دعوته لا يستوفي حاليًا شروط المشاركة في VeInvite، لذلك انتهت هذه الدعوة. يمكنك الآن دعوة شخص آخر.',
  },
  bn: {
    title: 'এখন আপনি অন্য একজন বন্ধুকে আমন্ত্রণ জানাতে পারেন',
    body: 'আপনি যে বন্ধুকে আমন্ত্রণ জানিয়েছেন, তিনি বর্তমানে VeInvite-এর অংশগ্রহণের শর্ত পূরণ করেন না। তাই এই আমন্ত্রণটি শেষ হয়েছে এবং এখন আপনি অন্য একজন বন্ধুকে আমন্ত্রণ জানাতে পারেন।',
  },
  pt: {
    title: 'Agora você pode convidar outra pessoa',
    body: 'A pessoa que você convidou não atende atualmente aos requisitos de participação do VeInvite. Por isso, este convite foi encerrado e agora você pode convidar outra pessoa.',
  },
  ru: {
    title: 'Теперь можно пригласить другого человека',
    body: 'Приглашённый вами человек сейчас не соответствует условиям участия в VeInvite. Поэтому это приглашение завершено, и теперь можно пригласить другого человека.',
  },
  id: {
    title: 'Sekarang kamu bisa mengundang teman lain',
    body: 'Teman yang kamu undang saat ini belum memenuhi persyaratan VeInvite. Karena itu, undangan ini telah berakhir dan sekarang kamu bisa mengundang teman lain.',
  },
  vi: {
    title: 'Bạn có thể mời một người bạn khác',
    body: 'Người bạn mà bạn đã mời hiện chưa đáp ứng điều kiện tham gia VeInvite. Vì vậy, lời mời này đã kết thúc và bạn có thể mời một người bạn khác ngay bây giờ.',
  },
  'zh-tw': {
    title: '你現在可以邀請其他朋友了',
    body: '你邀請的朋友目前不符合 VeInvite 的參與條件，因此這次邀請已結束。你現在可以邀請其他朋友。',
  },
  sv: {
    title: 'Du kan nu bjuda in någon annan',
    body: 'Personen du bjöd in uppfyller inte VeInvites deltagarkrav just nu. Därför har inbjudan avslutats och du kan nu bjuda in någon annan.',
  },
  ro: {
    title: 'Acum poți invita pe altcineva',
    body: 'Persoana pe care ai invitat-o nu îndeplinește în prezent condițiile de participare VeInvite. Invitația s-a încheiat, așa că acum poți invita pe altcineva.',
  },
  ur: {
    title: 'اب آپ کسی اور دوست کو دعوت دے سکتے ہیں',
    body: 'جس دوست کو آپ نے دعوت دی ہے وہ فی الحال VeInvite کی شرکت کی شرائط پوری نہیں کرتا۔ اس لیے یہ دعوت ختم ہو گئی ہے اور اب آپ کسی اور دوست کو دعوت دے سکتے ہیں۔',
  },
  pcm: {
    title: 'You fit invite another person now',
    body: 'The person wey you invite no meet VeInvite participation condition for now. This invite don end, so you fit invite another person now.',
  },
  arz: {
    title: 'تقدر دلوقتي تعزم شخص تاني',
    body: 'الشخص اللي عزمته مش مستوفي حاليًا شروط المشاركة في VeInvite، عشان كده الدعوة دي انتهت. تقدر دلوقتي تعزم شخص تاني.',
  },
  mr: {
    title: 'आता तुम्ही दुसऱ्या मित्राला आमंत्रित करू शकता',
    body: 'तुम्ही आमंत्रित केलेली व्यक्ती सध्या VeInvite च्या सहभागाच्या अटी पूर्ण करत नाही. त्यामुळे हे आमंत्रण संपले आहे आणि आता तुम्ही दुसऱ्या व्यक्तीला आमंत्रित करू शकता.',
  },
  te: {
    title: 'ఇప్పుడు మీరు మరో స్నేహితుడిని ఆహ్వానించవచ్చు',
    body: 'మీరు ఆహ్వానించిన వ్యక్తి ప్రస్తుతం VeInvite పాల్గొనే అర్హతలను పూర్తి చేయడం లేదు. అందువల్ల ఈ ఆహ్వానం ముగిసింది, ఇప్పుడు మీరు మరో వ్యక్తిని ఆహ్వానించవచ్చు.',
  },
  sw: {
    title: 'Sasa unaweza kumwalika rafiki mwingine',
    body: 'Rafiki uliyemwalika kwa sasa hatimizi masharti ya kushiriki VeInvite. Kwa hiyo mwaliko huu umefungwa, na sasa unaweza kumwalika rafiki mwingine.',
  },
  ha: {
    title: 'Yanzu za ka iya gayyatar wani aboki',
    body: 'Abokin da ka gayyata bai cika sharuddan shiga VeInvite a halin yanzu ba. Saboda haka an rufe wannan gayyatar, kuma yanzu za ka iya gayyatar wani aboki.',
  },
};