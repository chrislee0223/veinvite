import { GUIDE_FLOW_COPY } from './guideFlowCopy';
import { GUIDE_REWARD_STEP_COPY } from './guideRewardStepCopy';
import { LEADERBOARD_COPY } from './leaderboardCopy';
import type { SupportedLocale } from './locales';

type GuideNaturalnessPatch = {
  inviteDescription?: string;
  rewardDescription?: string;
};

// Small, language-specific phrasing fixes that keep the finalized product
// policy unchanged while removing literal "completed friend / friend's slot"
// constructions that sound machine-translated in several locales.
const GUIDE_NATURALNESS_PATCHES: Partial<
  Record<SupportedLocale, GuideNaturalnessPatch>
> = {
  en: {
    rewardDescription:
      "Once your friend's invitation is completed and qualifies for a reward, VeInvite pays the reward automatically through the payout process. The slot they used then opens again so you can invite someone new.",
  },
  ko: {
    rewardDescription:
      '친구의 초대가 완료되어 보상 대상이 되면 VeInvite가 지급 절차에 따라 보상을 자동으로 지급해요. 미션을 완료한 친구가 사용하던 슬롯은 다시 열려 새로운 친구를 초대할 수 있어요.',
  },
  es: {
    rewardDescription:
      'Cuando tu amigo completa la invitación y cumple los requisitos para recibir la recompensa, VeInvite la paga automáticamente siguiendo el proceso de distribución. El cupo que ocupaba ese amigo vuelve a quedar libre para que puedas invitar a otra persona.',
  },
  ja: {
    rewardDescription:
      '友だちの招待が完了して報酬対象になると、VeInviteが支払い手続きに沿って報酬を自動で支払います。友だちが使っていた枠は再び空き、新しい友だちを招待できます。',
  },
  it: {
    inviteDescription:
      'Hai 1 link di invito permanente e 2 posti riutilizzabili. Possono partecipare contemporaneamente fino a 2 amici idonei e la sola apertura del link non occupa alcun posto.',
    rewardDescription:
      'Quando il tuo amico completa l’invito e risulta idoneo alla ricompensa, VeInvite effettua automaticamente il pagamento secondo il processo di distribuzione. Il posto usato da quell’amico torna disponibile, così puoi invitare un’altra persona.',
  },
  tr: {
    rewardDescription:
      'Arkadaşının daveti tamamlanıp ödüle uygun olduğunda VeInvite ödülü ödeme sürecine göre otomatik olarak gönderir. Arkadaşının kullandığı yuva yeniden açılır ve yeni birini davet edebilirsin.',
  },
  nl: {
    rewardDescription:
      'Zodra je vriend de uitnodiging heeft voltooid en voor een beloning in aanmerking komt, betaalt VeInvite de beloning automatisch uit via het uitbetalingsproces. De plek die je vriend gebruikte komt weer vrij, zodat je iemand anders kunt uitnodigen.',
  },
  de: {
    inviteDescription:
      'Du hast 1 permanenten Einladungslink und 2 wiederverwendbare Plätze für Freunde. Bis zu 2 berechtigte Freunde können gleichzeitig teilnehmen; nur das Öffnen des Links belegt keinen Platz.',
    rewardDescription:
      'Sobald dein Freund die Einladung abgeschlossen hat und für eine Belohnung berechtigt ist, zahlt VeInvite die Belohnung automatisch über den Auszahlungsprozess aus. Der dafür belegte Platz wird anschließend wieder frei, sodass du jemand Neues einladen kannst.',
  },
  fr: {
    inviteDescription:
      'Vous disposez d’un lien d’invitation permanent et de 2 places réutilisables. Jusqu’à 2 amis éligibles peuvent avancer en même temps, et le simple fait d’ouvrir le lien n’occupe aucune place.',
    rewardDescription:
      'Lorsque votre ami termine l’invitation et devient éligible à une récompense, VeInvite verse automatiquement la récompense selon le processus de paiement. La place qu’il utilisait se libère ensuite pour vous permettre d’inviter une nouvelle personne.',
  },
  bn: {
    rewardDescription:
      'আপনার বন্ধুর আমন্ত্রণ সম্পন্ন হয়ে পুরস্কারের যোগ্য হলে, VeInvite পেমেন্ট প্রক্রিয়া অনুযায়ী পুরস্কার স্বয়ংক্রিয়ভাবে দেয়। বন্ধু যে স্লটটি ব্যবহার করেছিল সেটি আবার খালি হয়, তাই আপনি নতুন কাউকে আমন্ত্রণ জানাতে পারবেন।',
  },
  pt: {
    rewardDescription:
      'Quando o convite do seu amigo é concluído e fica elegível à recompensa, o VeInvite faz o pagamento automaticamente de acordo com o processo de distribuição. A vaga usada por esse amigo fica disponível novamente para você convidar outra pessoa.',
  },
  id: {
    rewardDescription:
      'Setelah temanmu menyelesaikan undangan dan memenuhi syarat reward, VeInvite membayar reward secara otomatis melalui proses pembayaran. Slot yang digunakan temanmu akan tersedia lagi sehingga kamu bisa mengundang orang lain.',
  },
  vi: {
    inviteDescription:
      'Bạn có 1 liên kết mời vĩnh viễn và 2 suất mời bạn có thể tái sử dụng. Tối đa 2 người bạn đủ điều kiện có thể tham gia cùng lúc; chỉ mở liên kết sẽ không chiếm suất.',
    rewardDescription:
      'Khi người bạn được mời hoàn thành mọi yêu cầu và đủ điều kiện nhận thưởng, VeInvite sẽ tự động trả thưởng theo quy trình chi trả. Suất đã dùng sẽ được mở lại để bạn có thể mời người mới.',
  },
  sv: {
    rewardDescription:
      'När din vän har slutfört inbjudan och har rätt till belöning betalar VeInvite ut den automatiskt enligt utbetalningsprocessen. Platsen som vännen använde blir sedan ledig igen så att du kan bjuda in någon ny.',
  },
  ro: {
    rewardDescription:
      'Când prietenul tău finalizează invitația și devine eligibil pentru recompensă, VeInvite plătește recompensa automat conform procesului de distribuție. Locul pe care l-a folosit devine apoi disponibil din nou pentru o altă invitație.',
  },
  ur: {
    rewardDescription:
      'جب آپ کا دوست دعوت مکمل کر لے اور انعام کا اہل ہو جائے تو VeInvite ادائیگی کے عمل کے مطابق انعام خودکار طور پر ادا کرتا ہے۔ دوست کے استعمال کردہ سلاٹ کو دوبارہ خالی کر دیا جاتا ہے تاکہ آپ کسی نئے دوست کو دعوت دے سکیں۔',
  },
  mr: {
    rewardDescription:
      'तुमच्या मित्राचे आमंत्रण पूर्ण होऊन तो बक्षिसासाठी पात्र झाल्यावर VeInvite देयक प्रक्रियेनुसार बक्षीस आपोआप देते. मित्राने वापरलेला स्लॉट पुन्हा मोकळा होतो, त्यामुळे तुम्ही नवीन मित्राला आमंत्रित करू शकता.',
  },
  te: {
    rewardDescription:
      'మీ స్నేహితుడు ఆహ్వానాన్ని పూర్తి చేసి రివార్డ్‌కు అర్హత సాధించిన తర్వాత, VeInvite చెల్లింపు ప్రక్రియ ప్రకారం రివార్డ్‌ను ఆటోమేటిక్‌గా చెల్లిస్తుంది. అతను ఉపయోగించిన స్లాట్ మళ్లీ ఖాళీ అవుతుంది, కాబట్టి మీరు కొత్త స్నేహితుడిని ఆహ్వానించవచ్చు.',
  },
  sw: {
    rewardDescription:
      'Mwaliko wa rafiki yako ukikamilika na kustahiki zawadi, VeInvite inalipa zawadi kiotomatiki kulingana na mchakato wa malipo. Nafasi aliyotumia rafiki yako inakuwa wazi tena ili uweze kumwalika mtu mwingine.',
  },
  ha: {
    rewardDescription:
      'Da zarar abokinka ya kammala gayyata kuma ta cancanci lada, VeInvite zai bi tsarin biyan kuɗi ya biya ladan ta atomatik. Wurin da abokinka ya yi amfani da shi zai sake samuwa domin ka gayyaci wani sabon aboki.',
  },
};

for (const [locale, patch] of Object.entries(GUIDE_NATURALNESS_PATCHES) as Array<
  [SupportedLocale, GuideNaturalnessPatch]
>) {
  if (patch.inviteDescription) {
    GUIDE_FLOW_COPY[locale].inviteDescription = patch.inviteDescription;
  }
  if (patch.rewardDescription) {
    GUIDE_REWARD_STEP_COPY[locale].description = patch.rewardDescription;
  }
}

// The German mobile leaderboard has a deliberately narrow reward column.
// "Gesamtbelohnungen" is correct but cannot wrap naturally as a single long
// word, so use the shorter native label without changing its meaning.
LEADERBOARD_COPY.de.earned = 'Belohnungen';
