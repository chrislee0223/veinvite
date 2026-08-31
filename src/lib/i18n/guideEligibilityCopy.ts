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
      'A user with no reward or Allocation Voting activity since the earliest of the last 12 completed rounds began.',
  },
  ko: {
    newDescription:
      '이전에 VeBetterDAO에서 보상을 받거나 투표한 이력이 없는 지갑이에요.',
    returningDescription:
      '최근 완료된 12개 라운드의 시작 시점부터 현재까지 보상이나 투표 활동이 없었던 사용자예요.',
  },
  zh: {
    newDescription:
      '此前没有 VeBetterDAO 奖励或 Allocation Voting 记录的钱包。',
    returningDescription:
      '在最近 12 个已完成轮次以及当前轮次中都没有奖励或 Allocation Voting 活动的用户。',
  },
  hi: {
    newDescription:
      'ऐसा वॉलेट जिसमें पहले कोई VeBetterDAO इनाम या Allocation Voting इतिहास नहीं है।',
    returningDescription:
      'ऐसा उपयोगकर्ता जिसने पिछले 12 पूरे हुए राउंड की शुरुआत से अब तक कोई इनाम नहीं लिया और Allocation Voting में भाग नहीं लिया।',
  },
  es: {
    newDescription:
      'Una cartera sin historial previo de recompensas de VeBetterDAO ni de Allocation Voting.',
    returningDescription:
      'Un usuario que no ha recibido recompensas ni participado en Allocation Voting desde el inicio de las últimas 12 rondas completadas hasta ahora.',
  },
  ja: {
    newDescription:
      '過去にVeBetterDAOの報酬受取やAllocation Votingの履歴がないウォレットです。',
    returningDescription:
      '直近12回の完了済みラウンドのうち、最も古いラウンドの開始時点から現在まで、報酬受取やAllocation Votingがないユーザーです。',
  },
  it: {
    newDescription:
      'Un wallet senza precedenti ricompense VeBetterDAO né attività di Allocation Voting.',
    returningDescription:
      'Un utente che non ha ricevuto ricompense né partecipato ad Allocation Voting dall’inizio delle ultime 12 tornate completate fino a oggi.',
  },
  tr: {
    newDescription:
      'Daha önce VeBetterDAO ödülü veya Allocation Voting geçmişi olmayan bir cüzdan.',
    returningDescription:
      'Son 12 tamamlanmış tur boyunca ve şu ana kadar ödül veya Allocation Voting etkinliği olmayan bir kullanıcı.',
  },
  nl: {
    newDescription:
      'Een wallet zonder eerdere VeBetterDAO-beloningen of Allocation Voting-geschiedenis.',
    returningDescription:
      'Een gebruiker die sinds het begin van de laatste 12 voltooide rondes geen beloning heeft ontvangen en niet via Allocation Voting heeft gestemd.',
  },
  de: {
    newDescription:
      'Eine Wallet ohne frühere VeBetterDAO-Belohnungen oder Allocation-Voting-Historie.',
    returningDescription:
      'Ein Nutzer, der seit Beginn der letzten 12 abgeschlossenen Runden keine Belohnung erhalten und nicht am Allocation Voting teilgenommen hat.',
  },
  fr: {
    newDescription:
      'Un wallet sans historique de récompense VeBetterDAO ni d’Allocation Voting.',
    returningDescription:
      'Un utilisateur qui n’a reçu aucune récompense et n’a participé à aucun vote d’Allocation Voting depuis le début des 12 derniers rounds terminés.',
  },
};
