import type {
  RewardXPromotionAutoCopy,
} from './rewardXPromotionCopyTypes';

export const REWARD_X_PROMOTION_AUTO_EXPANDED_COPY = {
  hi: {
    connectX: 'X अकाउंट कनेक्ट करें',
    connectedX: 'X अकाउंट कनेक्ट हो गया है। ऑटोमैटिक जाँच की टेस्टिंग के दौरान आप पोस्ट लिंक मैन्युअली भी जमा कर सकते हैं।',
    autoConnectBody: 'पहले अपना सार्वजनिक X अकाउंट कनेक्ट करें। फिर 24 घंटे के भीतर शेयर करें; पोस्ट URL अलग से जमा करने की जरूरत नहीं होगी।',
    autoOpenBody: '24 घंटे के भीतर X पर शेयर करें। VeInvite सार्वजनिक पोस्ट को अपने आप ढूँढेगा। कम से कम 24 घंटे सार्वजनिक रखें; बोनस केवल सत्यापन के बाद दिया जाएगा।',
    autoGraceBody: 'शेयर करने की समय-सीमा खत्म हो गई है। VeInvite समय-सीमा से पहले की पोस्ट अपने आप जाँच रहा है। 24 घंटे की जाँच पूरी होने तक पोस्ट सार्वजनिक रखें।',
    autoConnectedX: 'X अकाउंट कनेक्ट हो गया है। आपकी सार्वजनिक पोस्ट अपने आप जाँची जाएगी; लिंक जमा करने की जरूरत नहीं है।',
  },
  ar: {
    connectX: 'ربط حساب X',
    connectedX: 'تم ربط حساب X. أثناء اختبار التحقق التلقائي، ما زال بإمكانك إرسال رابط المنشور يدويًا.',
    autoConnectBody: 'اربط حساب X العام أولًا، ثم شارك خلال 24 ساعة. لن تحتاج إلى إرسال رابط المنشور بشكل منفصل.',
    autoOpenBody: 'شارك على X خلال 24 ساعة. سيبحث VeInvite عن المنشور العام تلقائيًا. أبقه عامًا لمدة 24 ساعة على الأقل؛ تُدفع المكافأة بعد التحقق فقط.',
    autoGraceBody: 'انتهت مهلة المشاركة. يتحقق VeInvite تلقائيًا من المنشورات التي نُشرت قبل الموعد النهائي. أبقِ منشورك عامًا حتى يكتمل التحقق لمدة 24 ساعة.',
    autoConnectedX: 'تم ربط حساب X. سيتم التحقق من منشورك العام تلقائيًا؛ لا حاجة لإرسال الرابط.',
  },
  bn: {
    connectX: 'X অ্যাকাউন্ট সংযুক্ত করুন',
    connectedX: 'X অ্যাকাউন্ট সংযুক্ত হয়েছে। স্বয়ংক্রিয় যাচাই পরীক্ষার সময় আপনি চাইলে পোস্টের লিংক হাতে জমা দিতে পারেন।',
    autoConnectBody: 'প্রথমে আপনার পাবলিক X অ্যাকাউন্ট সংযুক্ত করুন। এরপর ২৪ ঘণ্টার মধ্যে শেয়ার করুন; আলাদা করে পোস্ট URL জমা দিতে হবে না।',
    autoOpenBody: '২৪ ঘণ্টার মধ্যে X-এ শেয়ার করুন। VeInvite পাবলিক পোস্টটি স্বয়ংক্রিয়ভাবে খুঁজবে। অন্তত ২৪ ঘণ্টা পাবলিক রাখুন; যাচাইয়ের পরেই বোনাস দেওয়া হবে।',
    autoGraceBody: 'শেয়ার করার সময়সীমা শেষ হয়েছে। VeInvite সময়সীমার আগে করা পোস্ট স্বয়ংক্রিয়ভাবে যাচাই করছে। ২৪ ঘণ্টার যাচাই শেষ না হওয়া পর্যন্ত পোস্ট পাবলিক রাখুন।',
    autoConnectedX: 'X অ্যাকাউন্ট সংযুক্ত হয়েছে। আপনার পাবলিক পোস্ট স্বয়ংক্রিয়ভাবে যাচাই হবে; লিংক জমা দিতে হবে না।',
  },
  sv: {
    connectX: 'Anslut X-konto',
    connectedX: 'X-kontot är anslutet. Medan automatisk kontroll testas kan du fortfarande skicka inläggslänken manuellt.',
    autoConnectBody: 'Anslut först ditt offentliga X-konto. Dela sedan inom 24 timmar; du behöver inte skicka inläggs-URL:en separat.',
    autoOpenBody: 'Dela på X inom 24 timmar. VeInvite letar automatiskt efter det offentliga inlägget. Håll det offentligt i minst 24 timmar; bonusen betalas först efter verifiering.',
    autoGraceBody: 'Tiden för delning har gått ut. VeInvite kontrollerar automatiskt inlägg som publicerades före tidsfristen. Håll inlägget offentligt tills 24-timmarskontrollen är klar.',
    autoConnectedX: 'X-kontot är anslutet. Ditt offentliga inlägg kontrolleras automatiskt; ingen länk behöver skickas.',
  },
  ro: {
    connectX: 'Conectează contul X',
    connectedX: 'Contul X este conectat. Cât timp verificarea automată este în testare, poți trimite în continuare manual linkul postării.',
    autoConnectBody: 'Conectează mai întâi contul X public. Apoi distribuie în 24 de ore; nu va fi nevoie să trimiți separat URL-ul postării.',
    autoOpenBody: 'Distribuie pe X în 24 de ore. VeInvite va căuta automat postarea publică. Păstreaz-o publică cel puțin 24 de ore; bonusul este plătit doar după verificare.',
    autoGraceBody: 'Perioada de distribuire s-a încheiat. VeInvite verifică automat postările publicate înainte de termen. Păstrează postarea publică până se încheie verificarea de 24 de ore.',
    autoConnectedX: 'Contul X este conectat. Postarea publică va fi verificată automat; nu trebuie să trimiți linkul.',
  },
  ur: {
    connectX: 'X اکاؤنٹ منسلک کریں',
    connectedX: 'X اکاؤنٹ منسلک ہو گیا ہے۔ خودکار جانچ کی آزمائش کے دوران آپ پوسٹ کا لنک دستی طور پر بھی جمع کر سکتے ہیں۔',
    autoConnectBody: 'پہلے اپنا عوامی X اکاؤنٹ منسلک کریں۔ پھر 24 گھنٹوں کے اندر شیئر کریں؛ پوسٹ URL الگ سے جمع کرانے کی ضرورت نہیں ہوگی۔',
    autoOpenBody: '24 گھنٹوں کے اندر X پر شیئر کریں۔ VeInvite عوامی پوسٹ خود تلاش کرے گا۔ کم از کم 24 گھنٹے عوامی رکھیں؛ بونس صرف تصدیق کے بعد ادا ہوگا۔',
    autoGraceBody: 'شیئر کرنے کی مہلت ختم ہو گئی ہے۔ VeInvite آخری وقت سے پہلے کی پوسٹس خودکار طور پر جانچ رہا ہے۔ 24 گھنٹے کی تصدیق مکمل ہونے تک پوسٹ عوامی رکھیں۔',
    autoConnectedX: 'X اکاؤنٹ منسلک ہو گیا ہے۔ آپ کی عوامی پوسٹ خودکار طور پر جانچی جائے گی؛ لنک جمع کرانے کی ضرورت نہیں ہے۔',
  },
  pcm: {
    connectX: 'Connect X account',
    connectedX: 'X account don connect. While automatic checking still dey test, you fit still submit di Post link by yourself.',
    autoConnectBody: 'Connect your public X account first. Then share within 24 hours; you no need submit Post URL separately.',
    autoOpenBody: 'Share for X within 24 hours. VeInvite go find di public Post automatically. Keep am public for at least 24 hours; bonus go pay only after verification.',
    autoGraceBody: 'Sharing time don finish. VeInvite dey automatically check Posts wey you share before deadline. Keep your Post public until di 24-hour verification finish.',
    autoConnectedX: 'X account don connect. VeInvite go check your public Post automatically; no need submit link.',
  },
  arz: {
    connectX: 'وصّل حساب X',
    connectedX: 'حساب X اتوصل. وإحنا بنجرّب الفحص التلقائي تقدر برضه تبعت لينك البوست يدوي.',
    autoConnectBody: 'وصّل حساب X العام الأول، وبعدها شارك خلال 24 ساعة. مش هتحتاج تبعت URL البوست لوحده.',
    autoOpenBody: 'شارك على X خلال 24 ساعة. VeInvite هيدوّر على البوست العام تلقائي. خليه عام لمدة 24 ساعة على الأقل؛ البونص بيتدفع بعد التحقق.',
    autoGraceBody: 'وقت المشاركة خلص. VeInvite بيراجع تلقائي البوستات اللي اتنشرت قبل الميعاد. خليك مخلّي البوست عام لحد ما مراجعة الـ24 ساعة تخلص.',
    autoConnectedX: 'حساب X اتوصل. البوست العام هيتراجع تلقائي؛ مش محتاج تبعت اللينك.',
  },
  mr: {
    connectX: 'X खाते जोडा',
    connectedX: 'X खाते जोडले आहे. स्वयंचलित तपासणीची चाचणी सुरू असताना तुम्ही पोस्टची लिंक हातानेही पाठवू शकता.',
    autoConnectBody: 'सर्वप्रथम तुमचे सार्वजनिक X खाते जोडा. त्यानंतर 24 तासांच्या आत शेअर करा; पोस्ट URL वेगळा पाठवण्याची गरज नाही.',
    autoOpenBody: '24 तासांच्या आत X वर शेअर करा. VeInvite सार्वजनिक पोस्ट आपोआप शोधेल. किमान 24 तास पोस्ट सार्वजनिक ठेवा; पडताळणीनंतरच बोनस दिला जाईल.',
    autoGraceBody: 'शेअर करण्याची मुदत संपली आहे. VeInvite मुदतीपूर्वीच्या पोस्ट आपोआप तपासत आहे. 24 तासांची पडताळणी पूर्ण होईपर्यंत पोस्ट सार्वजनिक ठेवा.',
    autoConnectedX: 'X खाते जोडले आहे. तुमची सार्वजनिक पोस्ट आपोआप तपासली जाईल; लिंक पाठवण्याची गरज नाही.',
  },
  te: {
    connectX: 'X ఖాతాను కనెక్ట్ చేయండి',
    connectedX: 'X ఖాతా కనెక్ట్ అయింది. ఆటోమేటిక్ తనిఖీలు పరీక్షలో ఉన్నప్పుడు పోస్ట్ లింక్‌ను చేతితో కూడా సమర్పించవచ్చు.',
    autoConnectBody: 'ముందుగా మీ పబ్లిక్ X ఖాతాను కనెక్ట్ చేయండి. తర్వాత 24 గంటల్లో షేర్ చేయండి; పోస్ట్ URL‌ను విడిగా సమర్పించాల్సిన అవసరం లేదు.',
    autoOpenBody: '24 గంటల్లో Xలో షేర్ చేయండి. VeInvite పబ్లిక్ పోస్ట్‌ను ఆటోమేటిక్‌గా వెతుకుతుంది. కనీసం 24 గంటలు పబ్లిక్‌గా ఉంచండి; ధృవీకరణ తర్వాతే బోనస్ చెల్లించబడుతుంది.',
    autoGraceBody: 'షేర్ గడువు ముగిసింది. గడువుకు ముందు షేర్ చేసిన పోస్ట్‌లను VeInvite ఆటోమేటిక్‌గా తనిఖీ చేస్తోంది. 24 గంటల ధృవీకరణ పూర్తయ్యే వరకు పోస్ట్‌ను పబ్లిక్‌గా ఉంచండి.',
    autoConnectedX: 'X ఖాతా కనెక్ట్ అయింది. మీ పబ్లిక్ పోస్ట్ ఆటోమేటిక్‌గా తనిఖీ చేయబడుతుంది; లింక్ సమర్పించాల్సిన అవసరం లేదు.',
  },
  sw: {
    connectX: 'Unganisha akaunti ya X',
    connectedX: 'Akaunti ya X imeunganishwa. Wakati ukaguzi wa kiotomatiki unajaribiwa, bado unaweza kuwasilisha kiungo cha chapisho mwenyewe.',
    autoConnectBody: 'Unganisha kwanza akaunti yako ya X ya umma. Kisha shiriki ndani ya saa 24; hutahitaji kuwasilisha URL ya chapisho kando.',
    autoOpenBody: 'Shiriki kwenye X ndani ya saa 24. VeInvite itatafuta chapisho la umma kiotomatiki. Liweke wazi kwa angalau saa 24; bonasi hulipwa tu baada ya uthibitishaji.',
    autoGraceBody: 'Muda wa kushiriki umeisha. VeInvite inakagua kiotomatiki machapisho yaliyoshirikiwa kabla ya muda kuisha. Liache chapisho lako wazi hadi uthibitishaji wa saa 24 ukamilike.',
    autoConnectedX: 'Akaunti ya X imeunganishwa. Chapisho lako la umma litakaguliwa kiotomatiki; hakuna haja ya kuwasilisha kiungo.',
  },
  ha: {
    connectX: 'Haɗa asusun X',
    connectedX: 'An haɗa asusun X. Yayin gwajin dubawa ta atomatik, har yanzu za ka iya tura mahaɗin sakon da kanka.',
    autoConnectBody: 'Da farko haɗa asusun X ɗinka na jama’a. Sannan ka raba cikin awa 24; ba sai ka tura URL ɗin sakon dabam ba.',
    autoOpenBody: 'Raba a X cikin awa 24. VeInvite zai nemo sakon jama’a ta atomatik. Ka bar shi a bayyane na aƙalla awa 24; ana biyan bonus ne bayan tabbatarwa.',
    autoGraceBody: 'Lokacin rabawa ya ƙare. VeInvite na duba saƙonnin da aka wallafa kafin wa’adin ƙarshe ta atomatik. Ka bar sakonka a bayyane har sai an gama tabbatarwar awa 24.',
    autoConnectedX: 'An haɗa asusun X. Za a duba sakonka na jama’a ta atomatik; ba sai ka tura mahaɗi ba.',
  },
  el: {
    connectX: 'Σύνδεση λογαριασμού X',
    connectedX: 'Ο λογαριασμός X συνδέθηκε. Όσο δοκιμάζονται οι αυτόματοι έλεγχοι, μπορείς να υποβάλεις και χειροκίνητα τον σύνδεσμο της ανάρτησης.',
    autoConnectBody: 'Σύνδεσε πρώτα τον δημόσιο λογαριασμό X. Έπειτα κοινοποίησε μέσα σε 24 ώρες· δεν χρειάζεται να υποβάλεις ξεχωριστά το URL της ανάρτησης.',
    autoOpenBody: 'Κοινοποίησε στο X μέσα σε 24 ώρες. Το VeInvite θα βρει αυτόματα τη δημόσια ανάρτηση. Κράτησέ την δημόσια για τουλάχιστον 24 ώρες· το μπόνους πληρώνεται μόνο μετά την επαλήθευση.',
    autoGraceBody: 'Η περίοδος κοινοποίησης έληξε. Το VeInvite ελέγχει αυτόματα αναρτήσεις που δημοσιεύτηκαν πριν από την προθεσμία. Κράτησε την ανάρτηση δημόσια μέχρι να ολοκληρωθεί η επαλήθευση των 24 ωρών.',
    autoConnectedX: 'Ο λογαριασμός X συνδέθηκε. Η δημόσια ανάρτησή σου θα ελεγχθεί αυτόματα· δεν χρειάζεται να υποβάλεις σύνδεσμο.',
  },
  cs: {
    connectX: 'Připojit účet X',
    connectedX: 'Účet X je připojený. Během testování automatické kontroly můžeš stále poslat odkaz na příspěvek ručně.',
    autoConnectBody: 'Nejprve připoj svůj veřejný účet X. Potom sdílej do 24 hodin; URL příspěvku nebude potřeba posílat zvlášť.',
    autoOpenBody: 'Sdílej na X do 24 hodin. VeInvite veřejný příspěvek vyhledá automaticky. Nech ho veřejný alespoň 24 hodin; bonus se vyplatí až po ověření.',
    autoGraceBody: 'Doba pro sdílení vypršela. VeInvite automaticky kontroluje příspěvky zveřejněné před termínem. Nech příspěvek veřejný až do dokončení 24hodinového ověření.',
    autoConnectedX: 'Účet X je připojený. Tvůj veřejný příspěvek se zkontroluje automaticky; odkaz není potřeba posílat.',
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
