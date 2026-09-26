import type { SupportedLocale } from './locales';

type ReferralInvalidatedCopy = {
  title: string;
  body: string;
};

export const REFERRAL_INVALIDATED_COPY: Record<
  SupportedLocale,
  ReferralInvalidatedCopy
> = {
  en: {
    title: 'Referral removed',
    body: 'A referred wallet was confirmed as Sybil. This referral has been removed from your recognized referral count, leaderboard reward total, and Network. B3TR already paid on-chain is unchanged.',
  },
  ko: {
    title: '초대 기록이 무효 처리됐어요',
    body: '초대한 지갑이 Sybil로 확인되어 해당 초대가 인정 초대 수, 리더보드 보상 실적, Network에서 제외됐어요. 이미 온체인으로 지급된 B3TR은 변경되지 않아요.',
  },
  zh: {
    title: '邀请记录已移除',
    body: '你邀请的钱包已被确认属于 Sybil。该邀请已从有效邀请数、排行榜奖励统计和 Network 中移除。链上已发放的 B3TR 不会改变。',
  },
  hi: {
    title: 'रेफ़रल रिकॉर्ड हटाया गया',
    body: 'आपके द्वारा आमंत्रित वॉलेट को Sybil के रूप में पुष्टि की गई। यह रेफ़रल मान्य रेफ़रल संख्या, लीडरबोर्ड रिवॉर्ड और Network से हटा दिया गया है। पहले से ऑन-चेन दिए गए B3TR में बदलाव नहीं होगा।',
  },
  es: {
    title: 'Referencia eliminada',
    body: 'Una cartera invitada fue confirmada como Sybil. Esta referencia se eliminó del recuento válido, de las recompensas del ranking y de Network. El B3TR ya pagado en cadena no cambia.',
  },
  ja: {
    title: '招待記録が無効になりました',
    body: '招待したウォレットが Sybil と確認されたため、この招待は有効招待数、ランキング報酬実績、Network から除外されました。すでにオンチェーンで支払われた B3TR は変更されません。',
  },
  it: {
    title: 'Referral rimosso',
    body: 'Un wallet invitato è stato confermato come Sybil. Il referral è stato rimosso dal conteggio valido, dalle ricompense in classifica e dal Network. I B3TR già pagati on-chain non cambiano.',
  },
  tr: {
    title: 'Davet kaydı kaldırıldı',
    body: 'Davet ettiğin bir cüzdanın Sybil olduğu doğrulandı. Bu davet geçerli davet sayından, liderlik tablosu ödül toplamından ve Network’ten çıkarıldı. Zincir üzerinde daha önce ödenen B3TR değişmez.',
  },
  nl: {
    title: 'Referral verwijderd',
    body: 'Een uitgenodigde wallet is als Sybil bevestigd. Deze referral is verwijderd uit je geldige referral-aantal, leaderboardbeloningen en Network. B3TR die al on-chain is betaald blijft ongewijzigd.',
  },
  de: {
    title: 'Empfehlung entfernt',
    body: 'Eine eingeladene Wallet wurde als Sybil bestätigt. Diese Empfehlung wurde aus der anerkannten Empfehlungszahl, den Leaderboard-Belohnungen und dem Network entfernt. Bereits on-chain ausgezahlte B3TR bleiben unverändert.',
  },
  fr: {
    title: 'Parrainage supprimé',
    body: 'Un portefeuille invité a été confirmé comme Sybil. Ce parrainage a été retiré du nombre de parrainages reconnus, des récompenses du classement et du Network. Les B3TR déjà versés on-chain restent inchangés.',
  },
  ar: {
    title: 'تم إلغاء الإحالة',
    body: 'تم تأكيد أن إحدى المحافظ المدعوة من نوع Sybil. أزيلت هذه الإحالة من عدد الإحالات المعترف بها ومكافآت لوحة الصدارة وNetwork. مكافآت B3TR المدفوعة سابقًا على السلسلة لن تتغير.',
  },
  bn: {
    title: 'রেফারেল রেকর্ড বাতিল হয়েছে',
    body: 'আপনার আমন্ত্রিত একটি ওয়ালেট Sybil হিসেবে নিশ্চিত হয়েছে। এই রেফারেলটি স্বীকৃত রেফারেল সংখ্যা, লিডারবোর্ড রিওয়ার্ড এবং Network থেকে বাদ দেওয়া হয়েছে। ইতিমধ্যে অন-চেইনে দেওয়া B3TR অপরিবর্তিত থাকবে।',
  },
  pt: {
    title: 'Indicação removida',
    body: 'Uma carteira convidada foi confirmada como Sybil. Essa indicação foi removida da contagem válida, das recompensas do ranking e do Network. O B3TR já pago on-chain não será alterado.',
  },
  ru: {
    title: 'Реферал удалён',
    body: 'Приглашённый кошелёк был подтверждён как Sybil. Этот реферал исключён из подтверждённого счётчика, наград рейтинга и Network. Уже выплаченные on-chain B3TR не изменяются.',
  },
  id: {
    title: 'Referral dihapus',
    body: 'Wallet yang kamu undang telah dikonfirmasi sebagai Sybil. Referral ini dihapus dari jumlah referral yang diakui, total reward leaderboard, dan Network. B3TR yang sudah dibayar on-chain tidak berubah.',
  },
  vi: {
    title: 'Đã loại bỏ lượt giới thiệu',
    body: 'Một ví được bạn mời đã được xác nhận là Sybil. Lượt giới thiệu này đã bị loại khỏi số lượt giới thiệu hợp lệ, tổng thưởng trên bảng xếp hạng và Network. B3TR đã trả on-chain không thay đổi.',
  },
  'zh-tw': {
    title: '邀請紀錄已移除',
    body: '你邀請的錢包已確認為 Sybil。此邀請已從有效邀請數、排行榜獎勵統計與 Network 中移除。鏈上已發放的 B3TR 不會變更。',
  },
  sv: {
    title: 'Referral borttagen',
    body: 'En inbjuden plånbok har bekräftats som Sybil. Referral-posten har tagits bort från giltiga referrals, leaderboard-belöningar och Network. B3TR som redan betalats on-chain ändras inte.',
  },
  ro: {
    title: 'Recomandare eliminată',
    body: 'Un portofel invitat a fost confirmat ca Sybil. Recomandarea a fost eliminată din numărul recunoscut, recompensele din clasament și Network. B3TR deja plătit on-chain rămâne neschimbat.',
  },
  ur: {
    title: 'ریفرل ریکارڈ ہٹا دیا گیا',
    body: 'آپ کے مدعو کردہ ایک والیٹ کو Sybil کے طور پر تصدیق کیا گیا ہے۔ یہ ریفرل تسلیم شدہ ریفرل گنتی، لیڈر بورڈ انعامات اور Network سے ہٹا دیا گیا ہے۔ پہلے سے آن چین ادا شدہ B3TR تبدیل نہیں ہوگا۔',
  },
  pcm: {
    title: 'Referral don remove',
    body: 'One wallet wey you invite don confirm as Sybil. We don remove the referral from your valid referral count, leaderboard reward total and Network. B3TR wey don already pay on-chain no change.',
  },
  arz: {
    title: 'تم إلغاء الإحالة',
    body: 'اتأكد إن محفظة من اللي دعوتها Sybil. الإحالة دي اتشالت من عدد الإحالات المعترف بيها ومكافآت الترتيب وNetwork. الـ B3TR اللي اتدفع بالفعل على السلسلة مش هيتغير.',
  },
  mr: {
    title: 'रेफरल नोंद काढली',
    body: 'तुम्ही आमंत्रित केलेले एक वॉलेट Sybil असल्याचे निश्चित झाले. हा रेफरल मान्य रेफरल संख्या, लीडरबोर्ड रिवॉर्ड आणि Network मधून काढला आहे. आधीच ऑन-चेन दिलेला B3TR बदलणार नाही.',
  },
  te: {
    title: 'రిఫరల్ రికార్డు తొలగించబడింది',
    body: 'మీరు ఆహ్వానించిన ఒక వాలెట్ Sybil అని నిర్ధారించబడింది. ఈ రిఫరల్ గుర్తింపు పొందిన రిఫరల్ సంఖ్య, లీడర్‌బోర్డ్ రివార్డ్ మొత్తం మరియు Network నుండి తొలగించబడింది. ఇప్పటికే on-chain చెల్లించిన B3TR మారదు.',
  },
  sw: {
    title: 'Rufaa imeondolewa',
    body: 'Wallet uliyoalika imethibitishwa kuwa Sybil. Rufaa hii imeondolewa kwenye idadi ya rufaa zinazotambuliwa, zawadi za leaderboard na Network. B3TR iliyolipwa tayari on-chain haitabadilika.',
  },
  ha: {
    title: 'An cire referral',
    body: 'An tabbatar da cewa wani wallet da ka gayyata Sybil ne. An cire referral ɗin daga ƙididdigar referral da ake amincewa da ita, ladan leaderboard da Network. B3TR da aka riga aka biya on-chain ba zai canza ba.',
  },
  el: {
    title: 'Η παραπομπή αφαιρέθηκε',
    body: 'Ένα πορτοφόλι που προσκάλεσες επιβεβαιώθηκε ως Sybil. Η παραπομπή αφαιρέθηκε από τις αναγνωρισμένες προσκλήσεις, τις ανταμοιβές του leaderboard και το Network. Τα B3TR που έχουν ήδη πληρωθεί on-chain δεν αλλάζουν.',
  },
  cs: {
    title: 'Doporučení bylo odstraněno',
    body: 'Pozvaná peněženka byla potvrzena jako Sybil. Toto doporučení bylo odebráno z uznaného počtu doporučení, odměn v žebříčku a Network. B3TR již vyplacené on-chain zůstává beze změny.',
  },
};
