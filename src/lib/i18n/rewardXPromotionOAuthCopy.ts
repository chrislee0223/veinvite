import type { SupportedLocale } from './locales';

export type RewardXPromotionOAuthCopy = {
  connectX: string;
  connectedX: string;
  conflictBody: string;
  privateBody: string;
  failedBody: string;
};

export const REWARD_X_PROMOTION_OAUTH_COPY: Record<
  SupportedLocale,
  RewardXPromotionOAuthCopy
> = {
  en: {
    connectX: 'Connect X account',
    connectedX: 'X account connected. You can still submit the public post link manually.',
    conflictBody: 'This X account cannot be linked to this wallet. You can still submit the public post link manually.',
    privateBody: 'Only a public X account can be linked for this promotion. You can still submit a public post link manually.',
    failedBody: 'X account connection did not complete. Try again or submit the public post link manually.',
  },
  ko: {
    connectX: 'X 계정 연결',
    connectedX: 'X 계정이 연결됐어요. 공개 게시물 링크를 직접 제출하는 방식도 계속 사용할 수 있어요.',
    conflictBody: '이 X 계정은 이 지갑과 연결할 수 없어요. 공개 게시물 링크를 직접 제출하는 방식은 계속 사용할 수 있어요.',
    privateBody: '이 프로모션에는 공개 X 계정만 연결할 수 있어요. 공개 게시물 링크를 직접 제출하는 방식은 계속 사용할 수 있어요.',
    failedBody: 'X 계정 연결을 완료하지 못했어요. 다시 시도하거나 공개 게시물 링크를 직접 제출해 주세요.',
  },
  zh: {
    connectX: '连接 X 账号',
    connectedX: 'X 账号已连接。你仍可手动提交公开帖文链接。',
    conflictBody: '此 X 账号无法与当前钱包绑定。你仍可手动提交公开帖文链接。',
    privateBody: '此推广只能连接公开的 X 账号。你仍可手动提交公开帖文链接。',
    failedBody: 'X 账号连接未完成。请重试，或手动提交公开帖文链接。',
  },
  hi: {
    connectX: 'X खाता जोड़ें',
    connectedX: 'X खाता जुड़ गया है। आप सार्वजनिक पोस्ट का लिंक मैन्युअल रूप से भी जमा कर सकते हैं।',
    conflictBody: 'यह X खाता इस वॉलेट से नहीं जोड़ा जा सकता। आप सार्वजनिक पोस्ट का लिंक मैन्युअल रूप से जमा कर सकते हैं।',
    privateBody: 'इस प्रमोशन के लिए केवल सार्वजनिक X खाता जोड़ा जा सकता है। आप सार्वजनिक पोस्ट का लिंक मैन्युअल रूप से जमा कर सकते हैं।',
    failedBody: 'X खाता कनेक्शन पूरा नहीं हुआ। फिर कोशिश करें या सार्वजनिक पोस्ट का लिंक मैन्युअल रूप से जमा करें।',
  },
  es: {
    connectX: 'Conectar cuenta de X',
    connectedX: 'Cuenta de X conectada. También puedes enviar manualmente el enlace público de la publicación.',
    conflictBody: 'Esta cuenta de X no puede vincularse a este wallet. Aún puedes enviar manualmente el enlace público de la publicación.',
    privateBody: 'Solo se puede vincular una cuenta pública de X para esta promoción. Aún puedes enviar manualmente un enlace público.',
    failedBody: 'No se completó la conexión con X. Vuelve a intentarlo o envía manualmente el enlace público de la publicación.',
  },
  ja: {
    connectX: 'Xアカウントを連携',
    connectedX: 'Xアカウントを連携しました。公開ポストのURLを手動で送信する方法も引き続き利用できます。',
    conflictBody: 'このXアカウントは現在のウォレットに連携できません。公開ポストのURLは手動で送信できます。',
    privateBody: 'このプロモーションでは公開Xアカウントのみ連携できます。公開ポストのURLは手動で送信できます。',
    failedBody: 'Xアカウントの連携が完了しませんでした。もう一度試すか、公開ポストのURLを手動で送信してください。',
  },
  it: {
    connectX: 'Collega account X',
    connectedX: 'Account X collegato. Puoi comunque inviare manualmente il link pubblico del post.',
    conflictBody: 'Questo account X non può essere collegato a questo wallet. Puoi comunque inviare manualmente il link pubblico del post.',
    privateBody: 'Per questa promozione puoi collegare solo un account X pubblico. Puoi comunque inviare manualmente un link pubblico.',
    failedBody: 'Il collegamento dell’account X non è stato completato. Riprova oppure invia manualmente il link pubblico del post.',
  },
  tr: {
    connectX: 'X hesabını bağla',
    connectedX: 'X hesabın bağlandı. Herkese açık gönderi bağlantısını elle gönderme seçeneğini de kullanabilirsin.',
    conflictBody: 'Bu X hesabı bu cüzdana bağlanamaz. Herkese açık gönderi bağlantısını yine elle gönderebilirsin.',
    privateBody: 'Bu promosyon için yalnızca herkese açık bir X hesabı bağlanabilir. Gönderi bağlantısını yine elle gönderebilirsin.',
    failedBody: 'X hesabı bağlantısı tamamlanamadı. Tekrar dene veya herkese açık gönderi bağlantısını elle gönder.',
  },
  nl: {
    connectX: 'X-account koppelen',
    connectedX: 'X-account gekoppeld. Je kunt de openbare postlink ook handmatig blijven indienen.',
    conflictBody: 'Dit X-account kan niet aan deze wallet worden gekoppeld. Je kunt de openbare postlink nog steeds handmatig indienen.',
    privateBody: 'Voor deze promotie kan alleen een openbaar X-account worden gekoppeld. Je kunt nog steeds een openbare postlink handmatig indienen.',
    failedBody: 'Het koppelen van het X-account is niet voltooid. Probeer opnieuw of dien de openbare postlink handmatig in.',
  },
  de: {
    connectX: 'X-Konto verbinden',
    connectedX: 'X-Konto verbunden. Du kannst den öffentlichen Post-Link weiterhin manuell einreichen.',
    conflictBody: 'Dieses X-Konto kann nicht mit dieser Wallet verbunden werden. Du kannst den öffentlichen Post-Link weiterhin manuell einreichen.',
    privateBody: 'Für diese Promotion kann nur ein öffentliches X-Konto verbunden werden. Du kannst einen öffentlichen Post-Link weiterhin manuell einreichen.',
    failedBody: 'Die Verbindung mit dem X-Konto wurde nicht abgeschlossen. Versuche es erneut oder reiche den öffentlichen Post-Link manuell ein.',
  },
  fr: {
    connectX: 'Connecter le compte X',
    connectedX: 'Compte X connecté. Vous pouvez toujours envoyer manuellement le lien public du post.',
    conflictBody: 'Ce compte X ne peut pas être lié à ce wallet. Vous pouvez toujours envoyer manuellement le lien public du post.',
    privateBody: 'Seul un compte X public peut être lié pour cette promotion. Vous pouvez toujours envoyer manuellement un lien public.',
    failedBody: 'La connexion au compte X n’a pas abouti. Réessayez ou envoyez manuellement le lien public du post.',
  },
  ar: {
    connectX: 'ربط حساب X',
    connectedX: 'تم ربط حساب X. يمكنك أيضًا إرسال رابط المنشور العام يدويًا.',
    conflictBody: 'لا يمكن ربط حساب X هذا بهذه المحفظة. لا يزال بإمكانك إرسال رابط المنشور العام يدويًا.',
    privateBody: 'يمكن ربط حساب X عام فقط لهذه الترقية. لا يزال بإمكانك إرسال رابط منشور عام يدويًا.',
    failedBody: 'لم يكتمل ربط حساب X. حاول مرة أخرى أو أرسل رابط المنشور العام يدويًا.',
  },
  bn: {
    connectX: 'X অ্যাকাউন্ট যুক্ত করুন',
    connectedX: 'X অ্যাকাউন্ট যুক্ত হয়েছে। পাবলিক পোস্টের লিংক ম্যানুয়ালি জমা দেওয়ার অপশনও ব্যবহার করতে পারেন।',
    conflictBody: 'এই X অ্যাকাউন্টটি এই ওয়ালেটের সঙ্গে যুক্ত করা যাবে না। পাবলিক পোস্টের লিংক ম্যানুয়ালি জমা দিতে পারেন।',
    privateBody: 'এই প্রচারের জন্য শুধু পাবলিক X অ্যাকাউন্ট যুক্ত করা যাবে। পাবলিক পোস্টের লিংক ম্যানুয়ালি জমা দিতে পারেন।',
    failedBody: 'X অ্যাকাউন্ট সংযোগ সম্পূর্ণ হয়নি। আবার চেষ্টা করুন বা পাবলিক পোস্টের লিংক ম্যানুয়ালি জমা দিন।',
  },
  pt: {
    connectX: 'Conectar conta do X',
    connectedX: 'Conta do X conectada. Você também pode continuar enviando manualmente o link público da publicação.',
    conflictBody: 'Esta conta do X não pode ser vinculada a esta carteira. Você ainda pode enviar manualmente o link público da publicação.',
    privateBody: 'Apenas uma conta pública do X pode ser vinculada para esta promoção. Você ainda pode enviar manualmente um link público.',
    failedBody: 'A conexão da conta do X não foi concluída. Tente novamente ou envie manualmente o link público da publicação.',
  },
  ru: {
    connectX: 'Подключить аккаунт X',
    connectedX: 'Аккаунт X подключён. Ссылку на публичный пост также можно отправить вручную.',
    conflictBody: 'Этот аккаунт X нельзя привязать к этому кошельку. Ссылку на публичный пост можно отправить вручную.',
    privateBody: 'Для этой акции можно подключить только публичный аккаунт X. Ссылку на публичный пост можно отправить вручную.',
    failedBody: 'Подключение аккаунта X не завершено. Попробуйте снова или отправьте ссылку на публичный пост вручную.',
  },
  id: {
    connectX: 'Hubungkan akun X',
    connectedX: 'Akun X terhubung. Tautan Post publik juga tetap bisa dikirim secara manual.',
    conflictBody: 'Akun X ini tidak dapat dihubungkan ke wallet ini. Tautan Post publik masih dapat dikirim secara manual.',
    privateBody: 'Hanya akun X publik yang dapat dihubungkan untuk promosi ini. Tautan Post publik masih dapat dikirim secara manual.',
    failedBody: 'Koneksi akun X belum selesai. Coba lagi atau kirim tautan Post publik secara manual.',
  },
  vi: {
    connectX: 'Kết nối tài khoản X',
    connectedX: 'Đã kết nối tài khoản X. Bạn vẫn có thể gửi thủ công liên kết bài đăng công khai.',
    conflictBody: 'Tài khoản X này không thể liên kết với ví này. Bạn vẫn có thể gửi thủ công liên kết bài đăng công khai.',
    privateBody: 'Chỉ tài khoản X công khai mới có thể liên kết cho chương trình này. Bạn vẫn có thể gửi thủ công liên kết bài đăng công khai.',
    failedBody: 'Chưa hoàn tất kết nối tài khoản X. Hãy thử lại hoặc gửi thủ công liên kết bài đăng công khai.',
  },
  'zh-tw': {
    connectX: '連結 X 帳號',
    connectedX: 'X 帳號已連結。你仍可手動提交公開貼文連結。',
    conflictBody: '此 X 帳號無法與目前錢包連結。你仍可手動提交公開貼文連結。',
    privateBody: '此推廣只能連結公開的 X 帳號。你仍可手動提交公開貼文連結。',
    failedBody: 'X 帳號連結未完成。請重試，或手動提交公開貼文連結。',
  },
  sv: {
    connectX: 'Anslut X-konto',
    connectedX: 'X-kontot är anslutet. Du kan fortfarande skicka in den offentliga inläggslänken manuellt.',
    conflictBody: 'Det här X-kontot kan inte kopplas till den här plånboken. Du kan fortfarande skicka in den offentliga inläggslänken manuellt.',
    privateBody: 'Endast ett offentligt X-konto kan anslutas för kampanjen. Du kan fortfarande skicka in en offentlig länk manuellt.',
    failedBody: 'Anslutningen till X-kontot slutfördes inte. Försök igen eller skicka in den offentliga inläggslänken manuellt.',
  },
  ro: {
    connectX: 'Conectează contul X',
    connectedX: 'Contul X este conectat. Poți trimite în continuare manual linkul public al postării.',
    conflictBody: 'Acest cont X nu poate fi conectat la acest portofel. Poți trimite în continuare manual linkul public al postării.',
    privateBody: 'Pentru această promoție poate fi conectat doar un cont X public. Poți trimite în continuare manual un link public.',
    failedBody: 'Conectarea contului X nu a fost finalizată. Încearcă din nou sau trimite manual linkul public al postării.',
  },
  ur: {
    connectX: 'X اکاؤنٹ جوڑیں',
    connectedX: 'X اکاؤنٹ جڑ گیا ہے۔ عوامی پوسٹ کا لنک دستی طور پر بھی جمع کرایا جا سکتا ہے۔',
    conflictBody: 'یہ X اکاؤنٹ اس والیٹ سے نہیں جوڑا جا سکتا۔ عوامی پوسٹ کا لنک دستی طور پر جمع کرایا جا سکتا ہے۔',
    privateBody: 'اس پروموشن کے لیے صرف عوامی X اکاؤنٹ جوڑا جا سکتا ہے۔ عوامی پوسٹ کا لنک دستی طور پر جمع کرایا جا سکتا ہے۔',
    failedBody: 'X اکاؤنٹ کنکشن مکمل نہیں ہوا۔ دوبارہ کوشش کریں یا عوامی پوسٹ کا لنک دستی طور پر جمع کرائیں۔',
  },
  pcm: {
    connectX: 'Connect X account',
    connectedX: 'X account don connect. You fit still submit di public Post link by yourself.',
    conflictBody: 'Dis X account no fit connect to dis wallet. You fit still submit di public Post link by yourself.',
    privateBody: 'Na only public X account fit connect for dis promotion. You fit still submit public Post link by yourself.',
    failedBody: 'X account connection no complete. Try again or submit di public Post link by yourself.',
  },
  arz: {
    connectX: 'وصّل حساب X',
    connectedX: 'حساب X اتوصل. تقدر برضه تبعت لينك البوست العام يدوي.',
    conflictBody: 'حساب X ده ماينفعش يتوصل بالمحفظة دي. تقدر برضه تبعت لينك البوست العام يدوي.',
    privateBody: 'لازم حساب X يكون عام عشان يتوصل بالعرض ده. تقدر برضه تبعت لينك بوست عام يدوي.',
    failedBody: 'توصيل حساب X ماكملش. جرّب تاني أو ابعت لينك البوست العام يدوي.',
  },
  mr: {
    connectX: 'X खाते जोडा',
    connectedX: 'X खाते जोडले आहे. सार्वजनिक पोस्टची लिंक मॅन्युअलीही सबमिट करू शकता.',
    conflictBody: 'हे X खाते या वॉलेटशी जोडता येणार नाही. सार्वजनिक पोस्टची लिंक मॅन्युअली सबमिट करू शकता.',
    privateBody: 'या प्रमोशनसाठी फक्त सार्वजनिक X खाते जोडता येते. सार्वजनिक पोस्टची लिंक मॅन्युअली सबमिट करू शकता.',
    failedBody: 'X खाते जोडणे पूर्ण झाले नाही. पुन्हा प्रयत्न करा किंवा सार्वजनिक पोस्टची लिंक मॅन्युअली सबमिट करा.',
  },
  te: {
    connectX: 'X ఖాతాను కనెక్ట్ చేయండి',
    connectedX: 'X ఖాతా కనెక్ట్ అయింది. పబ్లిక్ పోస్ట్ లింక్‌ను మాన్యువల్‌గా కూడా సమర్పించవచ్చు.',
    conflictBody: 'ఈ X ఖాతాను ఈ వాలెట్‌కు కనెక్ట్ చేయలేరు. పబ్లిక్ పోస్ట్ లింక్‌ను మాన్యువల్‌గా సమర్పించవచ్చు.',
    privateBody: 'ఈ ప్రమోషన్‌కు పబ్లిక్ X ఖాతానే కనెక్ట్ చేయవచ్చు. పబ్లిక్ పోస్ట్ లింక్‌ను మాన్యువల్‌గా సమర్పించవచ్చు.',
    failedBody: 'X ఖాతా కనెక్షన్ పూర్తికాలేదు. మళ్లీ ప్రయత్నించండి లేదా పబ్లిక్ పోస్ట్ లింక్‌ను మాన్యువల్‌గా సమర్పించండి.',
  },
  sw: {
    connectX: 'Unganisha akaunti ya X',
    connectedX: 'Akaunti ya X imeunganishwa. Bado unaweza kuwasilisha kiungo cha chapisho la umma kwa mkono.',
    conflictBody: 'Akaunti hii ya X haiwezi kuunganishwa na pochi hii. Bado unaweza kuwasilisha kiungo cha chapisho la umma kwa mkono.',
    privateBody: 'Ni akaunti ya X ya umma pekee inayoweza kuunganishwa kwa promosheni hii. Bado unaweza kuwasilisha kiungo cha umma kwa mkono.',
    failedBody: 'Muunganisho wa akaunti ya X haukukamilika. Jaribu tena au wasilisha kiungo cha chapisho la umma kwa mkono.',
  },
  ha: {
    connectX: 'Haɗa asusun X',
    connectedX: 'An haɗa asusun X. Har yanzu za ka iya tura mahaɗin sakon jama’a da hannu.',
    conflictBody: 'Ba za a iya haɗa wannan asusun X da wannan wallet ba. Har yanzu za ka iya tura mahaɗin sakon jama’a da hannu.',
    privateBody: 'Asusun X na jama’a kawai za a iya haɗawa don wannan talla. Har yanzu za ka iya tura mahaɗin sakon jama’a da hannu.',
    failedBody: 'Haɗin asusun X bai kammala ba. Sake gwadawa ko tura mahaɗin sakon jama’a da hannu.',
  },
  el: {
    connectX: 'Σύνδεση λογαριασμού X',
    connectedX: 'Ο λογαριασμός X συνδέθηκε. Μπορείς επίσης να υποβάλεις χειροκίνητα τον δημόσιο σύνδεσμο της ανάρτησης.',
    conflictBody: 'Αυτός ο λογαριασμός X δεν μπορεί να συνδεθεί με αυτό το πορτοφόλι. Μπορείς ακόμα να υποβάλεις χειροκίνητα τον δημόσιο σύνδεσμο.',
    privateBody: 'Για αυτή την προώθηση μπορεί να συνδεθεί μόνο δημόσιος λογαριασμός X. Μπορείς ακόμα να υποβάλεις χειροκίνητα δημόσιο σύνδεσμο.',
    failedBody: 'Η σύνδεση του λογαριασμού X δεν ολοκληρώθηκε. Δοκίμασε ξανά ή υπέβαλε χειροκίνητα τον δημόσιο σύνδεσμο της ανάρτησης.',
  },
  cs: {
    connectX: 'Připojit účet X',
    connectedX: 'Účet X je připojený. Veřejný odkaz na příspěvek můžeš dál odeslat ručně.',
    conflictBody: 'Tento účet X nelze připojit k této peněžence. Veřejný odkaz na příspěvek můžeš dál odeslat ručně.',
    privateBody: 'Pro tuto propagaci lze připojit jen veřejný účet X. Veřejný odkaz na příspěvek můžeš dál odeslat ručně.',
    failedBody: 'Připojení účtu X nebylo dokončeno. Zkus to znovu nebo odešli veřejný odkaz na příspěvek ručně.',
  },
};
