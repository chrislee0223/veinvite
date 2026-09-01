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
    description: 'A referral appears in the ranking after your friend completes every mission and the inviter receives the B3TR reward.',
    impactTitle: 'Users brought in through VeInvite',
    totalUsers: 'Total',
    impactNote: 'Only wallets that completed every mission are included in the VeInvite user total.',
    rank: 'Rank',
    wallet: 'Inviter',
    completed: 'Invites',
    earned: 'Total rewards',
    myRank: 'My rank',
    unranked: 'No invite has been reflected in your rank yet.',
    connectForRank: 'Connect your wallet to see your activity and rank here.',
    empty: 'No invites have been reflected in the ranking yet.',
  },
  ko: {
    description: '친구가 모든 미션을 완료하고 초대한 사람이 B3TR 보상을 받은 초대만 순위에 반영해요.',
    impactTitle: 'VeInvite를 통해 유입된 사용자',
    totalUsers: '전체',
    impactNote: '모든 미션을 완료한 지갑만 VeInvite 유입 사용자 수에 포함해요.',
    rank: '순위',
    wallet: '초대자',
    completed: '초대 횟수',
    earned: '누적 보상',
    myRank: '내 순위',
    unranked: '아직 순위에 반영된 초대가 없어요.',
    connectForRank: '지갑을 연결하면 내 활동과 순위를 여기서 확인할 수 있어요.',
    empty: '아직 순위에 반영된 초대가 없어요.',
  },
  zh: {
    description: '好友完成全部任务且邀请人收到 B3TR 奖励后，该邀请才会计入排名。',
    impactTitle: '通过 VeInvite 引入的用户',
    totalUsers: '总计',
    impactNote: '只有完成全部任务的钱包才会计入 VeInvite 引入用户总数。',
    rank: '排名',
    wallet: '邀请人',
    completed: '邀请次数',
    earned: '累计奖励',
    myRank: '我的排名',
    unranked: '目前还没有邀请计入你的排名。',
    connectForRank: '连接钱包后即可在这里查看你的活动和排名。',
    empty: '目前还没有邀请计入排名。',
  },
  hi: {
    description: 'रेफ़रल रैंकिंग में तभी जुड़ता है जब दोस्त सभी मिशन पूरे कर ले और आमंत्रक को B3TR इनाम मिल जाए।',
    impactTitle: 'VeInvite के जरिए जुड़े उपयोगकर्ता',
    totalUsers: 'कुल',
    impactNote: 'VeInvite उपयोगकर्ता कुल में केवल सभी मिशन पूरे करने वाले वॉलेट शामिल होते हैं।',
    rank: 'रैंक',
    wallet: 'आमंत्रक',
    completed: 'आमंत्रण',
    earned: 'कुल इनाम',
    myRank: 'मेरी रैंक',
    unranked: 'अभी तक कोई आमंत्रण आपकी रैंक में नहीं जुड़ा है।',
    connectForRank: 'अपनी गतिविधि और रैंक देखने के लिए वॉलेट कनेक्ट करें।',
    empty: 'अभी तक कोई आमंत्रण रैंकिंग में नहीं जुड़ा है।',
  },
  es: {
    description: 'Una invitación entra en la clasificación cuando el amigo completa todas las misiones y el invitador recibe la recompensa en B3TR.',
    impactTitle: 'Usuarios incorporados a través de VeInvite',
    totalUsers: 'Total',
    impactNote: 'Solo se incluyen en el total de usuarios de VeInvite las carteras que completaron todas las misiones.',
    rank: 'Puesto',
    wallet: 'Invitador',
    completed: 'Invitaciones',
    earned: 'Recompensas acumuladas',
    myRank: 'Mi puesto',
    unranked: 'Aún no tienes invitaciones reflejadas en tu puesto.',
    connectForRank: 'Conecta tu cartera para ver aquí tu actividad y tu puesto.',
    empty: 'Aún no hay invitaciones reflejadas en la clasificación.',
  },
  ja: {
    description: '友だちがすべてのミッションを完了し、招待者がB3TR報酬を受け取った招待だけがランキングに反映されます。',
    impactTitle: 'VeInvite経由で参加したユーザー',
    totalUsers: '合計',
    impactNote: 'すべてのミッションを完了したウォレットだけをVeInvite経由のユーザー数に含めます。',
    rank: '順位',
    wallet: '招待者',
    completed: '招待数',
    earned: '累計報酬',
    myRank: '自分の順位',
    unranked: 'まだ順位に反映された招待はありません。',
    connectForRank: 'ウォレットを接続すると、ここで活動状況と順位を確認できます。',
    empty: 'まだランキングに反映された招待はありません。',
  },
  it: {
    description: 'Un invito entra in classifica quando l’amico completa tutte le missioni e chi lo ha invitato riceve la ricompensa B3TR.',
    impactTitle: 'Utenti arrivati tramite VeInvite',
    totalUsers: 'Totale',
    impactNote: 'Nel totale degli utenti VeInvite rientrano solo i wallet che hanno completato tutte le missioni.',
    rank: 'Posizione',
    wallet: 'Chi invita',
    completed: 'Inviti',
    earned: 'Ricompense totali',
    myRank: 'La mia posizione',
    unranked: 'Non hai ancora inviti inclusi nella classifica.',
    connectForRank: 'Collega il wallet per vedere qui attività e posizione.',
    empty: 'Non ci sono ancora inviti inclusi nella classifica.',
  },
  tr: {
    description: 'Bir davet, arkadaşın tüm görevleri tamamladığında ve davet eden kişi B3TR ödülünü aldığında sıralamaya yansır.',
    impactTitle: 'VeInvite ile katılan kullanıcılar',
    totalUsers: 'Toplam',
    impactNote: 'VeInvite kullanıcı toplamına yalnızca tüm görevleri tamamlayan cüzdanlar dahil edilir.',
    rank: 'Sıra',
    wallet: 'Davet eden',
    completed: 'Davetler',
    earned: 'Toplam ödüller',
    myRank: 'Sıram',
    unranked: 'Henüz sıralamana yansıyan bir davet yok.',
    connectForRank: 'Etkinliğini ve sıralamanı görmek için cüzdanını bağla.',
    empty: 'Henüz sıralamaya yansıyan bir davet yok.',
  },
  nl: {
    description: 'Een uitnodiging telt mee in de ranglijst zodra je vriend alle missies heeft voltooid en de uitnodiger de B3TR-beloning heeft ontvangen.',
    impactTitle: 'Gebruikers via VeInvite',
    totalUsers: 'Totaal',
    impactNote: 'Alleen wallets die alle missies hebben voltooid, tellen mee in het VeInvite-gebruikerstotaal.',
    rank: 'Positie',
    wallet: 'Uitnodiger',
    completed: 'Uitnodigingen',
    earned: 'Totale beloningen',
    myRank: 'Mijn positie',
    unranked: 'Er is nog geen uitnodiging in je positie verwerkt.',
    connectForRank: 'Koppel je wallet om hier je activiteit en positie te bekijken.',
    empty: 'Er zijn nog geen uitnodigingen in de ranglijst verwerkt.',
  },
  de: {
    description: 'Eine Einladung zählt in der Rangliste, sobald dein Freund alle Missionen abgeschlossen und der Einladende die B3TR-Belohnung erhalten hat.',
    impactTitle: 'Über VeInvite gewonnene Nutzer',
    totalUsers: 'Gesamt',
    impactNote: 'In die VeInvite-Nutzerzahl fließen nur Wallets ein, die alle Missionen abgeschlossen haben.',
    rank: 'Rang',
    wallet: 'Einladender',
    completed: 'Einladungen',
    earned: 'Gesamtbelohnungen',
    myRank: 'Mein Rang',
    unranked: 'Noch keine Einladung wurde in deinem Rang berücksichtigt.',
    connectForRank: 'Verbinde deine Wallet, um hier Aktivität und Rang zu sehen.',
    empty: 'Noch keine Einladungen wurden in der Rangliste berücksichtigt.',
  },
  fr: {
    description: 'Une invitation entre dans le classement lorsque votre ami a terminé toutes les missions et que le parrain a reçu la récompense B3TR.',
    impactTitle: 'Utilisateurs arrivés via VeInvite',
    totalUsers: 'Total',
    impactNote: 'Seuls les wallets ayant terminé toutes les missions sont inclus dans le total des utilisateurs VeInvite.',
    rank: 'Rang',
    wallet: 'Parrain',
    completed: 'Invitations',
    earned: 'Récompenses cumulées',
    myRank: 'Mon rang',
    unranked: 'Aucune invitation n’est encore prise en compte dans votre rang.',
    connectForRank: 'Connectez votre wallet pour voir ici votre activité et votre rang.',
    empty: 'Aucune invitation n’est encore prise en compte dans le classement.',
  },
};

for (const locale of Object.keys(POLISHED_LEADERBOARD_COPY) as Locale[]) {
  Object.assign(LEADERBOARD_COPY[locale], POLISHED_LEADERBOARD_COPY[locale]);
}