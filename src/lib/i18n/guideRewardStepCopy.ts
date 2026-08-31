import type { Locale } from './locales';

type GuideRewardStepCopy = {
  title: string;
  description: string;
};

export const GUIDE_REWARD_STEP_COPY: Record<Locale, GuideRewardStepCopy> = {
  en: {
    title: 'Get your reward after all missions are complete',
    description:
      'When your friend completes all missions, you can receive your reward in VeInvite.',
  },
  ko: {
    title: '미션 완료 후 보상 받기',
    description:
      '친구가 모든 미션을 완료하면, 초대한 사람은 VeInvite에서 보상을 받을 수 있어요.',
  },
  zh: {
    title: '完成所有任务后领取奖励',
    description:
      '好友完成所有任务后，邀请人即可在 VeInvite 中领取奖励。',
  },
  hi: {
    title: 'सभी मिशन पूरे होने के बाद इनाम पाएं',
    description:
      'जब आपका दोस्त सभी मिशन पूरे कर लेता है, तो आमंत्रित करने वाला VeInvite में अपना इनाम प्राप्त कर सकता है।',
  },
  es: {
    title: 'Recibe tu recompensa al completar todas las misiones',
    description:
      'Cuando tu amigo complete todas las misiones, podrás recibir tu recompensa en VeInvite.',
  },
  ja: {
    title: 'すべてのミッション完了後に報酬を受け取る',
    description:
      '友だちがすべてのミッションを完了すると、招待した人は VeInvite で報酬を受け取れます。',
  },
  it: {
    title: 'Ricevi la ricompensa dopo tutte le missioni',
    description:
      'Quando il tuo amico completa tutte le missioni, puoi ricevere la ricompensa su VeInvite.',
  },
  tr: {
    title: 'Tüm görevler tamamlanınca ödülünü al',
    description:
      'Arkadaşın tüm görevleri tamamladığında, davet eden kişi ödülünü VeInvite üzerinden alabilir.',
  },
  nl: {
    title: 'Ontvang je beloning nadat alle missies zijn voltooid',
    description:
      'Wanneer je vriend alle missies heeft voltooid, kun je je beloning in VeInvite ontvangen.',
  },
  de: {
    title: 'Belohnung erhalten, wenn alle Missionen abgeschlossen sind',
    description:
      'Wenn dein Freund alle Missionen abgeschlossen hat, kannst du deine Belohnung in VeInvite erhalten.',
  },
  fr: {
    title: 'Recevez votre récompense une fois toutes les missions terminées',
    description:
      'Lorsque votre ami a terminé toutes les missions, vous pouvez recevoir votre récompense dans VeInvite.',
  },
};
