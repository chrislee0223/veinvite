import type { Locale } from './locales';

type GuideFlowCopy = {
  description: string;
  inviteDescription: string;
  countDescription: string;
};

export const GUIDE_FLOW_COPY: Record<Locale, GuideFlowCopy> = {
  en: {
    description:
      "VeInvite doesn't reward a link click. A referral counts only after your friend completes every mission.",
    inviteDescription:
      'Only one invite can be active at a time. Once your friend completes every mission, you can invite someone else.',
    countDescription:
      'New and returning user totals include only wallets that finished every mission.',
  },
  ko: {
    description:
      'VeInvite는 링크만 열었다고 보상을 주지 않아요. 친구가 모든 미션을 완료해야 초대가 완료돼요.',
    inviteDescription:
      '한 번에 초대 한 건만 진행할 수 있어요. 친구가 모든 미션을 완료하면 다음 친구를 초대할 수 있어요.',
    countDescription:
      '모든 미션을 완료한 지갑만 신규·복귀 사용자 수에 포함해요.',
  },
  zh: {
    description:
      'VeInvite 不会因为点开邀请链接就发放奖励。好友完成全部任务后，这次邀请才算完成。',
    inviteDescription:
      '同一时间只能有一个有效邀请。好友完成全部任务后，你就可以邀请下一位好友。',
    countDescription:
      '新用户和回归用户数据只统计完成全部任务的钱包。',
  },
  hi: {
    description:
      'सिर्फ लिंक खोलने पर VeInvite इनाम नहीं देता। रेफ़रल तभी पूरा माना जाता है जब आपका दोस्त सभी मिशन पूरे कर ले।',
    inviteDescription:
      'एक समय में केवल एक सक्रिय आमंत्रण हो सकता है। दोस्त के सभी मिशन पूरे होते ही आप किसी और को आमंत्रित कर सकते हैं।',
    countDescription:
      'नए और वापस आने वाले उपयोगकर्ताओं में केवल वे वॉलेट गिने जाते हैं जिन्होंने सभी मिशन पूरे किए हैं।',
  },
  es: {
    description:
      'VeInvite no recompensa por abrir un enlace. La invitación solo cuenta cuando tu amigo completa todas las misiones.',
    inviteDescription:
      'Solo puede haber una invitación activa a la vez. Cuando tu amigo complete todas las misiones, podrás invitar a otra persona.',
    countDescription:
      'Los totales de usuarios nuevos y que regresan solo incluyen carteras que completaron todas las misiones.',
  },
  ja: {
    description:
      'VeInviteは、リンクを開いただけでは報酬の対象になりません。友だちがすべてのミッションを完了して初めて招待完了となります。',
    inviteDescription:
      '有効にできる招待は同時に1件だけです。友だちがすべてのミッションを完了すると、次の友だちを招待できます。',
    countDescription:
      '新規・復帰ユーザー数には、すべてのミッションを完了したウォレットだけを含みます。',
  },
  it: {
    description:
      'VeInvite non premia il semplice clic su un link. Un invito conta solo quando il tuo amico completa tutte le missioni.',
    inviteDescription:
      'Può esserci un solo invito attivo alla volta. Quando il tuo amico completa tutte le missioni, puoi invitare un’altra persona.',
    countDescription:
      'I totali dei nuovi utenti e di quelli di ritorno includono solo i wallet che hanno completato tutte le missioni.',
  },
  tr: {
    description:
      'VeInvite yalnızca davet bağlantısının açılması için ödül vermez. Davet, arkadaşın tüm görevleri tamamladığında tamamlanmış sayılır.',
    inviteDescription:
      'Aynı anda yalnızca bir aktif davet olabilir. Arkadaşın tüm görevleri tamamladığında başka birini davet edebilirsin.',
    countDescription:
      'Yeni ve geri dönen kullanıcı toplamlarına yalnızca tüm görevleri tamamlayan cüzdanlar dahil edilir.',
  },
  nl: {
    description:
      'VeInvite beloont niet alleen het openen van een link. Een uitnodiging telt pas wanneer je vriend alle missies heeft voltooid.',
    inviteDescription:
      'Er kan maar één uitnodiging tegelijk actief zijn. Zodra je vriend alle missies heeft voltooid, kun je iemand anders uitnodigen.',
    countDescription:
      'De totalen voor nieuwe en terugkerende gebruikers tellen alleen wallets mee die alle missies hebben voltooid.',
  },
  de: {
    description:
      'VeInvite belohnt nicht das bloße Öffnen eines Links. Eine Einladung zählt erst, wenn dein Freund alle Missionen abgeschlossen hat.',
    inviteDescription:
      'Es kann immer nur eine Einladung aktiv sein. Sobald dein Freund alle Missionen abgeschlossen hat, kannst du die nächste Person einladen.',
    countDescription:
      'Bei den neuen und zurückkehrenden Nutzern werden nur Wallets gezählt, die alle Missionen abgeschlossen haben.',
  },
  fr: {
    description:
      'VeInvite ne récompense pas le simple fait d’ouvrir un lien. Une invitation ne compte qu’une fois que votre ami a terminé toutes les missions.',
    inviteDescription:
      'Une seule invitation peut être active à la fois. Lorsque votre ami a terminé toutes les missions, vous pouvez inviter une autre personne.',
    countDescription:
      'Les totaux des nouveaux utilisateurs et des utilisateurs de retour incluent uniquement les wallets ayant terminé toutes les missions.',
  },
};