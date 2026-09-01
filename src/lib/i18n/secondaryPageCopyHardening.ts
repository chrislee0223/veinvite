import { LEADERBOARD_COPY } from './leaderboardCopy';
import type { Locale } from './locales';

type LeaderboardPolish = {
  description: string;
  impactTitle: string;
  totalUsers: string;
  impactNote: string;
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
    description: 'Rankings count a referral after every mission is complete and the inviter has received the B3TR reward.',
    impactTitle: 'Users who completed VeInvite onboarding',
    totalUsers: 'Total',
    impactNote: 'Only wallets that completed every mission are included in the onboarding total.',
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
    description: '친구가 모든 미션을 완료하고 초대한 사람이 B3TR 보상을 받은 초대만 순위에 반영해요.',
    impactTitle: 'VeInvite 온보딩 완료 사용자',
    totalUsers: '전체',
    impactNote: '모든 미션을 완료한 지갑만 온보딩 완료 사용자 수에 포함해요.',
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
    description: '好友完成全部任务且邀请人收到 B3TR 奖励后，该邀请才会计入排名。',
    impactTitle: '完成 VeInvite 新手流程的用户',
    totalUsers: '总计',
    impactNote: '只有完成全部任务的钱包才会计入新手流程完成用户总数。',
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
    description: 'रेफ़रल रैंकिंग में तभी जुड़ता है जब दोस्त सभी मिशन पूरे कर ले और आमंत्रक को B3TR इनाम मिल जाए।',
    impactTitle: 'VeInvite ऑनबोर्डिंग पूरा करने वाले उपयोगकर्ता',
    totalUsers: 'कुल',
    impactNote: 'ऑनबोर्डिंग कुल में केवल सभी मिशन पूरे करने वाले वॉलेट शामिल होते हैं।',
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
    description: 'Una invitación entra en la clasificación cuando el amigo completa todas las misiones y el invitador recibe la recompensa en B3TR.',
    impactTitle: 'Usuarios que completaron el onboarding de VeInvite',
    totalUsers: 'Total',
    impactNote: 'Solo se incluyen en el total de onboarding las carteras que completaron todas las misiones.',
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
    description: '友だちがすべてのミッションを完了し、招待者がB3TR報酬を受け取った招待だけがランキングに反映されます。',
    impactTitle: 'VeInviteのオンボーディング完了ユーザー',
    totalUsers: '合計',
    impactNote: 'すべてのミッションを完了したウォレットだけをオンボーディング完了ユーザー数に含めます。',
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
    description: 'Un invito entra in classifica quando l’amico completa tutte le missioni e chi lo ha invitato riceve la ricompensa B3TR.',
    impactTitle: 'Utenti che hanno completato l’onboarding di VeInvite',
    totalUsers: 'Totale',
    impactNote: 'Nel totale dell’onboarding rientrano solo i wallet che hanno completato tutte le missioni.',
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
    description: 'Bir davet, arkadaşın tüm görevleri tamamladığında ve davet eden kişi B3TR ödülünü aldığında sıralamaya yansır.',
    impactTitle: 'VeInvite onboarding sürecini tamamlayan kullanıcılar',
    totalUsers: 'Toplam',
    impactNote: 'Onboarding toplamına yalnızca tüm görevleri tamamlayan cüzdanlar dahil edilir.',
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
    description: 'Een uitnodiging telt mee in de ranglijst zodra je vriend alle missies heeft voltooid en de uitnodiger de B3TR-beloning heeft ontvangen.',
    impactTitle: 'Gebruikers die de VeInvite-onboarding hebben voltooid',
    totalUsers: 'Totaal',
    impactNote: 'Alleen wallets die alle missies hebben voltooid, tellen mee in het onboardingtotaal.',
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
    description: 'Eine Einladung zählt in der Rangliste, sobald dein Freund alle Missionen abgeschlossen und der Einladende die B3TR-Belohnung erhalten hat.',
    impactTitle: 'Nutzer mit abgeschlossenem VeInvite-Onboarding',
    totalUsers: 'Gesamt',
    impactNote: 'In die Onboarding-Gesamtzahl fließen nur Wallets ein, die alle Missionen abgeschlossen haben.',
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
    description: 'Une invitation entre dans le classement lorsque votre ami a terminé toutes les missions et que le parrain a reçu la récompense B3TR.',
    impactTitle: 'Utilisateurs ayant terminé l’onboarding VeInvite',
    totalUsers: 'Total',
    impactNote: 'Seuls les wallets ayant terminé toutes les missions sont inclus dans le total de l’onboarding.',
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