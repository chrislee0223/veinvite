import type { SupportedLocale } from './locales';

export type NotificationMetaCopy = {
  unread: string;
  invitedFriend: string;
  inviteCode: string;
  viewReceipt: string;
};

export const NOTIFICATION_META_COPY: Record<SupportedLocale, NotificationMetaCopy> = {
  en: { unread: 'Unread', invitedFriend: 'Invited friend', inviteCode: 'Invite code', viewReceipt: 'View receipt' },
  ko: { unread: '읽지 않음', invitedFriend: '초대한 친구', inviteCode: '초대 코드', viewReceipt: '영수증 보기' },
  zh: { unread: '未读', invitedFriend: '受邀好友', inviteCode: '邀请码', viewReceipt: '查看收据' },
  hi: { unread: 'अपठित', invitedFriend: 'आमंत्रित मित्र', inviteCode: 'आमंत्रण कोड', viewReceipt: 'रसीद देखें' },
  es: { unread: 'Sin leer', invitedFriend: 'Persona invitada', inviteCode: 'Código de invitación', viewReceipt: 'Ver recibo' },
  ja: { unread: '未読', invitedFriend: '招待した友だち', inviteCode: '招待コード', viewReceipt: '受取明細を見る' },
  it: { unread: 'Da leggere', invitedFriend: 'Persona invitata', inviteCode: 'Codice invito', viewReceipt: 'Vedi ricevuta' },
  tr: { unread: 'Okunmadı', invitedFriend: 'Davet edilen arkadaş', inviteCode: 'Davet kodu', viewReceipt: 'Makbuzu görüntüle' },
  nl: { unread: 'Ongelezen', invitedFriend: 'Uitgenodigde vriend', inviteCode: 'Uitnodigingscode', viewReceipt: 'Ontvangstbewijs bekijken' },
  de: { unread: 'Ungelesen', invitedFriend: 'Eingeladener Freund', inviteCode: 'Einladungscode', viewReceipt: 'Beleg ansehen' },
  fr: { unread: 'Non lu', invitedFriend: 'Personne invitée', inviteCode: 'Code d’invitation', viewReceipt: 'Voir le reçu' },
  ar: { unread: 'غير مقروء', invitedFriend: 'الصديق الذي دعوته', inviteCode: 'رمز الدعوة', viewReceipt: 'عرض الإيصال' },
  bn: { unread: 'অপঠিত', invitedFriend: 'আমন্ত্রিত বন্ধু', inviteCode: 'আমন্ত্রণ কোড', viewReceipt: 'রসিদ দেখুন' },
  pt: { unread: 'Não lida', invitedFriend: 'Amigo convidado', inviteCode: 'Código de convite', viewReceipt: 'Ver recibo' },
  ru: { unread: 'Не прочитано', invitedFriend: 'Приглашённый друг', inviteCode: 'Код приглашения', viewReceipt: 'Посмотреть квитанцию' },
  id: { unread: 'Belum dibaca', invitedFriend: 'Teman yang diundang', inviteCode: 'Kode undangan', viewReceipt: 'Lihat tanda terima' },
  vi: { unread: 'Chưa đọc', invitedFriend: 'Người bạn đã mời', inviteCode: 'Mã mời', viewReceipt: 'Xem biên nhận' },
  'zh-tw': { unread: '未讀', invitedFriend: '受邀好友', inviteCode: '邀請碼', viewReceipt: '查看收據' },
  sv: { unread: 'Oläst', invitedFriend: 'Inbjuden vän', inviteCode: 'Inbjudningskod', viewReceipt: 'Visa kvitto' },
  ro: { unread: 'Necitit', invitedFriend: 'Prieten invitat', inviteCode: 'Cod de invitație', viewReceipt: 'Vezi chitanța' },
  ur: { unread: 'غیر پڑھا ہوا', invitedFriend: 'مدعو دوست', inviteCode: 'دعوتی کوڈ', viewReceipt: 'رسید دیکھیں' },
  pcm: { unread: 'Never read', invitedFriend: 'Friend wey you invite', inviteCode: 'Invite code', viewReceipt: 'See receipt' },
  arz: { unread: 'مش مقروء', invitedFriend: 'الشخص اللي عزمته', inviteCode: 'كود الدعوة', viewReceipt: 'شوف الإيصال' },
  mr: { unread: 'न वाचलेले', invitedFriend: 'आमंत्रित मित्र', inviteCode: 'आमंत्रण कोड', viewReceipt: 'पावती पहा' },
  te: { unread: 'చదవనిది', invitedFriend: 'ఆహ్వానించిన స్నేహితుడు', inviteCode: 'ఆహ్వాన కోడ్', viewReceipt: 'రసీదు చూడండి' },
  sw: { unread: 'Haijasomwa', invitedFriend: 'Rafiki uliyemwalika', inviteCode: 'Msimbo wa mwaliko', viewReceipt: 'Tazama risiti' },
  ha: { unread: 'Ba a karanta ba', invitedFriend: 'Abokin da ka gayyata', inviteCode: 'Lambar gayyata', viewReceipt: 'Duba rasit' },
  el: { unread: 'Μη αναγνωσμένο', invitedFriend: 'Φίλος που προσκάλεσες', inviteCode: 'Κωδικός πρόσκλησης', viewReceipt: 'Προβολή απόδειξης' },
  cs: { unread: 'Nepřečtené', invitedFriend: 'Pozvaný přítel', inviteCode: 'Kód pozvánky', viewReceipt: 'Zobrazit potvrzení' },
};
