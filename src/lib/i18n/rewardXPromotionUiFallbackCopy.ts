import type { SupportedLocale } from './locales';

export type RewardXPromotionUiFallbackCopy = {
  connectX: string;
  connectedX: string;
  autoBody: string;
  autoGraceBody: string;
  submitError: string;
};

export const REWARD_X_PROMOTION_UI_FALLBACK_COPY: Record<
  SupportedLocale,
  RewardXPromotionUiFallbackCopy
> = {
  en: {
    connectX: "Connect X account",
    connectedX: "X account connected. Public posts can be checked automatically.",
    autoBody: "Share on X within 24 hours and keep the post public for at least 24 hours. VeInvite checks it automatically, so no post URL is needed.",
    autoGraceBody: "The sharing window has ended. Keep any eligible post public while VeInvite completes the automatic 24-hour check.",
    submitError: "We could not verify this X post right now. Check the link and try again shortly.",
  },
  ko: {
    connectX: "X 계정 연결",
    connectedX: "X 계정이 연결됐어요. 공개 게시물을 자동으로 확인할 수 있어요.",
    autoBody: "24시간 안에 X에 공유하고 게시물을 최소 24시간 공개 상태로 유지해 주세요. VeInvite가 자동으로 확인하므로 게시물 URL을 제출할 필요가 없어요.",
    autoGraceBody: "공유 가능 시간이 끝났어요. VeInvite의 24시간 자동 확인이 끝날 때까지 대상 게시물을 공개 상태로 유지해 주세요.",
    submitError: "지금은 X 게시물을 확인할 수 없어요. 링크를 확인한 뒤 잠시 후 다시 시도해 주세요.",
  },
  zh: {
    connectX: "连接 X 账号",
    connectedX: "X 账号已连接，可自动检查公开帖文。",
    autoBody: "请在 24 小时内分享到 X，并让帖文至少保持公开 24 小时。VeInvite 会自动检查，无需提交帖文链接。",
    autoGraceBody: "分享时间已结束。请让符合条件的帖文继续保持公开，直到 VeInvite 完成 24 小时自动检查。",
    submitError: "目前无法验证这篇 X 帖文。请检查链接后稍后重试。",
  },
  "zh-tw": {
    connectX: "連接 X 帳號",
    connectedX: "X 帳號已連接，可自動檢查公開貼文。",
    autoBody: "請在 24 小時內分享到 X，並讓貼文至少保持公開 24 小時。VeInvite 會自動檢查，不需要提交貼文連結。",
    autoGraceBody: "分享時間已結束。請讓符合資格的貼文保持公開，直到 VeInvite 完成 24 小時自動檢查。",
    submitError: "目前無法驗證這篇 X 貼文。請檢查連結後稍後再試。",
  },
  ja: {
    connectX: "Xアカウントを接続",
    connectedX: "Xアカウントを接続しました。公開ポストを自動確認できます。",
    autoBody: "24時間以内にXへ共有し、ポストを少なくとも24時間公開したままにしてください。VeInviteが自動確認するため、URLの提出は不要です。",
    autoGraceBody: "共有期限は終了しました。VeInviteの24時間自動確認が完了するまで対象ポストを公開したままにしてください。",
    submitError: "現在このXポストを確認できません。リンクを確認して、しばらくしてから再試行してください。",
  },
  es: {
    connectX: "Conectar cuenta de X",
    connectedX: "La cuenta de X está conectada. Las publicaciones públicas pueden revisarse automáticamente.",
    autoBody: "Comparte en X dentro de 24 horas y mantén la publicación pública al menos 24 horas. VeInvite la revisa automáticamente; no hace falta enviar la URL.",
    autoGraceBody: "El plazo para compartir terminó. Mantén pública cualquier publicación válida hasta que VeInvite complete la revisión automática de 24 horas.",
    submitError: "No podemos verificar esta publicación de X ahora. Revisa el enlace e inténtalo de nuevo en breve.",
  },
  de: {
    connectX: "X-Konto verbinden",
    connectedX: "X-Konto verbunden. Öffentliche Posts können automatisch geprüft werden.",
    autoBody: "Teile innerhalb von 24 Stunden auf X und lass den Post mindestens 24 Stunden öffentlich. VeInvite prüft ihn automatisch; eine URL-Einreichung ist nicht nötig.",
    autoGraceBody: "Das Zeitfenster ist abgelaufen. Lass einen berechtigten Post öffentlich, bis VeInvite die automatische 24-Stunden-Prüfung abgeschlossen hat.",
    submitError: "Dieser X-Post kann gerade nicht geprüft werden. Prüfe den Link und versuche es in Kürze erneut.",
  },
  fr: {
    connectX: "Connecter le compte X",
    connectedX: "Compte X connecté. Les posts publics peuvent être vérifiés automatiquement.",
    autoBody: "Partagez sur X dans les 24 heures et gardez le post public pendant au moins 24 heures. VeInvite le vérifie automatiquement, sans URL à envoyer.",
    autoGraceBody: "La période de partage est terminée. Gardez tout post éligible public jusqu’à la fin du contrôle automatique de 24 heures.",
    submitError: "Impossible de vérifier ce post X pour le moment. Vérifiez le lien puis réessayez dans un instant.",
  },
  it: {
    connectX: "Collega account X",
    connectedX: "Account X collegato. I post pubblici possono essere verificati automaticamente.",
    autoBody: "Condividi su X entro 24 ore e mantieni il post pubblico per almeno 24 ore. VeInvite lo verifica automaticamente; non serve inviare l’URL.",
    autoGraceBody: "Il periodo di condivisione è terminato. Mantieni pubblico un post idoneo finché VeInvite completa il controllo automatico di 24 ore.",
    submitError: "Non possiamo verificare questo post X in questo momento. Controlla il link e riprova tra poco.",
  },
  tr: {
    connectX: "X hesabını bağla",
    connectedX: "X hesabı bağlandı. Herkese açık gönderiler otomatik kontrol edilebilir.",
    autoBody: "24 saat içinde X'te paylaş ve gönderiyi en az 24 saat herkese açık tut. VeInvite otomatik kontrol eder; gönderi URL'si göndermene gerek yok.",
    autoGraceBody: "Paylaşım süresi doldu. VeInvite 24 saatlik otomatik kontrolü tamamlayana kadar uygun gönderiyi herkese açık tut.",
    submitError: "Bu X gönderisini şu anda doğrulayamıyoruz. Bağlantıyı kontrol edip kısa süre sonra tekrar dene.",
  },
  nl: {
    connectX: "X-account koppelen",
    connectedX: "X-account gekoppeld. Openbare posts kunnen automatisch worden gecontroleerd.",
    autoBody: "Deel binnen 24 uur op X en houd de post minstens 24 uur openbaar. VeInvite controleert automatisch; je hoeft geen URL in te dienen.",
    autoGraceBody: "De deelperiode is voorbij. Houd een geldige post openbaar totdat VeInvite de automatische controle van 24 uur heeft afgerond.",
    submitError: "We kunnen deze X-post nu niet verifiëren. Controleer de link en probeer het binnenkort opnieuw.",
  },
  pt: {
    connectX: "Conectar conta X",
    connectedX: "Conta X conectada. Publicações públicas podem ser verificadas automaticamente.",
    autoBody: "Compartilhe no X em até 24 horas e mantenha a publicação pública por pelo menos 24 horas. O VeInvite verifica automaticamente; não é preciso enviar a URL.",
    autoGraceBody: "O prazo de compartilhamento terminou. Mantenha uma publicação elegível pública até o VeInvite concluir a verificação automática de 24 horas.",
    submitError: "Não foi possível verificar esta publicação no X agora. Confira o link e tente novamente em instantes.",
  },
  ru: {
    connectX: "Подключить аккаунт X",
    connectedX: "Аккаунт X подключён. Публичные посты можно проверять автоматически.",
    autoBody: "Опубликуйте в X в течение 24 часов и оставьте пост публичным минимум на 24 часа. VeInvite проверит его автоматически; ссылку отправлять не нужно.",
    autoGraceBody: "Время публикации истекло. Оставьте подходящий пост публичным, пока VeInvite не завершит автоматическую проверку за 24 часа.",
    submitError: "Сейчас не удаётся проверить этот пост в X. Проверьте ссылку и попробуйте снова немного позже.",
  },
  id: {
    connectX: "Hubungkan akun X",
    connectedX: "Akun X terhubung. Post publik dapat diperiksa otomatis.",
    autoBody: "Bagikan di X dalam 24 jam dan biarkan Post tetap publik setidaknya 24 jam. VeInvite memeriksanya otomatis; URL Post tidak perlu dikirim.",
    autoGraceBody: "Waktu berbagi sudah berakhir. Biarkan Post yang memenuhi syarat tetap publik sampai VeInvite menyelesaikan pemeriksaan otomatis 24 jam.",
    submitError: "Post X ini belum dapat diverifikasi sekarang. Periksa tautannya lalu coba lagi sebentar lagi.",
  },
  vi: {
    connectX: "Kết nối tài khoản X",
    connectedX: "Tài khoản X đã kết nối. Bài đăng công khai có thể được kiểm tra tự động.",
    autoBody: "Chia sẻ lên X trong 24 giờ và giữ bài đăng công khai ít nhất 24 giờ. VeInvite sẽ tự động kiểm tra nên bạn không cần gửi URL bài đăng.",
    autoGraceBody: "Thời gian chia sẻ đã kết thúc. Hãy giữ bài đăng đủ điều kiện ở chế độ công khai cho đến khi VeInvite hoàn tất kiểm tra tự động 24 giờ.",
    submitError: "Hiện chưa thể xác minh bài đăng X này. Hãy kiểm tra liên kết và thử lại sau ít phút.",
  },
  hi: {
    connectX: "X अकाउंट कनेक्ट करें",
    connectedX: "X अकाउंट कनेक्ट हो गया है। सार्वजनिक पोस्ट अपने आप जाँची जा सकती हैं।",
    autoBody: "24 घंटे के भीतर X पर शेयर करें और पोस्ट को कम से कम 24 घंटे सार्वजनिक रखें। VeInvite इसे अपने आप जाँचता है, इसलिए पोस्ट URL भेजने की जरूरत नहीं है।",
    autoGraceBody: "शेयर करने की समय-सीमा खत्म हो गई है। VeInvite की 24 घंटे की स्वचालित जाँच पूरी होने तक योग्य पोस्ट को सार्वजनिक रखें।",
    submitError: "अभी इस X पोस्ट की पुष्टि नहीं हो पा रही है। लिंक जाँचें और थोड़ी देर बाद फिर कोशिश करें।",
  },
  ar: {
    connectX: "ربط حساب X",
    connectedX: "تم ربط حساب X. يمكن التحقق من المنشورات العامة تلقائيًا.",
    autoBody: "شارك على X خلال 24 ساعة وأبقِ المنشور عامًا لمدة 24 ساعة على الأقل. يتحقق VeInvite منه تلقائيًا، لذلك لا حاجة لإرسال الرابط.",
    autoGraceBody: "انتهت مهلة المشاركة. أبقِ أي منشور مؤهل عامًا حتى يكمل VeInvite التحقق التلقائي لمدة 24 ساعة.",
    submitError: "لا يمكن التحقق من منشور X هذا الآن. تحقق من الرابط وحاول مرة أخرى بعد قليل.",
  },
  bn: {
    connectX: "X অ্যাকাউন্ট যুক্ত করুন",
    connectedX: "X অ্যাকাউন্ট যুক্ত হয়েছে। পাবলিক পোস্ট স্বয়ংক্রিয়ভাবে যাচাই করা যাবে।",
    autoBody: "২৪ ঘণ্টার মধ্যে X-এ শেয়ার করুন এবং পোস্টটি অন্তত ২৪ ঘণ্টা পাবলিক রাখুন। VeInvite স্বয়ংক্রিয়ভাবে যাচাই করবে, তাই পোস্ট URL জমা দিতে হবে না।",
    autoGraceBody: "শেয়ারের সময়সীমা শেষ হয়েছে। VeInvite-এর ২৪ ঘণ্টার স্বয়ংক্রিয় যাচাই শেষ না হওয়া পর্যন্ত যোগ্য পোস্টটি পাবলিক রাখুন।",
    submitError: "এই X পোস্টটি এখন যাচাই করা যাচ্ছে না। লিংক পরীক্ষা করে একটু পরে আবার চেষ্টা করুন।",
  },
  sv: {
    connectX: "Anslut X-konto",
    connectedX: "X-kontot är anslutet. Offentliga inlägg kan kontrolleras automatiskt.",
    autoBody: "Dela på X inom 24 timmar och håll inlägget offentligt i minst 24 timmar. VeInvite kontrollerar automatiskt; ingen post-URL behöver skickas in.",
    autoGraceBody: "Tiden för att dela har gått ut. Håll ett giltigt inlägg offentligt tills VeInvite har slutfört den automatiska 24-timmarskontrollen.",
    submitError: "Det går inte att verifiera det här X-inlägget just nu. Kontrollera länken och försök igen om en stund.",
  },
  ro: {
    connectX: "Conectează contul X",
    connectedX: "Contul X este conectat. Postările publice pot fi verificate automat.",
    autoBody: "Distribuie pe X în 24 de ore și păstrează postarea publică cel puțin 24 de ore. VeInvite o verifică automat; nu trebuie să trimiți URL-ul.",
    autoGraceBody: "Perioada de distribuire s-a încheiat. Păstrează o postare eligibilă publică până când VeInvite termină verificarea automată de 24 de ore.",
    submitError: "Nu putem verifica acum această postare de pe X. Verifică linkul și încearcă din nou în scurt timp.",
  },
  ur: {
    connectX: "X اکاؤنٹ منسلک کریں",
    connectedX: "X اکاؤنٹ منسلک ہے۔ عوامی پوسٹس خودکار طور پر چیک کی جا سکتی ہیں۔",
    autoBody: "24 گھنٹوں کے اندر X پر شیئر کریں اور پوسٹ کو کم از کم 24 گھنٹے عوامی رکھیں۔ VeInvite خودکار طور پر چیک کرتا ہے، اس لیے پوسٹ URL جمع کرانے کی ضرورت نہیں۔",
    autoGraceBody: "شیئر کرنے کی مہلت ختم ہو گئی ہے۔ VeInvite کی 24 گھنٹے کی خودکار جانچ مکمل ہونے تک اہل پوسٹ کو عوامی رکھیں۔",
    submitError: "اس X پوسٹ کی ابھی تصدیق نہیں ہو سکتی۔ لنک چیک کریں اور تھوڑی دیر بعد دوبارہ کوشش کریں۔",
  },
  pcm: {
    connectX: "Connect X account",
    connectedX: "X account don connect. VeInvite fit check public Post automatically.",
    autoBody: "Share for X within 24 hours and leave di Post public for at least 24 hours. VeInvite go check am automatically; you no need submit Post URL.",
    autoGraceBody: "Sharing time don finish. Leave any Post wey qualify public until VeInvite finish di automatic 24-hour check.",
    submitError: "We no fit verify dis X Post now. Check di link and try again small time.",
  },
  arz: {
    connectX: "وصل حساب X",
    connectedX: "حساب X اتوصل. VeInvite يقدر يراجع البوستات العامة تلقائي.",
    autoBody: "شارك على X خلال 24 ساعة وخلي البوست عام لمدة 24 ساعة على الأقل. VeInvite هيراجعه تلقائي ومش محتاج تبعت لينك البوست.",
    autoGraceBody: "وقت المشاركة خلص. خلي أي بوست مؤهل عام لحد ما VeInvite يخلص مراجعة الـ24 ساعة تلقائي.",
    submitError: "مش قادرين نتحقق من بوست X ده دلوقتي. راجع اللينك وجرّب تاني كمان شوية.",
  },
  mr: {
    connectX: "X खाते जोडा",
    connectedX: "X खाते जोडले आहे. सार्वजनिक पोस्ट आपोआप तपासता येतील.",
    autoBody: "24 तासांच्या आत X वर शेअर करा आणि पोस्ट किमान 24 तास सार्वजनिक ठेवा. VeInvite ती आपोआप तपासेल, त्यामुळे पोस्ट URL देण्याची गरज नाही.",
    autoGraceBody: "शेअर करण्याची वेळ संपली आहे. VeInvite ची 24 तासांची स्वयंचलित तपासणी पूर्ण होईपर्यंत पात्र पोस्ट सार्वजनिक ठेवा.",
    submitError: "ही X पोस्ट सध्या तपासता येत नाही. लिंक तपासा आणि थोड्या वेळाने पुन्हा प्रयत्न करा.",
  },
  te: {
    connectX: "X ఖాతాను కనెక్ట్ చేయండి",
    connectedX: "X ఖాతా కనెక్ట్ అయింది. పబ్లిక్ పోస్ట్‌లను ఆటోమేటిక్‌గా తనిఖీ చేయవచ్చు.",
    autoBody: "24 గంటల్లో Xలో షేర్ చేసి, పోస్ట్‌ను కనీసం 24 గంటలు పబ్లిక్‌గా ఉంచండి. VeInvite ఆటోమేటిక్‌గా తనిఖీ చేస్తుంది; పోస్ట్ URL సమర్పించాల్సిన అవసరం లేదు.",
    autoGraceBody: "షేర్ చేసే గడువు ముగిసింది. VeInvite 24 గంటల ఆటోమేటిక్ తనిఖీ పూర్తి చేసే వరకు అర్హమైన పోస్ట్‌ను పబ్లిక్‌గా ఉంచండి.",
    submitError: "ఈ X పోస్ట్‌ను ప్రస్తుతం ధృవీకరించలేకపోతున్నాం. లింక్‌ను తనిఖీ చేసి కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి.",
  },
  sw: {
    connectX: "Unganisha akaunti ya X",
    connectedX: "Akaunti ya X imeunganishwa. Machapisho ya umma yanaweza kukaguliwa kiotomatiki.",
    autoBody: "Shiriki kwenye X ndani ya saa 24 na uache chapisho likiwa la umma kwa angalau saa 24. VeInvite hukagua kiotomatiki; huhitaji kutuma URL.",
    autoGraceBody: "Muda wa kushiriki umeisha. Acha chapisho linalokubalika likiwa la umma hadi VeInvite ikamilishe ukaguzi wa kiotomatiki wa saa 24.",
    submitError: "Hatuwezi kuthibitisha chapisho hili la X sasa. Kagua kiungo kisha ujaribu tena baada ya muda mfupi.",
  },
  ha: {
    connectX: "Haɗa asusun X",
    connectedX: "An haɗa asusun X. Ana iya duba sakonnin jama'a ta atomatik.",
    autoBody: "Raba a X cikin awa 24 kuma ka bar sakon a bayyane na aƙalla awa 24. VeInvite zai duba shi ta atomatik; ba sai ka tura URL ba.",
    autoGraceBody: "Lokacin rabawa ya ƙare. Ka bar sakon da ya cancanta a bayyane har VeInvite ya kammala dubawar awa 24 ta atomatik.",
    submitError: "Ba za mu iya tabbatar da wannan sakon X yanzu ba. Duba mahaɗin sannan ka sake gwadawa nan ba da jimawa ba.",
  },
  el: {
    connectX: "Σύνδεση λογαριασμού X",
    connectedX: "Ο λογαριασμός X συνδέθηκε. Οι δημόσιες αναρτήσεις μπορούν να ελέγχονται αυτόματα.",
    autoBody: "Κοινοποίησε στο X μέσα σε 24 ώρες και κράτησε την ανάρτηση δημόσια για τουλάχιστον 24 ώρες. Το VeInvite την ελέγχει αυτόματα· δεν χρειάζεται URL.",
    autoGraceBody: "Το χρονικό περιθώριο κοινοποίησης έληξε. Κράτησε μια επιλέξιμη ανάρτηση δημόσια μέχρι να ολοκληρωθεί ο αυτόματος έλεγχος 24 ωρών.",
    submitError: "Δεν μπορούμε να επαληθεύσουμε αυτή την ανάρτηση X τώρα. Έλεγξε τον σύνδεσμο και δοκίμασε ξανά σε λίγο.",
  },
  cs: {
    connectX: "Připojit účet X",
    connectedX: "Účet X je připojený. Veřejné příspěvky lze kontrolovat automaticky.",
    autoBody: "Sdílej na X do 24 hodin a nech příspěvek veřejný alespoň 24 hodin. VeInvite ho zkontroluje automaticky; URL není nutné odesílat.",
    autoGraceBody: "Čas pro sdílení vypršel. Nech způsobilý příspěvek veřejný, dokud VeInvite nedokončí automatickou 24hodinovou kontrolu.",
    submitError: "Tento příspěvek na X teď nelze ověřit. Zkontroluj odkaz a za chvíli to zkus znovu.",
  },
};
