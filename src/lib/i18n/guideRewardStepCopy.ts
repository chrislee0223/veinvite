import type { Locale } from './locales';

type GuideRewardStepCopy = {
  title: string;
  description: string;
};

export const GUIDE_REWARD_STEP_COPY: Record<Locale, GuideRewardStepCopy> = {
  en: {
    title: 'Queued automatically after verification',
    description:
      "After the final checks, your reward is automatically added to the next funded reward round. You don't need to claim it.",
  },
  ko: {
    title: '검증 후 보상 자동 등록',
    description:
      '최종 검토를 통과하면 다음 보상 라운드 지급 대기열에 자동으로 등록돼요. 따로 보상 수령을 신청할 필요가 없어요.',
  },
  zh: {
    title: '验证后自动进入奖励队列',
    description:
      '通过最终检查后，奖励会自动加入下一次有资金的奖励轮次，无需手动领取。',
  },
  hi: {
    title: 'सत्यापन के बाद इनाम अपने-आप कतार में',
    description:
      'अंतिम जाँच पूरी होने के बाद आपका इनाम अगली फंडेड रिवार्ड राउंड में अपने-आप जुड़ जाएगा। आपको अलग से क्लेम करने की ज़रूरत नहीं है।',
  },
  es: {
    title: 'Recompensa añadida automáticamente tras la verificación',
    description:
      'Cuando terminen las comprobaciones finales, tu recompensa se añadirá automáticamente a la próxima ronda con fondos. No tienes que solicitarla.',
  },
  ja: {
    title: '確認後は自動で報酬待機列へ',
    description:
      '最終確認を通過すると、次回の資金がある報酬ラウンドに自動で登録されます。報酬を申請する必要はありません。',
  },
  it: {
    title: 'Ricompensa inserita automaticamente dopo la verifica',
    description:
      'Al termine dei controlli finali, la ricompensa viene inserita automaticamente nella prossima tornata finanziata. Non devi richiederla.',
  },
  tr: {
    title: 'Doğrulamadan sonra ödül otomatik sıraya alınır',
    description:
      'Son kontroller tamamlandığında ödülün bir sonraki fonlanmış ödül turuna otomatik olarak eklenir. Ayrıca talep etmen gerekmez.',
  },
  nl: {
    title: 'Beloning wordt na controle automatisch ingepland',
    description:
      'Na de laatste controles wordt je beloning automatisch toegevoegd aan de volgende gefinancierde ronde. Je hoeft deze niet zelf aan te vragen.',
  },
  de: {
    title: 'Belohnung wird nach Prüfung automatisch eingeplant',
    description:
      'Nach den abschließenden Prüfungen wird deine Belohnung automatisch für die nächste finanzierte Runde eingeplant. Du musst sie nicht selbst anfordern.',
  },
  fr: {
    title: 'Récompense ajoutée automatiquement après vérification',
    description:
      'Une fois les contrôles finaux terminés, votre récompense est ajoutée automatiquement à la prochaine manche financée. Vous n’avez aucune demande à faire.',
  },
};
