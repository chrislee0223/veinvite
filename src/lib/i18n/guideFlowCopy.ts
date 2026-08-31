import type { Locale } from './locales';

type GuideFlowCopy = {
  description: string;
  inviteDescription: string;
  countDescription: string;
};

export const GUIDE_FLOW_COPY: Record<Locale, GuideFlowCopy> = {
  en: {
    description:
      "VeInvite doesn't reward someone just for opening an invite link. The invite is completed only after your friend finishes every mission.",
    inviteDescription:
      'Only one invite can be active at a time. Once your friend completes every mission, you can invite someone else.',
    countDescription:
      'New and returning user totals include only wallets that completed every mission.',
  },
  ko: {
    description:
      'VeInvite는 초대 링크를 열기만 해서는 보상이 지급되지 않아요. 친구가 모든 미션을 완료해야 초대가 완료돼요.',
    inviteDescription:
      '초대는 한 번에 한 건만 진행할 수 있어요. 친구가 모든 미션을 완료하면 다음 친구를 초대할 수 있어요.',
    countDescription:
      '모든 미션을 완료한 지갑만 신규·복귀 사용자 수에 포함해요.',
  },
  zh: {
    description:
      'VeInvite 不会因为好友只是打开邀请链接就发放奖励。好友完成全部任务后，这次邀请才算完成。',
    inviteDescription:
      '同一时间只能有一个有效邀请。好友完成全部任务后，你就可以邀请下一位好友。',
    countDescription:
      '新用户和回归用户数据只统计完成全部任务的钱包。',
  },
  hi: {
    description:
      'सिर्फ आमंत्रण लिंक खोलने से VeInvite इनाम नहीं देता। आपका दोस्त सभी मिशन पूरे कर ले, तभी आमंत्रण पूरा माना जाता है।',
    inviteDescription:
      'एक समय में केवल एक आमंत्रण सक्रिय हो सकता है। दोस्त के सभी मिशन पूरे होते ही आप किसी और को आमंत्रित कर सकते हैं।',
    countDescription:
      'नए और वापस आने वाले उपयोगकर्ताओं में केवल वे वॉलेट गिने जाते हैं जिन्होंने सभी मिशन पूरे किए हैं।',
  },
  es: {
    description:
      'VeInvite no paga una recompensa solo por abrir un enlace de invitación. La invitación se completa cuando tu amigo termina todas las misiones.',
    inviteDescription:
      'Solo puede haber una invitación activa a la vez. Cuando tu amigo complete todas las misiones, podrás invitar a otra persona.',
    countDescription:
      'Los totales de usuarios nuevos y que regresan solo incluyen carteras que completaron todas las misiones.',
  },
  ja: {
    description:
      'VeInviteは、招待リンクを開いただけでは報酬の対象になりません。友だちがすべてのミッションを完了すると、招待完了となります。',
    inviteDescription:
      '有効にできる招待は同時に1件だけです。友だちがすべてのミッションを完了すると、次の友だちを招待できます。',
    countDescription:
      '新規・復帰ユーザー数には、すべてのミッションを完了したウォレットだけを含みます。',
  },
  it: {
    description:
      'VeInvite non assegna una ricompensa solo perché viene aperto un link di invito. L’invito si considera completato quando il tuo amico termina tutte le missioni.',
    inviteDescription:
      'Può esserci un solo invito attivo alla volta. Quando il tuo amico completa tutte le missioni, puoi invitare un’altra persona.',
    countDescription:
      'I totali dei nuovi utenti e di quelli di ritorno includono solo i wallet che hanno completato tutte le missioni.',
  },
  tr: {
    description:
      'VeInvite yalnızca davet bağlantısının açılması için ödül vermez. Arkadaşın tüm görevleri tamamladığında davet tamamlanmış sayılır.',
    inviteDescription:
      'Aynı anda yalnızca bir aktif davet olabilir. Arkadaşın tüm görevleri tamamladığında başka birini davet edebilirsin.',
    countDescription:
      'Yeni ve geri dönen kullanıcı toplamlarına yalnızca tüm görevleri tamamlayan cüzdanlar dahil edilir.',
  },
  nl: {
    description:
      'VeInvite geeft niet alleen een beloning omdat iemand een uitnodigingslink opent. De uitnodiging telt pas als je vriend alle missies heeft voltooid.',
    inviteDescription:
      'Er kan maar één uitnodiging tegelijk actief zijn. Zodra je vriend alle missies heeft voltooid, kun je iemand anders uitnodigen.',
    countDescription:
      'De totalen voor nieuwe en terugkerende gebruikers tellen alleen wallets mee die alle missies hebben voltooid.',
  },
  de: {
    description:
      'VeInvite zahlt nicht allein für das Öffnen eines Einladungslinks eine Belohnung. Die Einladung gilt erst als abgeschlossen, wenn dein Freund alle Missionen erledigt hat.',
    inviteDescription:
      'Es kann immer nur eine Einladung aktiv sein. Sobald dein Freund alle Missionen abgeschlossen hat, kannst du die nächste Person einladen.',
    countDescription:
      'Bei den neuen und zurückkehrenden Nutzern werden nur Wallets gezählt, die alle Missionen abgeschlossen haben.',
  },
  fr: {
    description:
      'VeInvite ne verse pas de récompense simplement parce qu’un lien d’invitation est ouvert. L’invitation est considérée comme terminée lorsque votre ami a terminé toutes les missions.',
    inviteDescription:
      'Une seule invitation peut être active à la fois. Lorsque votre ami a terminé toutes les missions, vous pouvez inviter une autre personne.',
    countDescription:
      'Les totaux des nouveaux utilisateurs et des utilisateurs de retour incluent uniquement les wallets ayant terminé toutes les missions.',
  },
};
