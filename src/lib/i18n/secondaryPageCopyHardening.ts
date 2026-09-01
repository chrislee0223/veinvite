import { LEADERBOARD_COPY } from './leaderboardCopy';
import type { Locale } from './locales';

type LeaderboardPolish = {
  impactTitle: string;
  totalUsers: string;
  rank: string;
  wallet: string;
  completed: string;
  earned: string;
  myRank: string;
  unranked: string;
  connectForRank: string;
  empty: string;
};

const POLISHED_LEADERBOARD_COPY: Record<Locale, LeaderboardPolish> = {
  en: {
    impactTitle: 'Users who completed VeInvite onboarding',
    totalUsers: 'Total',
    rank: 'Rank',
    wallet: 'Inviter',
    completed: 'Completed invites',
    earned: 'Total B3TR',
    myRank: 'My rank',
    unranked: 'No completed invite has been reflected in your rank yet.',
    connectForRank: 'Connect your wallet to see your activity and rank here.',
    empty: 'No completed invites have been reflected in the ranking yet.',
  },
  ko: {
    impactTitle: 'VeInvite 온보딩 완료 사용자',
    totalUsers: '전체',
    rank: '순위',
    wallet: '초대자',
    completed: '완료 초대',
    earned: '누적 B3TR',
    myRank: '내 순위',
    unranked: '아직 순위에 반영된 완료 초대가 없어요.',
    connectForRank: '지갑을 연결하면 내 활동과 순위를 여기서 확인할 수 있어요.',
    empty: '아직 순위에 반영된 완료 초대가 없어요.',
  },
  zh: {
    impactTitle: '完成 VeInvite 新手流程的用户',
    totalUsers: '总计',
    rank: '排名',
    wallet: '邀请人',
    completed: '已完成邀请',
    earned: '累计 B3TR',
    myRank: '我的排名',
    unranked: '目前还没有已完成的邀请计入你的排名。',
    connectForRank: '连接钱包后即可在这里查看你的活动和排名。',
    empty: '目前还没有已完成的邀请计入排名。',
  },
  hi: {
    impactTitle: 'VeInvite ऑनबोर्डिंग पूरा करने वाले उपयोगकर्ता',
    totalUsers: 'कुल',
    rank: 'रैंक',
    wallet: 'आमंत्रक',
    completed: 'पूरे हुए आमंत्रण',
    earned: 'कुल B3TR',
    myRank: 'मेरी रैंक',
    unranked: 'अभी तक कोई पूरा हुआ आमंत्रण आपकी रैंक में नहीं जुड़ा है।',
    connectForRank: 'अपनी गतिविधि और रैंक देखने के लिए वॉलेट कनेक्ट करें।',
    empty: 'अभी तक कोई पूरा हुआ आमंत्रण रैंकिंग में नहीं जुड़ा है।',
  },
  es: {
    impactTitle: 'Usuarios que completaron el onboarding de VeInvite',
    totalUsers: 'Total',
    rank: 'Puesto',
    wallet: 'Invitador',
    completed: 'Invitaciones completadas',
    earned: 'B3TR acumulado',
    myRank: 'Mi puesto',
    unranked: 'Aún no tienes invitaciones completadas reflejadas en tu puesto.',
    connectForRank: 'Conecta tu cartera para ver aquí tu actividad y tu puesto.',
    empty: 'Aún no hay invitaciones completadas reflejadas en la clasificación.',
  },
  ja: {
    impactTitle: 'VeInviteのオンボーディング完了ユーザー',
    totalUsers: '合計',
    rank: '順位',
    wallet: '招待者',
    completed: '完了した招待',
    earned: '累計B3TR',
    myRank: '自分の順位',
    unranked: 'まだ順位に反映された完了済みの招待はありません。',
    connectForRank: 'ウォレットを接続すると、ここで活動状況と順位を確認できます。',
    empty: 'まだランキングに反映された完了済みの招待はありません。',
  },
  it: {
    impactTitle: 'Utenti che hanno completato l’onboarding di VeInvite',
    totalUsers: 'Totale',
    rank: 'Posizione',
    wallet: 'Chi invita',
    completed: 'Inviti completati',
    earned: 'B3TR totali',
    myRank: 'La mia posizione',
    unranked: 'Non hai ancora inviti completati inclusi nella classifica.',
    connectForRank: 'Collega il wallet per vedere qui attività e posizione.',
    empty: 'Non ci sono ancora inviti completati inclusi nella classifica.',
  },
  tr: {
    impactTitle: 'VeInvite onboarding sürecini tamamlayan kullanıcılar',
    totalUsers: 'Toplam',
    rank: 'Sıra',
    wallet: 'Davet eden',
    completed: 'Tamamlanan davetler',
    earned: 'Toplam B3TR',
    myRank: 'Sıram',
    unranked: 'Henüz sıralamana yansıyan tamamlanmış bir davet yok.',
    connectForRank: 'Etkinliğini ve sıralamanı görmek için cüzdanını bağla.',
    empty: 'Henüz sıralamaya yansıyan tamamlanmış bir davet yok.',
  },
  nl: {
    impactTitle: 'Gebruikers die de VeInvite-onboarding hebben voltooid',
    totalUsers: 'Totaal',
    rank: 'Positie',
    wallet: 'Uitnodiger',
    completed: 'Voltooide uitnodigingen',
    earned: 'Totaal B3TR',
    myRank: 'Mijn positie',
    unranked: 'Er is nog geen voltooide uitnodiging in je positie verwerkt.',
    connectForRank: 'Koppel je wallet om hier je activiteit en positie te bekijken.',
    empty: 'Er zijn nog geen voltooide uitnodigingen in de ranglijst verwerkt.',
  },
  de: {
    impactTitle: 'Nutzer mit abgeschlossenem VeInvite-Onboarding',
    totalUsers: 'Gesamt',
    rank: 'Rang',
    wallet: 'Einladender',
    completed: 'Abgeschlossene Einladungen',
    earned: 'B3TR gesamt',
    myRank: 'Mein Rang',
    unranked: 'Noch keine abgeschlossene Einladung wurde in deinem Rang berücksichtigt.',
    connectForRank: 'Verbinde deine Wallet, um hier Aktivität und Rang zu sehen.',
    empty: 'Noch keine abgeschlossenen Einladungen wurden in der Rangliste berücksichtigt.',
  },
  fr: {
    impactTitle: 'Utilisateurs ayant terminé l’onboarding VeInvite',
    totalUsers: 'Total',
    rank: 'Rang',
    wallet: 'Parrain',
    completed: 'Invitations terminées',
    earned: 'B3TR cumulés',
    myRank: 'Mon rang',
    unranked: 'Aucune invitation terminée n’est encore prise en compte dans votre rang.',
    connectForRank: 'Connectez votre wallet pour voir ici votre activité et votre rang.',
    empty: 'Aucune invitation terminée n’est encore prise en compte dans le classement.',
  },
};

for (const locale of Object.keys(POLISHED_LEADERBOARD_COPY) as Locale[]) {
  Object.assign(LEADERBOARD_COPY[locale], POLISHED_LEADERBOARD_COPY[locale]);
}
