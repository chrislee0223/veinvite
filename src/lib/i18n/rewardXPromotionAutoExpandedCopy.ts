import type { RewardXPromotionAutoCopy } from './rewardXPromotionAutoCopy';

export const REWARD_X_PROMOTION_AUTO_EXPANDED_COPY = {
  hi: {
    connectX: 'X अकाउंट कनेक्ट करें',
    connectedX: 'X अकाउंट कनेक्ट हो गया है। ऑटोमैटिक जाँच के परीक्षण के दौरान भी आप पोस्ट लिंक मैन्युअली भेज सकते हैं।',
    autoConnectBody: 'पहले अपना सार्वजनिक X अकाउंट कनेक्ट करें। फिर 24 घंटे के अंदर पोस्ट शेयर करें। पोस्ट URL अलग से भेजने की जरूरत नहीं है।',
    autoOpenBody: '24 घंटे के अंदर X पर शेयर करें। VeInvite पोस्ट को अपने आप ढूँढेगा। पोस्ट को कम से कम 24 घंटे सार्वजनिक रखें; पुष्टि के बाद ही बोनस दिया जाएगा।',
    autoGraceBody: 'शेयर करने की समय-सीमा खत्म हो गई है। VeInvite समय-सीमा से पहले शेयर की गई पोस्टों की अपने आप जाँच कर रहा है। 24 घंटे की पुष्टि पूरी होने तक पोस्ट सार्वजनिक रखें।',
    autoConnectedX: 'X अकाउंट कनेक्ट हो गया है। आपकी सार्वजनिक पोस्ट की अपने आप जाँच होगी; लिंक भेजने की जरूरत नहीं है।',
    connectConflict: 'यह X अकाउंट किसी दूसरे वॉलेट से जुड़ा है। आप सार्वजनिक पोस्ट URL को मैन्युअली भेज सकते हैं।',
    connectFailed: 'X अकाउंट कनेक्शन पूरा नहीं हुआ। फिर कोशिश करें या सार्वजनिक पोस्ट URL मैन्युअली भेजें।',
  },
  ar: {
    connectX: 'ربط حساب X',
    connectedX: 'تم ربط حساب X. أثناء اختبار التحقق التلقائي، لا يزال بإمكانك إرسال رابط المنشور يدويًا.',
    autoConnectBody: 'اربط حساب X العام أولًا، ثم شارك المنشور خلال 24 ساعة. لا حاجة لإرسال رابط المنشور.',
    autoOpenBody: 'شارك على X خلال 24 ساعة. سيعثر VeInvite على المنشور تلقائيًا. أبقه عامًا لمدة 24 ساعة على الأقل؛ تُدفع المكافأة فقط بعد التحقق.',
    autoGraceBody: 'انتهت مهلة المشاركة. يتحقق VeInvite تلقائيًا من المنشورات التي نُشرت قبل الموعد النهائي. أبقِ منشورك عامًا حتى يكتمل تحقق 24 ساعة.',
    autoConnectedX: 'تم ربط حساب X. سيتم التحقق من منشورك العام تلقائيًا؛ لا حاجة لإرسال الرابط.',
    connectConflict: 'حساب X هذا مرتبط بمحفظة أخرى. لا يزال بإمكانك إرسال رابط المنشور العام يدويًا.',
    connectFailed: 'لم يكتمل ربط حساب X. حاول مرة أخرى أو أرسل رابط المنشور العام يدويًا.',
  },
  bn: {
    connectX: 'X অ্যাকাউন্ট সংযুক্ত করুন',
    connectedX: 'X অ্যাকাউন্ট সংযুক্ত হয়েছে। স্বয়ংক্রিয় যাচাই পরীক্ষাধীন থাকলেও আপনি পোস্টের লিংক হাতে জমা দিতে পারেন।',
    autoConnectBody: 'প্রথমে আপনার পাবলিক X অ্যাকাউন্ট সংযুক্ত করুন। তারপর ২৪ ঘণ্টার মধ্যে পোস্টটি শেয়ার করুন। পোস্টের URL আলাদা করে জমা দিতে হবে না।',
    autoOpenBody: '২৪ ঘণ্টার মধ্যে X-এ শেয়ার করুন। VeInvite পোস্টটি স্বয়ংক্রিয়ভাবে খুঁজে নেবে। অন্তত ২৪ ঘণ্টা পোস্টটি পাবলিক রাখুন; যাচাই শেষে বোনাস দেওয়া হবে।',
    autoGraceBody: 'শেয়ারের সময়সীমা শেষ হয়েছে। VeInvite সময়সীমার আগে শেয়ার করা পোস্টগুলো স্বয়ংক্রিয়ভাবে যাচাই করছে। ২৪ ঘণ্টার যাচাই শেষ না হওয়া পর্যন্ত পোস্টটি পাবলিক রাখুন।',
    autoConnectedX: 'X অ্যাকাউন্ট সংযুক্ত হয়েছে। আপনার পাবলিক পোস্ট স্বয়ংক্রিয়ভাবে যাচাই হবে; লিংক জমা দিতে হবে না।',
    connectConflict: 'এই X অ্যাকাউন্টটি অন্য একটি ওয়ালেটের সঙ্গে যুক্ত। আপনি এখনও পাবলিক পোস্টের URL হাতে জমা দিতে পারেন।',
    connectFailed: 'X অ্যাকাউন্ট সংযোগ সম্পূর্ণ হয়নি। আবার চেষ্টা করুন বা পাবলিক পোস্টের URL হাতে জমা দিন।',
  },
  sv: {
    connectX: 'Anslut X-konto',
    connectedX: 'X-kontot är anslutet. Medan den automatiska kontrollen testas kan du fortfarande skicka inläggslänken manuellt.',
    autoConnectBody: 'Anslut först ditt offentliga X-konto. Dela sedan inlägget inom 24 timmar. Du behöver inte skicka inläggs-URL:en.',
    autoOpenBody: 'Dela på X inom 24 timmar. VeInvite hittar inlägget automatiskt. Håll det offentligt i minst 24 timmar; bonusen betalas först efter verifiering.',
    autoGraceBody: 'Delningsfönstret är stängt. VeInvite kontrollerar automatiskt inlägg som delades före tidsgränsen. Håll inlägget offentligt tills 24-timmarskontrollen är klar.',
    autoConnectedX: 'X-kontot är anslutet. Ditt offentliga inlägg kontrolleras automatiskt; ingen länk behöver skickas.',
    connectConflict: 'Det här X-kontot är kopplat till en annan plånbok. Du kan fortfarande skicka den offentliga inläggs-URL:en manuellt.',
    connectFailed: 'Anslutningen till X-kontot slutfördes inte. Försök igen eller skicka den offentliga inläggs-URL:en manuellt.',
  },
  ro: {
    connectX: 'Conectează contul X',
    connectedX: 'Contul X este conectat. Cât timp verificarea automată este în testare, poți trimite în continuare manual linkul postării.',
    autoConnectBody: 'Conectează mai întâi contul X public, apoi distribuie postarea în 24 de ore. Nu trebuie să trimiți URL-ul postării.',
    autoOpenBody: 'Distribuie pe X în 24 de ore. VeInvite va găsi automat postarea. Păstreaz-o publică cel puțin 24 de ore; bonusul se plătește doar după verificare.',
    autoGraceBody: 'Perioada de distribuire s-a încheiat. VeInvite verifică automat postările distribuite înainte de termen. Păstrează postarea publică până se încheie verificarea de 24 de ore.',
    autoConnectedX: 'Contul X este conectat. Postarea publică va fi verificată automat; nu trebuie să trimiți linkul.',
    connectConflict: 'Acest cont X este conectat la alt portofel. Poți trimite în continuare manual URL-ul public al postării.',
    connectFailed: 'Conectarea contului X nu s-a finalizat. Încearcă din nou sau trimite manual URL-ul public al postării.',
  },
  ur: {
    connectX: 'X اکاؤنٹ جوڑیں',
    connectedX: 'X اکاؤنٹ منسلک ہو گیا ہے۔ خودکار جانچ کی آزمائش کے دوران بھی آپ پوسٹ کا لنک دستی طور پر بھیج سکتے ہیں۔',
    autoConnectBody: 'پہلے اپنا عوامی X اکاؤنٹ جوڑیں، پھر 24 گھنٹوں کے اندر پوسٹ شیئر کریں۔ پوسٹ URL الگ سے جمع کرنے کی ضرورت نہیں ہے۔',
    autoOpenBody: '24 گھنٹوں کے اندر X پر شیئر کریں۔ VeInvite پوسٹ خود بخود تلاش کرے گا۔ اسے کم از کم 24 گھنٹے عوامی رکھیں؛ تصدیق کے بعد ہی بونس ادا ہوگا۔',
    autoGraceBody: 'شیئر کرنے کی مدت ختم ہو گئی ہے۔ VeInvite آخری وقت سے پہلے شیئر کی گئی پوسٹس کو خودکار طور پر چیک کر رہا ہے۔ 24 گھنٹے کی تصدیق مکمل ہونے تک پوسٹ عوامی رکھیں۔',
    autoConnectedX: 'X اکاؤنٹ منسلک ہو گیا ہے۔ آپ کی عوامی پوسٹ خودکار طور پر چیک ہوگی؛ لنک جمع کرنے کی ضرورت نہیں ہے۔',
    connectConflict: 'یہ X اکاؤنٹ کسی دوسرے والیٹ سے منسلک ہے۔ آپ عوامی پوسٹ کا URL دستی طور پر اب بھی جمع کر سکتے ہیں۔',
    connectFailed: 'X اکاؤنٹ کنکشن مکمل نہیں ہوا۔ دوبارہ کوشش کریں یا عوامی پوسٹ کا URL دستی طور پر جمع کریں۔',
  },
  pcm: {
    connectX: 'Connect X account',
    connectedX: 'X account don connect. While automatic check still dey test, you fit still submit di post link by yourself.',
    autoConnectBody: 'Connect your public X account first. Then share di post within 24 hours. You no need submit post URL.',
    autoOpenBody: 'Share for X within 24 hours. VeInvite go find di post automatically. Keep am public for at least 24 hours; bonus go pay only after verification.',
    autoGraceBody: 'Sharing time don finish. VeInvite dey automatically check posts wey dem share before deadline. Keep your post public until di 24-hour verification finish.',
    autoConnectedX: 'X account don connect. VeInvite go check your public post automatically; no need submit link.',
    connectConflict: 'Dis X account don connect to another wallet. You still fit submit di public post URL by yourself.',
    connectFailed: 'X account connection no complete. Try again or submit di public post URL by yourself.',
  },
  arz: {
    connectX: 'وصّل حساب X',
    connectedX: 'حساب X اتوصل. وإحنا بنجرب المراجعة التلقائية، لسه تقدر تبعت لينك البوست يدوي.',
    autoConnectBody: 'وصّل حساب X العام الأول، وبعدها شارك البوست خلال 24 ساعة. مش محتاج تبعت لينك البوست.',
    autoOpenBody: 'شارك على X خلال 24 ساعة. VeInvite هيدوّر على البوست تلقائي. خليه عام لمدة 24 ساعة على الأقل؛ البونص بيتدفع بعد التحقق بس.',
    autoGraceBody: 'وقت المشاركة خلص. VeInvite بيراجع تلقائي البوستات اللي اتنشرت قبل الميعاد. خليك مخلي البوست عام لحد ما مراجعة الـ24 ساعة تخلص.',
    autoConnectedX: 'حساب X اتوصل. البوست العام بتاعك هيتراجع تلقائي؛ مش محتاج تبعت اللينك.',
    connectConflict: 'حساب X ده متوصل بمحفظة تانية. لسه تقدر تبعت URL البوست العام يدوي.',
    connectFailed: 'توصيل حساب X ماكملش. جرّب تاني أو ابعت URL البوست العام يدوي.',
  },
  mr: {
    connectX: 'X खाते जोडा',
    connectedX: 'X खाते जोडले आहे. स्वयंचलित तपासणीची चाचणी सुरू असतानाही तुम्ही पोस्टची लिंक स्वतः पाठवू शकता.',
    autoConnectBody: 'आधी तुमचे सार्वजनिक X खाते जोडा. त्यानंतर 24 तासांच्या आत पोस्ट शेअर करा. पोस्ट URL वेगळा पाठवण्याची गरज नाही.',
    autoOpenBody: '24 तासांच्या आत X वर शेअर करा. VeInvite पोस्ट आपोआप शोधेल. ती किमान 24 तास सार्वजनिक ठेवा; पडताळणीनंतरच बोनस दिला जाईल.',
    autoGraceBody: 'शेअर करण्याची मुदत संपली आहे. VeInvite मुदतीपूर्वी शेअर झालेल्या पोस्ट आपोआप तपासत आहे. 24 तासांची पडताळणी पूर्ण होईपर्यंत पोस्ट सार्वजनिक ठेवा.',
    autoConnectedX: 'X खाते जोडले आहे. तुमची सार्वजनिक पोस्ट आपोआप तपासली जाईल; लिंक पाठवण्याची गरज नाही.',
    connectConflict: 'हे X खाते दुसऱ्या वॉलेटशी जोडलेले आहे. तुम्ही सार्वजनिक पोस्ट URL अजूनही स्वतः पाठवू शकता.',
    connectFailed: 'X खाते जोडणी पूर्ण झाली नाही. पुन्हा प्रयत्न करा किंवा सार्वजनिक पोस्ट URL स्वतः पाठवा.',
  },
  te: {
    connectX: 'X ఖాతాను కనెక్ట్ చేయండి',
    connectedX: 'X ఖాతా కనెక్ట్ అయింది. ఆటోమేటిక్ తనిఖీ పరీక్షలో ఉన్నప్పటికీ పోస్ట్ లింక్‌ను మీరు చేతితో సమర్పించవచ్చు.',
    autoConnectBody: 'ముందుగా మీ పబ్లిక్ X ఖాతాను కనెక్ట్ చేయండి. తర్వాత 24 గంటల్లో పోస్ట్‌ను షేర్ చేయండి. పోస్ట్ URL‌ను వేరుగా సమర్పించాల్సిన అవసరం లేదు.',
    autoOpenBody: '24 గంటల్లో Xలో షేర్ చేయండి. VeInvite పోస్ట్‌ను ఆటోమేటిక్‌గా కనుగొంటుంది. కనీసం 24 గంటలు పబ్లిక్‌గా ఉంచండి; ధృవీకరణ తర్వాతే బోనస్ చెల్లించబడుతుంది.',
    autoGraceBody: 'షేర్ గడువు ముగిసింది. గడువుకు ముందు షేర్ చేసిన పోస్ట్‌లను VeInvite ఆటోమేటిక్‌గా తనిఖీ చేస్తోంది. 24 గంటల ధృవీకరణ పూర్తయ్యే వరకు పోస్ట్‌ను పబ్లిక్‌గా ఉంచండి.',
    autoConnectedX: 'X ఖాతా కనెక్ట్ అయింది. మీ పబ్లిక్ పోస్ట్ ఆటోమేటిక్‌గా తనిఖీ అవుతుంది; లింక్ సమర్పించాల్సిన అవసరం లేదు.',
    connectConflict: 'ఈ X ఖాతా మరో వాలెట్‌కు కనెక్ట్ అయింది. పబ్లిక్ పోస్ట్ URL‌ను మీరు ఇంకా చేతితో సమర్పించవచ్చు.',
    connectFailed: 'X ఖాతా కనెక్షన్ పూర్తి కాలేదు. మళ్లీ ప్రయత్నించండి లేదా పబ్లిక్ పోస్ట్ URL‌ను చేతితో సమర్పించండి.',
  },
  sw: {
    connectX: 'Unganisha akaunti ya X',
    connectedX: 'Akaunti ya X imeunganishwa. Wakati ukaguzi wa kiotomatiki bado unajaribiwa, bado unaweza kutuma kiungo cha chapisho mwenyewe.',
    autoConnectBody: 'Unganisha kwanza akaunti yako ya X iliyo ya umma. Kisha shiriki chapisho ndani ya saa 24. Huhitaji kutuma URL ya chapisho.',
    autoOpenBody: 'Shiriki kwenye X ndani ya saa 24. VeInvite itatafuta chapisho moja kwa moja. Liache liwe la umma kwa angalau saa 24; bonasi hulipwa baada ya uthibitishaji pekee.',
    autoGraceBody: 'Muda wa kushiriki umeisha. VeInvite inakagua kiotomatiki machapisho yaliyoshirikiwa kabla ya muda kuisha. Liache chapisho liwe la umma hadi ukaguzi wa saa 24 ukamilike.',
    autoConnectedX: 'Akaunti ya X imeunganishwa. Chapisho lako la umma litakaguliwa kiotomatiki; huhitaji kutuma kiungo.',
    connectConflict: 'Akaunti hii ya X imeunganishwa na pochi nyingine. Bado unaweza kutuma URL ya chapisho la umma mwenyewe.',
    connectFailed: 'Muunganisho wa akaunti ya X haukukamilika. Jaribu tena au tuma URL ya chapisho la umma mwenyewe.',
  },
  ha: {
    connectX: 'Haɗa asusun X',
    connectedX: 'An haɗa asusun X. Yayin da ake gwajin dubawa ta atomatik, har yanzu za ka iya tura mahaɗin sakon da hannu.',
    autoConnectBody: 'Da farko ka haɗa asusun X ɗinka na jama’a. Sannan ka raba sakon cikin awa 24. Ba sai ka tura URL na sakon ba.',
    autoOpenBody: 'Raba a X cikin awa 24. VeInvite zai nemo sakon ta atomatik. Ka bar shi a bayyane na aƙalla awa 24; ana biyan bonus ne bayan an tabbatar.',
    autoGraceBody: 'Lokacin rabawa ya ƙare. VeInvite na duba sakonnin da aka raba kafin wa’adi ta atomatik. Ka bar sakon a bayyane har sai dubawar awa 24 ta ƙare.',
    autoConnectedX: 'An haɗa asusun X. Za a duba sakonka na jama’a ta atomatik; ba sai ka tura mahaɗi ba.',
    connectConflict: 'Wannan asusun X yana haɗe da wani wallet. Har yanzu za ka iya tura URL na sakon jama’a da hannu.',
    connectFailed: 'Ha a kammala haɗa asusun X ba. Ka sake gwadawa ko ka tura URL na sakon jama’a da hannu.',
  },
  el: {
    connectX: 'Σύνδεση λογαριασμού X',
    connectedX: 'Ο λογαριασμός X συνδέθηκε. Όσο δοκιμάζεται ο αυτόματος έλεγχος, μπορείς ακόμη να υποβάλεις χειροκίνητα τον σύνδεσμο της ανάρτησης.',
    autoConnectBody: 'Σύνδεσε πρώτα τον δημόσιο λογαριασμό X και μετά κοινοποίησε την ανάρτηση μέσα σε 24 ώρες. Δεν χρειάζεται να υποβάλεις URL ανάρτησης.',
    autoOpenBody: 'Κοινοποίησε στο X μέσα σε 24 ώρες. Το VeInvite θα βρει αυτόματα την ανάρτηση. Κράτησέ την δημόσια για τουλάχιστον 24 ώρες· το μπόνους πληρώνεται μόνο μετά την επαλήθευση.',
    autoGraceBody: 'Το χρονικό περιθώριο κοινοποίησης έληξε. Το VeInvite ελέγχει αυτόματα αναρτήσεις που κοινοποιήθηκαν πριν από την προθεσμία. Κράτησε την ανάρτηση δημόσια μέχρι να ολοκληρωθεί ο έλεγχος των 24 ωρών.',
    autoConnectedX: 'Ο λογαριασμός X συνδέθηκε. Η δημόσια ανάρτησή σου θα ελεγχθεί αυτόματα· δεν χρειάζεται να υποβάλεις σύνδεσμο.',
    connectConflict: 'Αυτός ο λογαριασμός X είναι συνδεδεμένος με άλλο πορτοφόλι. Μπορείς ακόμη να υποβάλεις χειροκίνητα το δημόσιο URL της ανάρτησης.',
    connectFailed: 'Η σύνδεση του λογαριασμού X δεν ολοκληρώθηκε. Δοκίμασε ξανά ή υπέβαλε χειροκίνητα το δημόσιο URL της ανάρτησης.',
  },
  cs: {
    connectX: 'Připojit účet X',
    connectedX: 'Účet X je připojený. Během testování automatické kontroly můžeš odkaz na příspěvek stále odeslat ručně.',
    autoConnectBody: 'Nejprve připoj svůj veřejný účet X. Potom příspěvek sdílej do 24 hodin. URL příspěvku nemusíš odesílat.',
    autoOpenBody: 'Sdílej na X do 24 hodin. VeInvite příspěvek najde automaticky. Nech ho veřejný alespoň 24 hodin; bonus se vyplatí až po ověření.',
    autoGraceBody: 'Čas pro sdílení vypršel. VeInvite automaticky kontroluje příspěvky sdílené před termínem. Nech příspěvek veřejný až do dokončení 24hodinového ověření.',
    autoConnectedX: 'Účet X je připojený. Tvůj veřejný příspěvek se zkontroluje automaticky; odkaz není třeba odesílat.',
    connectConflict: 'Tento účet X je připojený k jiné peněžence. Veřejnou URL příspěvku můžeš stále odeslat ručně.',
    connectFailed: 'Připojení účtu X nebylo dokončeno. Zkus to znovu nebo odešli veřejnou URL příspěvku ručně.',
  },
} satisfies Record<
  | 'hi'
  | 'ar'
  | 'bn'
  | 'sv'
  | 'ro'
  | 'ur'
  | 'pcm'
  | 'arz'
  | 'mr'
  | 'te'
  | 'sw'
  | 'ha'
  | 'el'
  | 'cs',
  RewardXPromotionAutoCopy
>;
