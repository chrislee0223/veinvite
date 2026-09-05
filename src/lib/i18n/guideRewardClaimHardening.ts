import { GUIDE_REWARD_STEP_COPY } from './guideRewardStepCopy';
import type { SupportedLocale } from './locales';

type RewardGuideCopy = {
  title: string;
  description: string;
};

const CLAIM_REWARD_GUIDE_COPY: Record<SupportedLocale, RewardGuideCopy> = {
  en: { title: 'Reward is fixed after final verification', description: 'When your friend completes all missions and passes final verification, VeInvite fixes your B3TR reward and reopens the friend slot. Open Rewards to claim the fixed amount; claiming never recalculates it.' },
  ko: { title: '최종 확인 후 보상이 확정돼요', description: '친구가 모든 미션을 완료하고 최종 확인을 통과하면 B3TR 보상이 확정되고 친구 슬롯이 다시 열려요. 받을 보상에서 보상 받기를 누르면 확정된 금액이 지급되며, 수령 시 금액을 다시 계산하지 않아요.' },
  zh: { title: '最终验证后奖励金额锁定', description: '好友完成全部任务并通过最终验证后，VeInvite 会锁定你的 B3TR 奖励并重新开放好友名额。请在奖励区领取已锁定的金额；领取时不会重新计算。' },
  hi: { title: 'अंतिम सत्यापन के बाद रिवॉर्ड तय होता है', description: 'दोस्त के सभी मिशन पूरे करके अंतिम सत्यापन पास करने पर VeInvite आपका B3TR रिवॉर्ड तय करता है और फ्रेंड स्लॉट फिर खोल देता है। Rewards में तय राशि क्लेम करें; क्लेम करते समय राशि दोबारा नहीं बदलती।' },
  es: { title: 'La recompensa queda fijada tras la verificación final', description: 'Cuando tu amigo completa todas las misiones y supera la verificación final, VeInvite fija tu recompensa B3TR y vuelve a liberar el espacio de amigo. Reclama el importe fijado en Recompensas; al cobrarlo no se recalcula.' },
  ja: { title: '最終確認後に報酬額が確定します', description: '友だちがすべてのミッションを完了して最終確認を通過すると、B3TR報酬額が確定し、友だちスロットが再び使えるようになります。報酬から確定額を受け取ってください。受取時に再計算はされません。' },
  it: { title: 'La ricompensa viene fissata dopo la verifica finale', description: 'Quando il tuo amico completa tutte le missioni e supera la verifica finale, VeInvite fissa la ricompensa B3TR e riapre lo slot amico. Ritira l’importo fissato in Ricompense: al momento del ritiro non viene ricalcolato.' },
  tr: { title: 'Ödül son doğrulamadan sonra sabitlenir', description: 'Arkadaşın tüm görevleri tamamlayıp son doğrulamayı geçtiğinde VeInvite B3TR ödülünü sabitler ve arkadaş slotunu yeniden açar. Ödüller bölümünden sabit tutarı al; talep sırasında tutar yeniden hesaplanmaz.' },
  nl: { title: 'De beloning wordt na de eindcontrole vastgezet', description: 'Wanneer je vriend alle missies voltooit en de eindcontrole doorstaat, zet VeInvite je B3TR-beloning vast en komt het vriendenslot weer vrij. Claim het vastgezette bedrag bij Beloningen; bij het claimen wordt het niet opnieuw berekend.' },
  de: { title: 'Die Belohnung wird nach der Abschlussprüfung festgelegt', description: 'Sobald dein Freund alle Missionen abgeschlossen und die Abschlussprüfung bestanden hat, legt VeInvite deine B3TR-Belohnung fest und gibt den Freundes-Slot wieder frei. Hole den festgelegten Betrag unter Belohnungen ab; beim Abholen wird er nicht neu berechnet.' },
  fr: { title: 'La récompense est fixée après la vérification finale', description: 'Lorsque votre ami termine toutes les missions et passe la vérification finale, VeInvite fixe votre récompense B3TR et libère de nouveau le créneau ami. Récupérez le montant fixé dans Récompenses ; il n’est pas recalculé au moment du retrait.' },
  ar: { title: 'تُثبَّت المكافأة بعد التحقق النهائي', description: 'عندما يُكمل صديقك جميع المهام ويجتاز التحقق النهائي، يثبّت VeInvite مكافأة B3TR ويفتح مكان الصديق من جديد. استلم المبلغ المثبت من قسم المكافآت؛ ولا يُعاد حسابه عند الاستلام.' },
  bn: { title: 'চূড়ান্ত যাচাইয়ের পর রিওয়ার্ড নির্ধারিত হয়', description: 'বন্ধু সব মিশন শেষ করে চূড়ান্ত যাচাই পাস করলে VeInvite আপনার B3TR রিওয়ার্ড নির্ধারণ করে এবং বন্ধুর স্লট আবার খুলে দেয়। Rewards থেকে নির্ধারিত অর্থ নিন; নেওয়ার সময় এটি আবার হিসাব করা হয় না।' },
  pt: { title: 'A recompensa é fixada após a verificação final', description: 'Quando seu amigo conclui todas as missões e passa pela verificação final, o VeInvite fixa sua recompensa B3TR e libera novamente o espaço de amigo. Receba o valor fixado em Recompensas; ele não é recalculado no momento do resgate.' },
  ru: { title: 'Награда фиксируется после финальной проверки', description: 'Когда друг завершает все миссии и проходит финальную проверку, VeInvite фиксирует вашу награду B3TR и снова освобождает слот друга. Получите зафиксированную сумму в разделе наград; при получении она не пересчитывается.' },
  id: { title: 'Reward ditetapkan setelah verifikasi akhir', description: 'Saat temanmu menyelesaikan semua misi dan lolos verifikasi akhir, VeInvite menetapkan reward B3TR-mu dan membuka kembali slot teman. Klaim jumlah yang sudah ditetapkan di Rewards; jumlahnya tidak dihitung ulang saat diklaim.' },
  vi: { title: 'Phần thưởng được chốt sau xác minh cuối', description: 'Khi bạn của bạn hoàn thành mọi nhiệm vụ và vượt qua xác minh cuối, VeInvite chốt phần thưởng B3TR và mở lại ô bạn bè. Hãy nhận số tiền đã chốt trong Phần thưởng; số tiền không được tính lại khi nhận.' },
  'zh-tw': { title: '最終驗證後獎勵金額會鎖定', description: '好友完成全部任務並通過最終驗證後，VeInvite 會鎖定你的 B3TR 獎勵並重新開放好友名額。請在獎勵區領取已鎖定的金額；領取時不會重新計算。' },
  sv: { title: 'Belöningen fastställs efter slutkontrollen', description: 'När din vän har slutfört alla uppdrag och klarat slutkontrollen fastställer VeInvite din B3TR-belöning och öppnar vänplatsen igen. Hämta det fastställda beloppet under Belöningar; det räknas inte om när du hämtar det.' },
  ro: { title: 'Recompensa este fixată după verificarea finală', description: 'Când prietenul tău termină toate misiunile și trece verificarea finală, VeInvite fixează recompensa B3TR și redeschide slotul de prieten. Încasează suma fixată din Recompense; aceasta nu este recalculată la încasare.' },
  ur: { title: 'آخری تصدیق کے بعد انعام مقرر ہو جاتا ہے', description: 'جب آپ کا دوست تمام مشن مکمل کرکے آخری تصدیق پاس کرتا ہے تو VeInvite آپ کا B3TR انعام مقرر کرتا ہے اور دوست کا سلاٹ دوبارہ کھول دیتا ہے۔ Rewards میں مقرر رقم وصول کریں؛ وصول کرتے وقت رقم دوبارہ حساب نہیں ہوتی۔' },
  pcm: { title: 'Reward go lock after final check', description: 'When your friend finish all mission and final check pass, VeInvite go lock your B3TR reward and free the friend slot again. Go Rewards collect the amount wey don lock; e no go calculate am again when you collect.' },
  arz: { title: 'المكافأة بتتثبت بعد التحقق النهائي', description: 'لما صاحبك يخلص كل المهام ويعدّي التحقق النهائي، VeInvite بيثبّت مكافأة B3TR ويفتح مكان الصديق تاني. استلم المبلغ المثبت من المكافآت؛ المبلغ مش بيتحسب من جديد وقت الاستلام.' },
  mr: { title: 'अंतिम पडताळणीनंतर रिवॉर्ड निश्चित होते', description: 'मित्राने सर्व मिशन पूर्ण करून अंतिम पडताळणी पास केल्यावर VeInvite तुमचे B3TR रिवॉर्ड निश्चित करते आणि मित्र स्लॉट पुन्हा उघडते. Rewards मधून निश्चित रक्कम घ्या; घेताना ती पुन्हा मोजली जात नाही.' },
  te: { title: 'తుది ధృవీకరణ తర్వాత రివార్డ్ స్థిరపడుతుంది', description: 'మీ స్నేహితుడు అన్ని మిషన్లు పూర్తి చేసి తుది ధృవీకరణలో ఉత్తీర్ణుడైతే VeInvite మీ B3TR రివార్డ్‌ను స్థిరపరచి ఫ్రెండ్ స్లాట్‌ను మళ్లీ తెరుస్తుంది. Rewards నుంచి స్థిరమైన మొత్తాన్ని పొందండి; తీసుకునే సమయంలో మళ్లీ లెక్కించదు.' },
  sw: { title: 'Zawadi huwekwa baada ya uthibitishaji wa mwisho', description: 'Rafiki yako akimaliza misheni zote na kupita uthibitishaji wa mwisho, VeInvite huweka kiasi cha zawadi yako ya B3TR na kufungua tena nafasi ya rafiki. Chukua kiasi kilichowekwa kwenye Rewards; hakihesabiwi upya unapokichukua.' },
  ha: { title: 'Ana kulle ladan bayan tabbatarwar ƙarshe', description: 'Idan abokinka ya kammala dukkan ayyuka kuma ya wuce tabbatarwar ƙarshe, VeInvite zai kulle ladan B3TR ɗinka kuma ya sake buɗe gurbin aboki. Karɓi adadin da aka kulle a Rewards; ba a sake lissafa shi lokacin karɓa.' },
  el: { title: 'Η ανταμοιβή οριστικοποιείται μετά τον τελικό έλεγχο', description: 'Όταν ο φίλος σου ολοκληρώσει όλες τις αποστολές και περάσει τον τελικό έλεγχο, το VeInvite οριστικοποιεί την ανταμοιβή B3TR και ελευθερώνει ξανά τη θέση φίλου. Άνοιξε τις Ανταμοιβές για να λάβεις το οριστικό ποσό· δεν υπολογίζεται ξανά κατά τη λήψη.' },
};

for (const [locale, copy] of Object.entries(CLAIM_REWARD_GUIDE_COPY)) {
  GUIDE_REWARD_STEP_COPY[locale] = copy;
}
