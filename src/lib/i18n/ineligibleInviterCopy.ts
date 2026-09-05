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
    body: 'Your friend does not currently meet VeInvite participation requirements, so this invite has ended.',
  },
  ko: {
    title: '다른 친구를 초대할 수 있어요',
    body: '초대한 친구가 현재 VeInvite 참여 조건에 해당하지 않아 이번 초대가 종료됐어요.',
  },
  zh: {
    title: '你现在可以邀请其他好友了',
    body: '你邀请的好友目前不符合 VeInvite 的参与条件，因此本次邀请已结束。',
  },
  hi: {
    title: 'अब आप किसी और दोस्त को आमंत्रित कर सकते हैं',
    body: 'आपका दोस्त अभी VeInvite की भागीदारी शर्तों को पूरा नहीं करता, इसलिए यह आमंत्रण समाप्त हो गया है।',
  },
  es: {
    title: 'Ya puedes invitar a otra persona',
    body: 'La persona que invitaste no cumple actualmente los requisitos de VeInvite, así que esta invitación ha finalizado.',
  },
  ja: {
    title: '別の友だちを招待できます',
    body: '招待した友だちは現在 VeInvite の参加条件を満たしていないため、この招待は終了しました。',
  },
  it: {
    title: 'Ora puoi invitare un’altra persona',
    body: 'La persona che hai invitato non soddisfa attualmente i requisiti di VeInvite, quindi questo invito è terminato.',
  },
  tr: {
    title: 'Artık başka bir arkadaşını davet edebilirsin',
    body: 'Davet ettiğin arkadaşın şu anda VeInvite katılım koşullarını karşılamadığı için bu davet sona erdi.',
  },
  nl: {
    title: 'Je kunt nu iemand anders uitnodigen',
    body: 'De persoon die je hebt uitgenodigd voldoet momenteel niet aan de voorwaarden van VeInvite, dus deze uitnodiging is beëindigd.',
  },
  de: {
    title: 'Du kannst jetzt jemand anderen einladen',
    body: 'Die eingeladene Person erfüllt derzeit nicht die Teilnahmebedingungen von VeInvite, daher wurde diese Einladung beendet.',
  },
  fr: {
    title: 'Vous pouvez maintenant inviter une autre personne',
    body: 'La personne invitée ne remplit actuellement pas les conditions de VeInvite, cette invitation est donc terminée.',
  },
  ar: {
    title: 'يمكنك الآن دعوة شخص آخر',
    body: 'الشخص الذي دعوته لا يستوفي حاليًا شروط VeInvite، لذلك انتهت هذه الدعوة.',
  },
  bn: {
    title: 'এখন আপনি অন্য একজন বন্ধুকে আমন্ত্রণ জানাতে পারেন',
    body: 'আপনার আমন্ত্রিত বন্ধু বর্তমানে VeInvite-এর শর্ত পূরণ করেন না, তাই এই আমন্ত্রণটি শেষ হয়েছে।',
  },
  pt: {
    title: 'Agora você pode convidar outra pessoa',
    body: 'A pessoa que você convidou não atende atualmente aos requisitos do VeInvite, por isso este convite foi encerrado.',
  },
  ru: {
    title: 'Теперь можно пригласить другого человека',
    body: 'Приглашённый вами человек сейчас не соответствует условиям VeInvite, поэтому это приглашение завершено.',
  },
  id: {
    title: 'Sekarang kamu bisa mengundang teman lain',
    body: 'Teman yang kamu undang saat ini belum memenuhi persyaratan VeInvite, jadi undangan ini telah berakhir.',
  },
  vi: {
    title: 'Bạn có thể mời một người bạn khác',
    body: 'Người bạn bạn mời hiện chưa đáp ứng điều kiện của VeInvite, vì vậy lời mời này đã kết thúc.',
  },
  'zh-tw': {
    title: '你現在可以邀請其他朋友了',
    body: '你邀請的朋友目前不符合 VeInvite 的參與條件，因此這次邀請已結束。',
  },
  sv: {
    title: 'Du kan nu bjuda in någon annan',
    body: 'Personen du bjöd in uppfyller inte VeInvites villkor just nu, så inbjudan har avslutats.',
  },
  ro: {
    title: 'Acum poți invita pe altcineva',
    body: 'Persoana invitată nu îndeplinește în prezent condițiile VeInvite, așa că invitația s-a încheiat.',
  },
  ur: {
    title: 'اب آپ کسی اور دوست کو دعوت دے سکتے ہیں',
    body: 'آپ کا مدعو دوست فی الحال VeInvite کی شرائط پوری نہیں کرتا، اس لیے یہ دعوت ختم ہو گئی ہے۔',
  },
  pcm: {
    title: 'You fit invite another person now',
    body: 'The person wey you invite no meet VeInvite condition for now, so this invite don end.',
  },
  arz: {
    title: 'تقدر دلوقتي تعزم شخص تاني',
    body: 'الشخص اللي عزمته مش مستوفي شروط VeInvite دلوقتي، عشان كده الدعوة دي انتهت.',
  },
  mr: {
    title: 'आता तुम्ही दुसऱ्या मित्राला आमंत्रित करू शकता',
    body: 'तुम्ही आमंत्रित केलेली व्यक्ती सध्या VeInvite च्या अटी पूर्ण करत नाही, त्यामुळे हे आमंत्रण संपले आहे.',
  },
  te: {
    title: 'ఇప్పుడు మీరు మరో స్నేహితుడిని ఆహ్వానించవచ్చు',
    body: 'మీరు ఆహ్వానించిన వ్యక్తి ప్రస్తుతం VeInvite అర్హతలను పూర్తి చేయడం లేదు, అందువల్ల ఈ ఆహ్వానం ముగిసింది.',
  },
  sw: {
    title: 'Sasa unaweza kumwalika rafiki mwingine',
    body: 'Rafiki uliyemwalika kwa sasa hatimizi masharti ya VeInvite, kwa hiyo mwaliko huu umefungwa.',
  },
  ha: {
    title: 'Yanzu za ka iya gayyatar wani aboki',
    body: 'Abokin da ka gayyata bai cika sharuddan VeInvite a yanzu ba, don haka an rufe wannan gayyatar.',
  },
  el: {
    title: 'Μπορείς τώρα να προσκαλέσεις κάποιον άλλο',
    body: 'Ο φίλος που προσκάλεσες δεν πληροί αυτή τη στιγμή τις προϋποθέσεις συμμετοχής του VeInvite, οπότε αυτή η πρόσκληση ολοκληρώθηκε.',
  },
};