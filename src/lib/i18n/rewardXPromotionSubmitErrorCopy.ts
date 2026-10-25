import type { SupportedLocale } from './locales';

export type RewardXPromotionSubmitErrorCopy = {
  invalidPost: string;
  walletAccess: string;
  conflict: string;
  rateLimited: string;
  unavailable: string;
};

export const REWARD_X_PROMOTION_SUBMIT_ERROR_COPY: Record<
  SupportedLocale,
  RewardXPromotionSubmitErrorCopy
> = {
  en: {
    invalidPost: 'Paste a valid public X post link.',
    walletAccess: 'Check your connected wallet and try again.',
    conflict: 'This post cannot be used for this promotion. Check the promotion status and try another eligible post.',
    rateLimited: 'Too many verification attempts. Wait a moment and try again.',
    unavailable: 'We could not verify this X post right now. Try again shortly.',
  },
  ko: {
    invalidPost: '올바른 공개 X 게시물 링크를 붙여 주세요.',
    walletAccess: '연결된 지갑을 확인한 뒤 다시 시도해 주세요.',
    conflict: '이 게시물은 현재 프로모션에 사용할 수 없어요. 프로모션 상태를 확인하고 다른 대상 게시물로 다시 시도해 주세요.',
    rateLimited: '확인 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.',
    unavailable: '지금은 X 게시물을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.',
  },
  zh: {
    invalidPost: '请粘贴有效的公开 X 帖文链接。',
    walletAccess: '请检查当前连接的钱包后重试。',
    conflict: '此帖文目前不能用于该推广。请检查推广状态，并换一篇符合条件的帖文重试。',
    rateLimited: '验证尝试过于频繁，请稍后再试。',
    unavailable: '暂时无法验证此 X 帖文，请稍后再试。',
  },
  'zh-tw': {
    invalidPost: '請貼上有效的公開 X 貼文連結。',
    walletAccess: '請檢查目前連接的錢包後再試一次。',
    conflict: '此貼文目前無法用於這項推廣。請確認推廣狀態，並改用其他符合資格的貼文。',
    rateLimited: '驗證嘗試過於頻繁，請稍後再試。',
    unavailable: '目前無法驗證這篇 X 貼文，請稍後再試。',
  },
  ja: {
    invalidPost: '有効な公開Xポストのリンクを貼り付けてください。',
    walletAccess: '接続中のウォレットを確認して、もう一度お試しください。',
    conflict: 'このポストは現在このプロモーションには使用できません。状態を確認し、別の対象ポストでお試しください。',
    rateLimited: '確認回数が多すぎます。少し待ってからもう一度お試しください。',
    unavailable: '現在このXポストを確認できません。しばらくしてからもう一度お試しください。',
  },
  es: {
    invalidPost: 'Pega un enlace válido a una publicación pública de X.',
    walletAccess: 'Comprueba la cartera conectada e inténtalo de nuevo.',
    conflict: 'Esta publicación no puede usarse ahora para esta promoción. Revisa el estado y prueba con otra publicación válida.',
    rateLimited: 'Hay demasiados intentos de verificación. Espera un momento y vuelve a intentarlo.',
    unavailable: 'No podemos verificar esta publicación de X ahora mismo. Inténtalo de nuevo en breve.',
  },
  de: {
    invalidPost: 'Füge einen gültigen Link zu einem öffentlichen X-Post ein.',
    walletAccess: 'Prüfe die verbundene Wallet und versuche es erneut.',
    conflict: 'Dieser Post kann derzeit nicht für diese Promotion verwendet werden. Prüfe den Status und versuche es mit einem anderen gültigen Post.',
    rateLimited: 'Zu viele Prüfversuche. Warte einen Moment und versuche es erneut.',
    unavailable: 'Dieser X-Post kann gerade nicht geprüft werden. Versuche es in Kürze erneut.',
  },
  fr: {
    invalidPost: 'Collez un lien valide vers un post X public.',
    walletAccess: 'Vérifiez le wallet connecté puis réessayez.',
    conflict: 'Ce post ne peut pas être utilisé pour cette promotion pour le moment. Vérifiez le statut et essayez avec un autre post éligible.',
    rateLimited: 'Trop de tentatives de vérification. Patientez un instant puis réessayez.',
    unavailable: 'Impossible de vérifier ce post X pour le moment. Réessayez dans un instant.',
  },
  it: {
    invalidPost: 'Incolla un link valido a un post X pubblico.',
    walletAccess: 'Controlla il wallet collegato e riprova.',
    conflict: 'Questo post non può essere usato ora per questa promozione. Controlla lo stato e prova con un altro post idoneo.',
    rateLimited: 'Troppi tentativi di verifica. Attendi un momento e riprova.',
    unavailable: 'Non possiamo verificare questo post X in questo momento. Riprova tra poco.',
  },
  tr: {
    invalidPost: 'Geçerli ve herkese açık bir X gönderisi bağlantısı yapıştır.',
    walletAccess: 'Bağlı cüzdanı kontrol edip tekrar dene.',
    conflict: 'Bu gönderi şu anda bu promosyon için kullanılamaz. Promosyon durumunu kontrol edip başka bir uygun gönderiyle tekrar dene.',
    rateLimited: 'Çok fazla doğrulama denemesi yapıldı. Biraz bekleyip tekrar dene.',
    unavailable: 'Bu X gönderisini şu anda doğrulayamıyoruz. Biraz sonra tekrar dene.',
  },
  nl: {
    invalidPost: 'Plak een geldige link naar een openbare X-post.',
    walletAccess: 'Controleer de gekoppelde wallet en probeer het opnieuw.',
    conflict: 'Deze post kan nu niet voor deze promotie worden gebruikt. Controleer de status en probeer een andere geldige post.',
    rateLimited: 'Te veel verificatiepogingen. Wacht even en probeer het opnieuw.',
    unavailable: 'We kunnen deze X-post nu niet verifiëren. Probeer het over een moment opnieuw.',
  },
  pt: {
    invalidPost: 'Cole um link válido de uma publicação pública no X.',
    walletAccess: 'Confira a carteira conectada e tente novamente.',
    conflict: 'Esta publicação não pode ser usada nesta promoção agora. Confira o status e tente outra publicação elegível.',
    rateLimited: 'Muitas tentativas de verificação. Aguarde um momento e tente novamente.',
    unavailable: 'Não foi possível verificar esta publicação no X agora. Tente novamente em instantes.',
  },
  ru: {
    invalidPost: 'Вставьте действительную ссылку на публичный пост в X.',
    walletAccess: 'Проверьте подключённый кошелёк и попробуйте снова.',
    conflict: 'Этот пост сейчас нельзя использовать для этой акции. Проверьте статус и попробуйте другой подходящий пост.',
    rateLimited: 'Слишком много попыток проверки. Подождите немного и попробуйте снова.',
    unavailable: 'Сейчас не удаётся проверить этот пост в X. Попробуйте ещё раз немного позже.',
  },
  id: {
    invalidPost: 'Tempel tautan post X publik yang valid.',
    walletAccess: 'Periksa wallet yang terhubung lalu coba lagi.',
    conflict: 'Post ini belum dapat digunakan untuk promosi ini. Periksa status promosi lalu coba post lain yang memenuhi syarat.',
    rateLimited: 'Terlalu banyak percobaan verifikasi. Tunggu sebentar lalu coba lagi.',
    unavailable: 'Post X ini belum dapat diverifikasi sekarang. Coba lagi sebentar lagi.',
  },
  vi: {
    invalidPost: 'Hãy dán liên kết hợp lệ đến một bài đăng X công khai.',
    walletAccess: 'Hãy kiểm tra ví đang kết nối rồi thử lại.',
    conflict: 'Bài đăng này hiện không thể dùng cho chương trình quảng bá. Hãy kiểm tra trạng thái và thử một bài đăng hợp lệ khác.',
    rateLimited: 'Có quá nhiều lần thử xác minh. Hãy chờ một chút rồi thử lại.',
    unavailable: 'Hiện chưa thể xác minh bài đăng X này. Hãy thử lại sau ít phút.',
  },
  hi: {
    invalidPost: 'किसी मान्य सार्वजनिक X पोस्ट का लिंक पेस्ट करें।',
    walletAccess: 'कनेक्टेड वॉलेट जाँचें और फिर कोशिश करें।',
    conflict: 'यह पोस्ट अभी इस प्रमोशन के लिए इस्तेमाल नहीं की जा सकती। प्रमोशन की स्थिति जाँचें और किसी दूसरी योग्य पोस्ट से कोशिश करें।',
    rateLimited: 'बहुत ज़्यादा सत्यापन प्रयास हुए हैं। थोड़ा इंतज़ार करके फिर कोशिश करें।',
    unavailable: 'अभी इस X पोस्ट की पुष्टि नहीं हो पा रही है। थोड़ी देर बाद फिर कोशिश करें।',
  },
  ar: {
    invalidPost: 'الصق رابطًا صالحًا لمنشور عام على X.',
    walletAccess: 'تحقق من المحفظة المتصلة ثم حاول مرة أخرى.',
    conflict: 'لا يمكن استخدام هذا المنشور لهذه الترقية حاليًا. تحقق من حالة الترقية وجرّب منشورًا مؤهلًا آخر.',
    rateLimited: 'هناك محاولات تحقق كثيرة جدًا. انتظر قليلًا ثم حاول مرة أخرى.',
    unavailable: 'لا يمكن التحقق من منشور X هذا الآن. حاول مرة أخرى بعد قليل.',
  },
  bn: {
    invalidPost: 'একটি বৈধ পাবলিক X পোস্টের লিংক পেস্ট করুন।',
    walletAccess: 'সংযুক্ত ওয়ালেটটি পরীক্ষা করে আবার চেষ্টা করুন।',
    conflict: 'এই পোস্টটি এখন এই প্রচারের জন্য ব্যবহার করা যাবে না। প্রচারের অবস্থা দেখে অন্য একটি যোগ্য পোস্ট দিয়ে চেষ্টা করুন।',
    rateLimited: 'অনেকবার যাচাইয়ের চেষ্টা করা হয়েছে। একটু অপেক্ষা করে আবার চেষ্টা করুন।',
    unavailable: 'এই X পোস্টটি এখন যাচাই করা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।',
  },
  sv: {
    invalidPost: 'Klistra in en giltig länk till ett offentligt X-inlägg.',
    walletAccess: 'Kontrollera den anslutna plånboken och försök igen.',
    conflict: 'Det här inlägget kan inte användas för kampanjen just nu. Kontrollera statusen och prova ett annat giltigt inlägg.',
    rateLimited: 'För många verifieringsförsök. Vänta en stund och försök igen.',
    unavailable: 'Det går inte att verifiera det här X-inlägget just nu. Försök igen om en stund.',
  },
  ro: {
    invalidPost: 'Lipește un link valid către o postare publică de pe X.',
    walletAccess: 'Verifică portofelul conectat și încearcă din nou.',
    conflict: 'Această postare nu poate fi folosită acum pentru această promoție. Verifică starea și încearcă o altă postare eligibilă.',
    rateLimited: 'Prea multe încercări de verificare. Așteaptă puțin și încearcă din nou.',
    unavailable: 'Nu putem verifica acum această postare de pe X. Încearcă din nou în scurt timp.',
  },
  ur: {
    invalidPost: 'عوامی X پوسٹ کا درست لنک پیسٹ کریں۔',
    walletAccess: 'منسلک والیٹ چیک کریں اور دوبارہ کوشش کریں۔',
    conflict: 'یہ پوسٹ ابھی اس پروموشن کے لیے استعمال نہیں ہو سکتی۔ پروموشن کی حالت دیکھیں اور کسی دوسری اہل پوسٹ سے کوشش کریں۔',
    rateLimited: 'تصدیق کی بہت زیادہ کوششیں ہو گئی ہیں۔ کچھ دیر انتظار کرکے دوبارہ کوشش کریں۔',
    unavailable: 'اس X پوسٹ کی ابھی تصدیق نہیں ہو سکتی۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔',
  },
  pcm: {
    invalidPost: 'Paste correct public X post link.',
    walletAccess: 'Check di wallet wey connect and try again.',
    conflict: 'Dis post no fit work for dis promotion now. Check di promotion status and try another post wey qualify.',
    rateLimited: 'Verification attempts don too plenty. Wait small and try again.',
    unavailable: 'We no fit verify dis X post now. Try again small time.',
  },
  arz: {
    invalidPost: 'حط لينك صحيح لبوست عام على X.',
    walletAccess: 'راجع المحفظة المتوصلة وجرّب تاني.',
    conflict: 'البوست ده مش متاح للترقية دي دلوقتي. راجع حالة الترقية وجرّب بوست مؤهل تاني.',
    rateLimited: 'محاولات التحقق كتير قوي. استنى شوية وجرّب تاني.',
    unavailable: 'مش قادرين نتحقق من بوست X ده دلوقتي. جرّب تاني كمان شوية.',
  },
  mr: {
    invalidPost: 'वैध सार्वजनिक X पोस्टची लिंक पेस्ट करा.',
    walletAccess: 'जोडलेले वॉलेट तपासा आणि पुन्हा प्रयत्न करा.',
    conflict: 'ही पोस्ट सध्या या प्रमोशनसाठी वापरता येणार नाही. प्रमोशनची स्थिती तपासा आणि दुसरी पात्र पोस्ट वापरून पाहा.',
    rateLimited: 'तपासणीचे खूप प्रयत्न झाले आहेत. थोडे थांबून पुन्हा प्रयत्न करा.',
    unavailable: 'ही X पोस्ट सध्या तपासता येत नाही. थोड्या वेळाने पुन्हा प्रयत्न करा.',
  },
  te: {
    invalidPost: 'చెల్లుబాటు అయ్యే పబ్లిక్ X పోస్ట్ లింక్‌ను పేస్ట్ చేయండి.',
    walletAccess: 'కనెక్ట్ చేసిన వాలెట్‌ను తనిఖీ చేసి మళ్లీ ప్రయత్నించండి.',
    conflict: 'ఈ పోస్ట్‌ను ప్రస్తుతం ఈ ప్రమోషన్ కోసం ఉపయోగించలేరు. ప్రమోషన్ స్థితిని చూసి మరో అర్హమైన పోస్ట్‌తో ప్రయత్నించండి.',
    rateLimited: 'చాలా ఎక్కువ ధృవీకరణ ప్రయత్నాలు జరిగాయి. కొద్దిసేపు ఆగి మళ్లీ ప్రయత్నించండి.',
    unavailable: 'ఈ X పోస్ట్‌ను ప్రస్తుతం ధృవీకరించలేకపోతున్నాం. కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.',
  },
  sw: {
    invalidPost: 'Bandika kiungo halali cha chapisho la umma kwenye X.',
    walletAccess: 'Kagua pochi iliyounganishwa kisha ujaribu tena.',
    conflict: 'Chapisho hili haliwezi kutumika kwa promosheni hii sasa. Kagua hali ya promosheni na ujaribu chapisho jingine linalokubalika.',
    rateLimited: 'Majaribio ya uthibitishaji ni mengi sana. Subiri kidogo kisha ujaribu tena.',
    unavailable: 'Hatuwezi kuthibitisha chapisho hili la X sasa. Jaribu tena baada ya muda mfupi.',
  },
  ha: {
    invalidPost: 'Liƙa ingantaccen mahaɗin sakon X na jama’a.',
    walletAccess: 'Duba wallet ɗin da aka haɗa sannan ka sake gwadawa.',
    conflict: 'Ba za a iya amfani da wannan sakon don wannan talla yanzu ba. Duba matsayin tallan sannan ka gwada wani sakon da ya cancanta.',
    rateLimited: 'An yi ƙoƙarin tabbatarwa da yawa. Jira kaɗan sannan ka sake gwadawa.',
    unavailable: 'Ba za mu iya tabbatar da wannan sakon X yanzu ba. Ka sake gwadawa nan ba da jimawa ba.',
  },
  el: {
    invalidPost: 'Επικόλλησε έναν έγκυρο σύνδεσμο δημόσιας ανάρτησης στο X.',
    walletAccess: 'Έλεγξε το συνδεδεμένο πορτοφόλι και δοκίμασε ξανά.',
    conflict: 'Αυτή η ανάρτηση δεν μπορεί να χρησιμοποιηθεί τώρα για αυτή την προώθηση. Έλεγξε την κατάσταση και δοκίμασε άλλη επιλέξιμη ανάρτηση.',
    rateLimited: 'Έγιναν πάρα πολλές προσπάθειες επαλήθευσης. Περίμενε λίγο και δοκίμασε ξανά.',
    unavailable: 'Δεν μπορούμε να επαληθεύσουμε αυτή την ανάρτηση X τώρα. Δοκίμασε ξανά σε λίγο.',
  },
  cs: {
    invalidPost: 'Vlož platný odkaz na veřejný příspěvek na X.',
    walletAccess: 'Zkontroluj připojenou peněženku a zkus to znovu.',
    conflict: 'Tento příspěvek teď nelze pro tuto propagaci použít. Zkontroluj stav a zkus jiný způsobilý příspěvek.',
    rateLimited: 'Příliš mnoho pokusů o ověření. Chvíli počkej a zkus to znovu.',
    unavailable: 'Tento příspěvek na X teď nelze ověřit. Zkus to za chvíli znovu.',
  },
};

export function rewardXPromotionSubmitError(
  locale: SupportedLocale,
  status: number,
): string {
  const copy = REWARD_X_PROMOTION_SUBMIT_ERROR_COPY[locale];
  if (status === 400) return copy.invalidPost;
  if (status === 401 || status === 403) return copy.walletAccess;
  if (status === 409) return copy.conflict;
  if (status === 429) return copy.rateLimited;
  return copy.unavailable;
}
