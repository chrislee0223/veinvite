import type { Locale } from './locales';

type GuideEligibilityCopy = {
  newDescription: string;
  returningDescription: string;
};

export const GUIDE_ELIGIBILITY_COPY: Record<Locale, GuideEligibilityCopy> = {
  en: {
    newDescription:
      'A wallet with no previous VeBetterDAO reward or Allocation Voting history.',
    returningDescription:
      'A user with no VeBetterDAO reward or Allocation Voting activity since the start of the oldest of the last 12 completed rounds.',
  },
  ko: {
    newDescription:
      '이전에 VeBetterDAO에서 보상을 받거나 Allocation Voting에 참여한 이력이 없는 지갑이에요.',
    returningDescription:
      '최근 완료된 12개 라운드 중 가장 오래된 라운드의 시작 시점부터 지금까지 VeBetterDAO 보상이나 Allocation Voting 활동이 없었던 사용자예요.',
  },
  zh: {
    newDescription:
      '此前没有 VeBetterDAO 奖励或 Allocation Voting 记录的钱包。',
    returningDescription:
      '从最近 12 个已完成轮次中最早一轮的开始时间至今，都没有 VeBetterDAO 奖励或 Allocation Voting 活动的用户。',
  },
  hi: {
    newDescription:
      'ऐसा वॉलेट जिसका पहले कोई VeBetterDAO इनाम या Allocation Voting इतिहास नहीं है।',
    returningDescription:
      'ऐसा उपयोगकर्ता जिसने पिछले 12 पूरे हो चुके राउंड में से सबसे पुराने राउंड की शुरुआत से अब तक कोई VeBetterDAO इनाम नहीं लिया और Allocation Voting में भाग नहीं लिया।',
  },
  es: {
    newDescription:
      'Una cartera sin historial previo de recompensas de VeBetterDAO ni de Allocation Voting.',
    returningDescription:
      'Un usuario sin recompensas de VeBetterDAO ni actividad de Allocation Voting desde el inicio de la más antigua de las últimas 12 rondas completadas.',
  },
  ja: {
    newDescription:
      '過去にVeBetterDAOの報酬受取やAllocation Votingの履歴がないウォレットです。',
    returningDescription:
      '直近12回の完了済みラウンドのうち最も古いラウンドの開始時点から現在まで、VeBetterDAOの報酬受取やAllocation Votingがないユーザーです。',
  },
  it: {
    newDescription:
      'Un wallet senza precedenti ricompense VeBetterDAO né attività di Allocation Voting.',
    returningDescription:
      'Un utente senza ricompense VeBetterDAO né attività di Allocation Voting dall’inizio della meno recente delle ultime 12 tornate completate.',
  },
  tr: {
    newDescription:
      'Daha önce VeBetterDAO ödülü veya Allocation Voting geçmişi olmayan bir cüzdan.',
    returningDescription:
      'Tamamlanan son 12 turun en eskisinin başlangıcından bugüne kadar VeBetterDAO ödülü veya Allocation Voting etkinliği olmayan bir kullanıcı.',
  },
  nl: {
    newDescription:
      'Een wallet zonder eerdere VeBetterDAO-beloningen of Allocation Voting-geschiedenis.',
    returningDescription:
      'Een gebruiker zonder VeBetterDAO-beloningen of Allocation Voting-activiteit sinds het begin van de oudste van de laatste 12 voltooide rondes.',
  },
  de: {
    newDescription:
      'Eine Wallet ohne frühere VeBetterDAO-Belohnungen oder Allocation-Voting-Historie.',
    returningDescription:
      'Ein Nutzer ohne VeBetterDAO-Belohnungen oder Allocation-Voting-Aktivität seit Beginn der ältesten der letzten 12 abgeschlossenen Runden.',
  },
  fr: {
    newDescription:
      'Un wallet sans historique de récompense VeBetterDAO ni d’Allocation Voting.',
    returningDescription:
      'Un utilisateur sans récompense VeBetterDAO ni activité d’Allocation Voting depuis le début du plus ancien des 12 derniers rounds terminés.',
  },
};