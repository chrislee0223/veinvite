import type { Locale } from './locales';

type GuideRewardStepCopy = {
  title: string;
  description: string;
};

export const GUIDE_REWARD_STEP_COPY: Record<Locale, GuideRewardStepCopy> = {
  en: {
    title: 'Reward is sent automatically after the missions',
    description:
      'When your friend completes all missions and the invitation is eligible, VeInvite sends your reward automatically. No claim is needed.',
  },
  ko: {
    title: '미션 완료 후 보상 자동 지급',
    description:
      '친구가 모든 미션을 완료하고 초대가 보상 대상이 되면 VeInvite가 보상을 자동으로 지급해요. 따로 신청할 필요가 없어요.',
  },
  zh: {
    title: '完成任务后自动发放奖励',
    description:
      '好友完成全部任务且邀请符合奖励条件后，VeInvite 会自动发放奖励，无需手动领取。',
  },
  hi: {
    title: 'मिशन पूरे होने के बाद इनाम अपने-आप मिलेगा',
    description:
      'जब आपका दोस्त सभी मिशन पूरे कर लेता है और आमंत्रण इनाम के लिए पात्र होता है, VeInvite इनाम अपने-आप भेज देता है। अलग से क्लेम करने की जरूरत नहीं है।',
  },
  es: {
    title: 'La recompensa se envía automáticamente al completar las misiones',
    description:
      'Cuando tu amigo completa todas las misiones y la invitación cumple los requisitos, VeInvite envía la recompensa automáticamente. No tienes que solicitarla.',
  },
  ja: {
    title: 'ミッション完了後、報酬は自動で支払われます',
    description:
      '友だちがすべてのミッションを完了し、招待が報酬対象になると、VeInviteから報酬が自動で支払われます。受け取り申請は不要です。',
  },
  it: {
    title: 'La ricompensa viene inviata automaticamente dopo le missioni',
    description:
      'Quando il tuo amico completa tutte le missioni e l’invito risulta idoneo, VeInvite invia automaticamente la ricompensa. Non serve richiederla.',
  },
  tr: {
    title: 'Görevler tamamlanınca ödül otomatik gönderilir',
    description:
      'Arkadaşın tüm görevleri tamamladığında ve davet ödüle uygun olduğunda VeInvite ödülü otomatik olarak gönderir. Ayrı bir talep gerekmez.',
  },
  nl: {
    title: 'Je beloning wordt automatisch verstuurd na de missies',
    description:
      'Zodra je vriend alle missies heeft voltooid en de uitnodiging aan de voorwaarden voldoet, stuurt VeInvite je beloning automatisch. Je hoeft niets te claimen.',
  },
  de: {
    title: 'Die Belohnung wird nach den Missionen automatisch ausgezahlt',
    description:
      'Sobald dein Freund alle Missionen abgeschlossen hat und die Einladung die Voraussetzungen erfüllt, zahlt VeInvite die Belohnung automatisch aus. Ein separater Antrag ist nicht nötig.',
  },
  fr: {
    title: 'La récompense est envoyée automatiquement après les missions',
    description:
      'Lorsque votre ami a terminé toutes les missions et que l’invitation est éligible, VeInvite envoie automatiquement la récompense. Aucune demande n’est nécessaire.',
  },
};
