import type { SupportedLocale } from './locales';

export type RewardXPromotionOAuthFeedbackCopy = {
  conflict: string;
  failed: string;
};

export const REWARD_X_PROMOTION_OAUTH_FEEDBACK_COPY: Record<
  SupportedLocale,
  RewardXPromotionOAuthFeedbackCopy
> = {
  en: {
    conflict: 'This X account cannot be linked to this wallet. Manual post URL submission is still available.',
    failed: 'X account connection did not complete. Retry or submit your public post URL manually.',
  },
  ko: {
    conflict: '이 X 계정은 다른 지갑과 연결되어 있어요. 게시물 링크 제출 방식은 계속 사용할 수 있어요.',
    failed: 'X 계정을 연결하지 못했어요. 다시 시도하거나 공개 게시물 링크를 직접 제출해 주세요.',
  },
  zh: {
    conflict: '此 X 账号无法连接到当前钱包。你仍可手动提交公开帖文链接。',
    failed: 'X 账号连接未完成。请重试，或手动提交公开帖文链接。',
  },
  'zh-tw': {
    conflict: '此 X 帳號無法連接到目前的錢包。你仍可手動提交公開貼文連結。',
    failed: 'X 帳號連接未完成。請重試，或手動提交公開貼文連結。',
  },
  ja: {
    conflict: 'このXアカウントは現在のウォレットに接続できません。公開ポストのリンクは引き続き手動で提出できます。',
    failed: 'Xアカウントの接続が完了しませんでした。再試行するか、公開ポストのリンクを手動で提出してください。',
  },
  es: {
    conflict: 'Esta cuenta de X no puede vincularse a esta cartera. Aún puedes enviar manualmente el enlace público de la publicación.',
    failed: 'No se completó la conexión de la cuenta de X. Vuelve a intentarlo o envía manualmente el enlace público de la publicación.',
  },
  de: {
    conflict: 'Dieses X-Konto kann nicht mit dieser Wallet verbunden werden. Du kannst den öffentlichen Post-Link weiterhin manuell einreichen.',
    failed: 'Die Verbindung mit dem X-Konto wurde nicht abgeschlossen. Versuche es erneut oder reiche den öffentlichen Post-Link manuell ein.',
  },
  fr: {
    conflict: 'Ce compte X ne peut pas être lié à ce wallet. Vous pouvez toujours envoyer manuellement le lien public du post.',
    failed: 'La connexion du compte X n’a pas abouti. Réessayez ou envoyez manuellement le lien public du post.',
  },
  it: {
    conflict: 'Questo account X non può essere collegato a questo wallet. Puoi comunque inviare manualmente il link pubblico del post.',
    failed: 'Il collegamento dell’account X non è stato completato. Riprova oppure invia manualmente il link pubblico del post.',
  },
  tr: {
    conflict: 'Bu X hesabı bu cüzdana bağlanamaz. Herkese açık gönderi bağlantısını yine de manuel olarak gönderebilirsin.',
    failed: 'X hesabı bağlantısı tamamlanmadı. Tekrar dene veya herkese açık gönderi bağlantısını manuel olarak gönder.',
  },
  nl: {
    conflict: 'Dit X-account kan niet aan deze wallet worden gekoppeld. Je kunt de openbare postlink nog steeds handmatig indienen.',
    failed: 'De koppeling met het X-account is niet voltooid. Probeer opnieuw of dien de openbare postlink handmatig in.',
  },
  pt: {
    conflict: 'Esta conta X não pode ser vinculada a esta carteira. Você ainda pode enviar manualmente o link público da publicação.',
    failed: 'A conexão da conta X não foi concluída. Tente novamente ou envie manualmente o link público da publicação.',
  },
  ru: {
    conflict: 'Этот аккаунт X нельзя привязать к этому кошельку. Публичную ссылку на пост всё ещё можно отправить вручную.',
    failed: 'Подключение аккаунта X не завершилось. Попробуйте ещё раз или отправьте публичную ссылку на пост вручную.',
  },
  id: {
    conflict: 'Akun X ini tidak dapat dihubungkan ke wallet ini. Anda tetap dapat mengirim tautan postingan publik secara manual.',
    failed: 'Koneksi akun X belum selesai. Coba lagi atau kirim tautan postingan publik secara manual.',
  },
  vi: {
    conflict: 'Không thể liên kết tài khoản X này với ví hiện tại. Bạn vẫn có thể gửi liên kết bài đăng công khai theo cách thủ công.',
    failed: 'Kết nối tài khoản X chưa hoàn tất. Hãy thử lại hoặc gửi thủ công liên kết bài đăng công khai.',
  },
  hi: {
    conflict: 'यह X खाता इस वॉलेट से लिंक नहीं हो सकता। आप सार्वजनिक पोस्ट का लिंक फिर भी मैन्युअली जमा कर सकते हैं।',
    failed: 'X खाते का कनेक्शन पूरा नहीं हुआ। फिर कोशिश करें या सार्वजनिक पोस्ट का लिंक मैन्युअली जमा करें।',
  },
  ar: {
    conflict: 'لا يمكن ربط حساب X هذا بهذه المحفظة. لا يزال بإمكانك إرسال رابط المنشور العام يدويًا.',
    failed: 'لم يكتمل ربط حساب X. حاول مرة أخرى أو أرسل رابط المنشور العام يدويًا.',
  },
  bn: {
    conflict: 'এই X অ্যাকাউন্টটি এই ওয়ালেটের সঙ্গে যুক্ত করা যাবে না। আপনি এখনও পাবলিক পোস্টের লিংক ম্যানুয়ালি জমা দিতে পারেন।',
    failed: 'X অ্যাকাউন্ট সংযোগ সম্পন্ন হয়নি। আবার চেষ্টা করুন অথবা পাবলিক পোস্টের লিংক ম্যানুয়ালি জমা দিন।',
  },
  sv: {
    conflict: 'Det här X-kontot kan inte kopplas till den här plånboken. Du kan fortfarande skicka in länken till det offentliga inlägget manuellt.',
    failed: 'Anslutningen till X-kontot slutfördes inte. Försök igen eller skicka in länken till det offentliga inlägget manuellt.',
  },
  ro: {
    conflict: 'Acest cont X nu poate fi conectat la acest portofel. Poți trimite în continuare manual linkul public al postării.',
    failed: 'Conectarea contului X nu s-a finalizat. Încearcă din nou sau trimite manual linkul public al postării.',
  },
  ur: {
    conflict: 'یہ X اکاؤنٹ اس والیٹ سے منسلک نہیں ہو سکتا۔ آپ عوامی پوسٹ کا لنک اب بھی دستی طور پر جمع کرا سکتے ہیں۔',
    failed: 'X اکاؤنٹ کا کنکشن مکمل نہیں ہوا۔ دوبارہ کوشش کریں یا عوامی پوسٹ کا لنک دستی طور پر جمع کریں۔',
  },
  pcm: {
    conflict: 'Dis X account no fit connect to dis wallet. You still fit submit di public post link by yourself.',
    failed: 'X account connection no complete. Try again or submit di public post link by yourself.',
  },
  arz: {
    conflict: 'حساب X ده مينفعش يتربط بالمحفظة دي. لسه تقدر تبعت لينك البوست العام يدوي.',
    failed: 'ربط حساب X مكملش. جرّب تاني أو ابعت لينك البوست العام يدوي.',
  },
  mr: {
    conflict: 'हे X खाते या वॉलेटशी जोडता येत नाही. तुम्ही सार्वजनिक पोस्टची लिंक अजूनही मॅन्युअली सादर करू शकता.',
    failed: 'X खाते जोडणे पूर्ण झाले नाही. पुन्हा प्रयत्न करा किंवा सार्वजनिक पोस्टची लिंक मॅन्युअली सादर करा.',
  },
  te: {
    conflict: 'ఈ X ఖాతాను ఈ వాలెట్‌కు కనెక్ట్ చేయలేరు. పబ్లిక్ పోస్ట్ లింక్‌ను మీరు ఇంకా మాన్యువల్‌గా సమర్పించవచ్చు.',
    failed: 'X ఖాతా కనెక్షన్ పూర్తికాలేదు. మళ్లీ ప్రయత్నించండి లేదా పబ్లిక్ పోస్ట్ లింక్‌ను మాన్యువల్‌గా సమర్పించండి.',
  },
  sw: {
    conflict: 'Akaunti hii ya X haiwezi kuunganishwa na pochi hii. Bado unaweza kutuma kiungo cha chapisho la umma mwenyewe.',
    failed: 'Muunganisho wa akaunti ya X haukukamilika. Jaribu tena au tuma mwenyewe kiungo cha chapisho la umma.',
  },
  ha: {
    conflict: 'Ba za a iya haɗa wannan asusun X da wannan wallet ba. Har yanzu za ka iya tura mahaɗin sakon jama’a da hannu.',
    failed: 'Haɗa asusun X bai kammala ba. Ka sake gwadawa ko ka tura mahaɗin sakon jama’a da hannu.',
  },
  el: {
    conflict: 'Αυτός ο λογαριασμός X δεν μπορεί να συνδεθεί με αυτό το πορτοφόλι. Μπορείς ακόμη να υποβάλεις χειροκίνητα τον δημόσιο σύνδεσμο της ανάρτησης.',
    failed: 'Η σύνδεση του λογαριασμού X δεν ολοκληρώθηκε. Δοκίμασε ξανά ή υπέβαλε χειροκίνητα τον δημόσιο σύνδεσμο της ανάρτησης.',
  },
  cs: {
    conflict: 'Tento účet X nelze připojit k této peněžence. Veřejný odkaz na příspěvek můžeš stále odeslat ručně.',
    failed: 'Připojení účtu X nebylo dokončeno. Zkus to znovu nebo ručně odešli veřejný odkaz na příspěvek.',
  },
};
