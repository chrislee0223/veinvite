import type { SupportedLocale } from './locales';

export type ReferralRestoredCopy = {
  title: string;
  body: string;
};

export const REFERRAL_RESTORED_COPY: Record<
  SupportedLocale,
  ReferralRestoredCopy
> = {
  en: { title: 'Referral restored', body: 'The previous invalidation was reversed after review. This referral is included again in your recognized referral count, leaderboard reward total, and Network. B3TR already paid on-chain is unchanged.' },
  ko: { title: '초대 기록이 복구됐어요', body: '검토 결과 이전 무효 처리가 해제되어 해당 초대가 인정 초대 수, 리더보드 보상 실적, Network에 다시 반영됐어요. 이미 온체인으로 지급된 B3TR은 변경되지 않아요.' },
  zh: { title: '邀请记录已恢复', body: '经复核，之前的无效处理已撤销。此邀请重新计入有效邀请数、排行榜奖励统计和 Network。链上已发放的 B3TR 不会改变。' },
  hi: { title: 'रेफ़रल फिर से बहाल हुआ', body: 'समीक्षा के बाद पिछला अमान्यकरण वापस ले लिया गया है। यह रेफ़रल फिर से मान्य रेफ़रल संख्या, लीडरबोर्ड रिवॉर्ड और Network में शामिल है। पहले से ऑन-चेन दिए गए B3TR में बदलाव नहीं होगा।' },
  es: { title: 'Referencia restaurada', body: 'Tras la revisión se revirtió la invalidación anterior. Esta referencia vuelve a contar en tus referencias reconocidas, las recompensas del ranking y Network. El B3TR ya pagado en cadena no cambia.' },
  ja: { title: '招待記録が復元されました', body: '確認の結果、以前の無効処理が取り消されました。この招待は有効招待数、ランキング報酬実績、Network に再び反映されます。すでにオンチェーンで支払われた B3TR は変更されません。' },
  it: { title: 'Referral ripristinato', body: 'Dopo la revisione, la precedente invalidazione è stata annullata. Il referral torna nel conteggio riconosciuto, nelle ricompense in classifica e nel Network. I B3TR già pagati on-chain non cambiano.' },
  tr: { title: 'Davet kaydı geri yüklendi', body: 'İnceleme sonrası önceki geçersiz kılma geri alındı. Bu davet yeniden geçerli davet sayına, liderlik tablosu ödül toplamına ve Network’e dahil edildi. Zincir üzerinde daha önce ödenen B3TR değişmez.' },
  nl: { title: 'Referral hersteld', body: 'Na beoordeling is de eerdere ongeldigverklaring teruggedraaid. Deze referral telt weer mee voor je erkende referrals, leaderboardbeloningen en Network. Reeds on-chain betaalde B3TR blijft ongewijzigd.' },
  de: { title: 'Empfehlung wiederhergestellt', body: 'Nach der Prüfung wurde die frühere Ungültigerklärung aufgehoben. Diese Empfehlung zählt wieder zu den anerkannten Empfehlungen, Leaderboard-Belohnungen und zum Network. Bereits on-chain ausgezahlte B3TR bleiben unverändert.' },
  fr: { title: 'Parrainage rétabli', body: 'Après examen, l’invalidation précédente a été annulée. Ce parrainage est de nouveau inclus dans les parrainages reconnus, les récompenses du classement et Network. Les B3TR déjà versés on-chain restent inchangés.' },
  ar: { title: 'تمت استعادة الإحالة', body: 'بعد المراجعة تم إلغاء قرار الإبطال السابق. عادت هذه الإحالة إلى عدد الإحالات المعترف بها ومكافآت لوحة الصدارة وNetwork. لن تتغير مكافآت B3TR المدفوعة سابقًا على السلسلة.' },
  bn: { title: 'রেফারেল পুনরুদ্ধার হয়েছে', body: 'পর্যালোচনার পর আগের বাতিলকরণ প্রত্যাহার করা হয়েছে। এই রেফারেলটি আবার স্বীকৃত রেফারেল সংখ্যা, লিডারবোর্ড রিওয়ার্ড এবং Network-এ অন্তর্ভুক্ত হয়েছে। ইতিমধ্যে অন-চেইনে দেওয়া B3TR অপরিবর্তিত থাকবে।' },
  pt: { title: 'Indicação restaurada', body: 'Após a revisão, a invalidação anterior foi revertida. Esta indicação volta a contar nas indicações reconhecidas, nas recompensas do ranking e no Network. O B3TR já pago on-chain não será alterado.' },
  ru: { title: 'Реферал восстановлен', body: 'После проверки прежняя отмена была снята. Этот реферал снова учитывается в подтверждённых приглашениях, наградах рейтинга и Network. Уже выплаченные on-chain B3TR не изменяются.' },
  id: { title: 'Referral dipulihkan', body: 'Setelah peninjauan, pembatalan sebelumnya dicabut. Referral ini kembali masuk ke jumlah referral yang diakui, total reward leaderboard, dan Network. B3TR yang sudah dibayar on-chain tidak berubah.' },
  vi: { title: 'Đã khôi phục lượt giới thiệu', body: 'Sau khi xem xét, quyết định vô hiệu trước đó đã được đảo ngược. Lượt giới thiệu này được tính lại vào số lượt giới thiệu hợp lệ, tổng thưởng trên bảng xếp hạng và Network. B3TR đã trả on-chain không thay đổi.' },
  'zh-tw': { title: '邀請紀錄已恢復', body: '經過複核，先前的無效處理已撤銷。此邀請重新計入有效邀請數、排行榜獎勵統計與 Network。鏈上已發放的 B3TR 不會變更。' },
  sv: { title: 'Referral återställd', body: 'Efter granskning återkallades den tidigare ogiltigförklaringen. Referral-posten räknas åter i giltiga referrals, leaderboard-belöningar och Network. B3TR som redan betalats on-chain ändras inte.' },
  ro: { title: 'Recomandare restabilită', body: 'După analiză, invalidarea anterioară a fost anulată. Recomandarea este inclusă din nou în numărul recunoscut, recompensele din clasament și Network. B3TR deja plătit on-chain rămâne neschimbat.' },
  ur: { title: 'ریفرل بحال ہوگیا', body: 'جائزے کے بعد پچھلی منسوخی واپس لے لی گئی ہے۔ یہ ریفرل دوبارہ تسلیم شدہ ریفرل گنتی، لیڈر بورڈ انعامات اور Network میں شامل ہے۔ پہلے سے آن چین ادا شدہ B3TR تبدیل نہیں ہوگا۔' },
  pcm: { title: 'Referral don restore', body: 'After review, we reverse the earlier invalidation. This referral don enter your valid referral count, leaderboard reward total and Network again. B3TR wey don already pay on-chain no change.' },
  arz: { title: 'الإحالة رجعت تاني', body: 'بعد المراجعة، الإلغاء اللي حصل قبل كده اتشال. الإحالة دي رجعت تتحسب في عدد الإحالات المعترف بيها ومكافآت الترتيب وNetwork. الـ B3TR اللي اتدفع بالفعل على السلسلة مش هيتغير.' },
  mr: { title: 'रेफरल पुन्हा बहाल झाला', body: 'तपासणीनंतर आधीची अमान्य कारवाई मागे घेण्यात आली. हा रेफरल पुन्हा मान्य रेफरल संख्या, लीडरबोर्ड रिवॉर्ड आणि Network मध्ये समाविष्ट झाला आहे. आधीच ऑन-चेन दिलेला B3TR बदलणार नाही.' },
  te: { title: 'రిఫరల్ పునరుద్ధరించబడింది', body: 'సమీక్ష తర్వాత గతంలో చేసిన చెల్లనిదిగా గుర్తింపును వెనక్కి తీసుకున్నారు. ఈ రిఫరల్ మళ్లీ గుర్తింపు పొందిన రిఫరల్ సంఖ్య, లీడర్‌బోర్డ్ రివార్డ్ మొత్తం మరియు Network‌లో చేర్చబడింది. ఇప్పటికే on-chain చెల్లించిన B3TR మారదు.' },
  sw: { title: 'Rufaa imerejeshwa', body: 'Baada ya ukaguzi, uondoaji wa awali umebatilishwa. Rufaa hii imejumuishwa tena kwenye idadi ya rufaa zinazotambuliwa, zawadi za leaderboard na Network. B3TR iliyolipwa tayari on-chain haitabadilika.' },
  ha: { title: 'An dawo da referral', body: 'Bayan dubawa, an soke matakin cire referral na baya. Referral ɗin ya koma cikin ƙididdigar referral da ake amincewa da ita, ladan leaderboard da Network. B3TR da aka riga aka biya on-chain ba zai canza ba.' },
  el: { title: 'Η παραπομπή αποκαταστάθηκε', body: 'Μετά τον έλεγχο, η προηγούμενη ακύρωση αναστράφηκε. Η παραπομπή υπολογίζεται ξανά στις αναγνωρισμένες προσκλήσεις, τις ανταμοιβές του leaderboard και το Network. Τα B3TR που έχουν ήδη πληρωθεί on-chain δεν αλλάζουν.' },
  cs: { title: 'Doporučení bylo obnoveno', body: 'Po kontrole bylo předchozí zneplatnění zrušeno. Toto doporučení se znovu započítává do uznaných doporučení, odměn v žebříčku a Network. B3TR již vyplacené on-chain zůstává beze změny.' },
};
