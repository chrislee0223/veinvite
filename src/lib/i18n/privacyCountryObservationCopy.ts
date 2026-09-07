import type { SupportedLocale } from './locales';

export type PrivacyCountryObservationCopy = {
  updated: string;
  heading: string;
  body: string;
};

export const PRIVACY_COUNTRY_OBSERVATION_COPY: Record<
  SupportedLocale,
  PrivacyCountryObservationCopy
> = {
  en: {
    updated: 'Last updated: September 7, 2026',
    heading: 'Coarse country observation',
    body: 'When a verified wallet session is active, VeInvite may record a two-letter country code supplied by trusted edge infrastructure. This coarse network-location signal can be preserved with referral activation and used only for aggregate country statistics and rankings for verified referrals. VeInvite does not infer country from the selected app language, does not store raw IP addresses for this feature, and does not publish wallet-to-country mappings. A country code is not treated as nationality or precise location.',
  },
  ko: {
    updated: '최종 업데이트: 2026년 9월 7일',
    heading: '대략적인 국가 정보 확인',
    body: '검증된 지갑 세션이 활성화된 동안 VeInvite는 신뢰할 수 있는 엣지 인프라가 제공하는 두 글자 국가 코드를 기록할 수 있습니다. 이 대략적인 네트워크 위치 정보는 초대 활성화 시점의 국가 정보로 보존될 수 있으며, 검증된 초대의 국가별 합계와 순위를 집계하는 용도로만 사용합니다. 선택한 앱 언어로 국가를 추정하지 않고, 이 기능을 위해 원본 IP 주소를 저장하지 않으며, 지갑과 국가를 연결한 개별 정보도 공개하지 않습니다. 국가 코드는 국적이나 정확한 위치를 의미하지 않습니다.',
  },
  zh: {
    updated: '最后更新：2026年9月7日',
    heading: '粗略国家信息',
    body: '在已验证的钱包会话有效期间，VeInvite 可能记录由可信边缘基础设施提供的两位国家代码。该粗略网络位置信号可与邀请激活记录一起保存，并仅用于已验证邀请的国家汇总统计和排名。VeInvite 不会根据所选应用语言推断国家，不会为此功能保存原始 IP 地址，也不会公开钱包与国家之间的对应关系。国家代码不代表国籍或精确位置。',
  },
  hi: {
    updated: 'अंतिम अपडेट: 7 सितंबर 2026',
    heading: 'मोटे स्तर की देश जानकारी',
    body: 'सत्यापित वॉलेट सेशन सक्रिय होने पर VeInvite विश्वसनीय एज इन्फ्रास्ट्रक्चर से मिला दो-अक्षरी देश कोड दर्ज कर सकता है। यह मोटा नेटवर्क-लोकेशन संकेत रेफ़रल सक्रियण के साथ सुरक्षित रखा जा सकता है और केवल सत्यापित रेफ़रल के देशवार समेकित आँकड़ों व रैंकिंग के लिए उपयोग होता है। VeInvite चुनी हुई ऐप भाषा से देश का अनुमान नहीं लगाता, इस सुविधा के लिए कच्चे IP पते नहीं रखता और वॉलेट-से-देश मैपिंग सार्वजनिक नहीं करता। देश कोड राष्ट्रीयता या सटीक स्थान नहीं माना जाता।',
  },
  es: {
    updated: 'Última actualización: 7 de septiembre de 2026',
    heading: 'Observación aproximada del país',
    body: 'Cuando hay una sesión de cartera verificada activa, VeInvite puede registrar un código de país de dos letras proporcionado por infraestructura perimetral de confianza. Esta señal aproximada de ubicación de red puede conservarse con la activación de la invitación y utilizarse únicamente para estadísticas y clasificaciones agregadas por país de invitaciones verificadas. VeInvite no deduce el país a partir del idioma elegido, no almacena direcciones IP sin procesar para esta función y no publica relaciones entre carteras y países. El código de país no se considera nacionalidad ni ubicación precisa.',
  },
  ja: {
    updated: '最終更新日：2026年9月7日',
    heading: '大まかな国情報',
    body: '認証済みウォレットのセッション中、VeInvite は信頼できるエッジ基盤から提供される2文字の国コードを記録する場合があります。この大まかなネットワーク位置情報は招待の有効化時点とともに保存され、確認済み招待の国別集計やランキングにのみ使用されます。選択されたアプリ言語から国を推測することはなく、この機能のために生のIPアドレスを保存せず、ウォレットと国を結び付けた個別情報も公開しません。国コードは国籍や正確な所在地を意味しません。',
  },
  it: {
    updated: 'Ultimo aggiornamento: 7 settembre 2026',
    heading: 'Rilevazione approssimativa del paese',
    body: 'Quando è attiva una sessione wallet verificata, VeInvite può registrare un codice paese di due lettere fornito da infrastruttura edge affidabile. Questo segnale approssimativo della posizione di rete può essere conservato con l’attivazione dell’invito e usato solo per statistiche e classifiche aggregate per paese relative agli inviti verificati. VeInvite non deduce il paese dalla lingua scelta nell’app, non conserva indirizzi IP grezzi per questa funzione e non pubblica associazioni tra wallet e paese. Il codice paese non è considerato nazionalità né posizione precisa.',
  },
  tr: {
    updated: 'Son güncelleme: 7 Eylül 2026',
    heading: 'Yaklaşık ülke gözlemi',
    body: 'Doğrulanmış bir cüzdan oturumu açıkken VeInvite, güvenilir uç altyapısının sağladığı iki harfli ülke kodunu kaydedebilir. Bu yaklaşık ağ konumu sinyali davet etkinleştirmesiyle birlikte saklanabilir ve yalnızca doğrulanmış davetlerin ülke bazlı toplu istatistikleri ve sıralamaları için kullanılır. VeInvite seçilen uygulama dilinden ülke çıkarımı yapmaz, bu özellik için ham IP adresi saklamaz ve cüzdan-ülke eşleştirmelerini yayımlamaz. Ülke kodu vatandaşlık veya kesin konum olarak değerlendirilmez.',
  },
  nl: {
    updated: 'Laatst bijgewerkt: 7 september 2026',
    heading: 'Globale landwaarneming',
    body: 'Wanneer een geverifieerde walletsessie actief is, kan VeInvite een landcode van twee letters vastleggen die door vertrouwde edge-infrastructuur wordt geleverd. Dit globale netwerklocatiesignaal kan bij de activering van een uitnodiging worden bewaard en uitsluitend worden gebruikt voor geaggregeerde landenstatistieken en ranglijsten van geverifieerde uitnodigingen. VeInvite leidt het land niet af uit de gekozen app-taal, bewaart voor deze functie geen ruwe IP-adressen en publiceert geen koppelingen tussen wallets en landen. Een landcode geldt niet als nationaliteit of exacte locatie.',
  },
  de: {
    updated: 'Zuletzt aktualisiert: 7. September 2026',
    heading: 'Grobe Ländererkennung',
    body: 'Während einer verifizierten Wallet-Sitzung kann VeInvite einen zweistelligen Ländercode speichern, der von vertrauenswürdiger Edge-Infrastruktur bereitgestellt wird. Dieses grobe Netzwerksignal kann zusammen mit der Aktivierung einer Einladung gespeichert und ausschließlich für aggregierte Länderstatistiken und Ranglisten verifizierter Einladungen verwendet werden. VeInvite leitet das Land nicht aus der gewählten App-Sprache ab, speichert für diese Funktion keine rohen IP-Adressen und veröffentlicht keine Zuordnung zwischen Wallets und Ländern. Der Ländercode gilt weder als Staatsangehörigkeit noch als genauer Standort.',
  },
  fr: {
    updated: 'Dernière mise à jour : 7 septembre 2026',
    heading: 'Observation approximative du pays',
    body: 'Lorsqu’une session de portefeuille vérifiée est active, VeInvite peut enregistrer un code pays à deux lettres fourni par une infrastructure edge de confiance. Ce signal approximatif de localisation réseau peut être conservé avec l’activation d’une invitation et utilisé uniquement pour des statistiques et classements agrégés par pays concernant les invitations vérifiées. VeInvite ne déduit pas le pays de la langue choisie dans l’application, ne conserve pas les adresses IP brutes pour cette fonction et ne publie pas de correspondance entre portefeuilles et pays. Le code pays n’est pas considéré comme une nationalité ni comme une localisation précise.',
  },
  ar: {
    updated: 'آخر تحديث: 7 سبتمبر 2026',
    heading: 'رصد تقريبي للبلد',
    body: 'عند تفعيل جلسة محفظة موثقة، قد يسجل VeInvite رمز بلد مكوّنًا من حرفين توفره بنية طرفية موثوقة. يمكن حفظ إشارة موقع الشبكة التقريبية هذه مع تفعيل الإحالة واستخدامها فقط في الإحصاءات والترتيبات المجمعة حسب البلد للإحالات التي تم التحقق منها. لا يستنتج VeInvite البلد من لغة التطبيق المختارة، ولا يخزن عناوين IP الخام لهذه الميزة، ولا ينشر ربطًا بين المحافظ والبلدان. ولا يُعامل رمز البلد على أنه جنسية أو موقع دقيق.',
  },
  bn: {
    updated: 'সর্বশেষ হালনাগাদ: ৭ সেপ্টেম্বর ২০২৬',
    heading: 'আনুমানিক দেশ পর্যবেক্ষণ',
    body: 'যাচাইকৃত ওয়ালেট সেশন সক্রিয় থাকলে VeInvite বিশ্বস্ত এজ অবকাঠামো থেকে পাওয়া দুই অক্ষরের দেশের কোড রেকর্ড করতে পারে। এই আনুমানিক নেটওয়ার্ক-অবস্থান সংকেতটি রেফারেল সক্রিয়করণের সঙ্গে সংরক্ষণ করা যেতে পারে এবং শুধু যাচাইকৃত রেফারেলের দেশভিত্তিক সমষ্টিগত পরিসংখ্যান ও র‍্যাঙ্কিংয়ে ব্যবহার করা হয়। VeInvite নির্বাচিত অ্যাপের ভাষা থেকে দেশ অনুমান করে না, এই সুবিধার জন্য কাঁচা IP ঠিকানা সংরক্ষণ করে না এবং ওয়ালেট-দেশ ম্যাপিং প্রকাশ করে না। দেশের কোডকে জাতীয়তা বা নির্ভুল অবস্থান হিসেবে ধরা হয় না।',
  },
  pt: {
    updated: 'Última atualização: 7 de setembro de 2026',
    heading: 'Observação aproximada do país',
    body: 'Quando há uma sessão de carteira verificada ativa, o VeInvite pode registrar um código de país de duas letras fornecido por uma infraestrutura de borda confiável. Esse sinal aproximado de localização de rede pode ser preservado com a ativação do convite e usado somente para estatísticas e rankings agregados por país de convites verificados. O VeInvite não deduz o país a partir do idioma escolhido no app, não armazena endereços IP brutos para esse recurso e não publica vínculos entre carteiras e países. O código do país não é tratado como nacionalidade nem como localização precisa.',
  },
  ru: {
    updated: 'Последнее обновление: 7 сентября 2026 г.',
    heading: 'Приблизительное определение страны',
    body: 'Во время подтверждённой сессии кошелька VeInvite может записывать двухбуквенный код страны, предоставленный доверенной edge-инфраструктурой. Этот приблизительный сигнал сетевого местоположения может сохраняться вместе с активацией приглашения и использоваться только для агрегированной статистики и рейтингов по странам для проверенных приглашений. VeInvite не определяет страну по выбранному языку приложения, не хранит необработанные IP-адреса для этой функции и не публикует соответствия между кошельками и странами. Код страны не считается гражданством или точным местоположением.',
  },
  id: {
    updated: 'Terakhir diperbarui: 7 September 2026',
    heading: 'Pengamatan negara secara kasar',
    body: 'Saat sesi dompet terverifikasi aktif, VeInvite dapat mencatat kode negara dua huruf yang diberikan oleh infrastruktur edge tepercaya. Sinyal lokasi jaringan yang bersifat kasar ini dapat disimpan bersama aktivasi undangan dan hanya digunakan untuk statistik serta peringkat negara secara agregat bagi undangan yang telah diverifikasi. VeInvite tidak menebak negara dari bahasa aplikasi yang dipilih, tidak menyimpan alamat IP mentah untuk fitur ini, dan tidak memublikasikan pemetaan dompet ke negara. Kode negara tidak dianggap sebagai kewarganegaraan atau lokasi yang presisi.',
  },
  vi: {
    updated: 'Cập nhật lần cuối: 7 tháng 9, 2026',
    heading: 'Ghi nhận quốc gia ở mức khái quát',
    body: 'Khi một phiên ví đã xác minh đang hoạt động, VeInvite có thể ghi lại mã quốc gia gồm hai chữ cái do hạ tầng biên đáng tin cậy cung cấp. Tín hiệu vị trí mạng ở mức khái quát này có thể được lưu cùng thời điểm kích hoạt lời mời và chỉ dùng cho số liệu tổng hợp và bảng xếp hạng theo quốc gia của các lời mời đã được xác minh. VeInvite không suy đoán quốc gia từ ngôn ngữ ứng dụng đã chọn, không lưu địa chỉ IP thô cho tính năng này và không công khai ánh xạ giữa ví và quốc gia. Mã quốc gia không được coi là quốc tịch hoặc vị trí chính xác.',
  },
  'zh-tw': {
    updated: '最後更新：2026年9月7日',
    heading: '概略國家資訊',
    body: '在已驗證的錢包工作階段有效期間，VeInvite 可能記錄由可信任邊緣基礎設施提供的兩碼國家代碼。這項概略網路位置訊號可與邀請啟用資料一起保存，且只用於已驗證邀請的國家彙總統計與排名。VeInvite 不會根據所選的應用程式語言推斷國家，不會為此功能儲存原始 IP 位址，也不會公開錢包與國家的對應關係。國家代碼不代表國籍或精確位置。',
  },
  sv: {
    updated: 'Senast uppdaterad: 7 september 2026',
    heading: 'Grov landsobservation',
    body: 'När en verifierad plånbokssession är aktiv kan VeInvite registrera en landskod med två bokstäver från betrodd edge-infrastruktur. Denna grova nätverkspositionssignal kan sparas tillsammans med aktiveringen av en inbjudan och används endast för aggregerad landsstatistik och rankning av verifierade inbjudningar. VeInvite härleder inte land från valt appspråk, lagrar inte råa IP-adresser för den här funktionen och publicerar inte kopplingar mellan plånböcker och länder. Landskoden betraktas inte som nationalitet eller exakt plats.',
  },
  ro: {
    updated: 'Ultima actualizare: 7 septembrie 2026',
    heading: 'Observarea aproximativă a țării',
    body: 'Când este activă o sesiune de portofel verificată, VeInvite poate înregistra un cod de țară din două litere furnizat de o infrastructură edge de încredere. Acest semnal aproximativ de locație a rețelei poate fi păstrat împreună cu activarea invitației și este folosit numai pentru statistici și clasamente agregate pe țări ale invitațiilor verificate. VeInvite nu deduce țara din limba selectată în aplicație, nu stochează adrese IP brute pentru această funcție și nu publică asocieri între portofele și țări. Codul țării nu este tratat ca naționalitate sau locație exactă.',
  },
  ur: {
    updated: 'آخری تازہ کاری: 7 ستمبر 2026',
    heading: 'ملک کی عمومی سطح پر شناخت',
    body: 'تصدیق شدہ والٹ سیشن فعال ہونے پر VeInvite قابلِ اعتماد ایج انفراسٹرکچر سے ملنے والا دو حرفی ملکی کوڈ ریکارڈ کر سکتا ہے۔ نیٹ ورک مقام کا یہ عمومی اشارہ دعوت کی فعالی کے ساتھ محفوظ کیا جا سکتا ہے اور صرف تصدیق شدہ دعوتوں کے ملک وار مجموعی اعداد و شمار اور درجہ بندی کے لیے استعمال ہوتا ہے۔ VeInvite منتخب ایپ زبان سے ملک اخذ نہیں کرتا، اس خصوصیت کے لیے خام IP پتے محفوظ نہیں کرتا اور والٹ سے ملک کی میپنگ شائع نہیں کرتا۔ ملکی کوڈ کو شہریت یا درست مقام نہیں سمجھا جاتا۔',
  },
  pcm: {
    updated: 'Last updated: 7 September 2026',
    heading: 'Country info for general level',
    body: 'When verified wallet session dey active, VeInvite fit record two-letter country code wey trusted edge infrastructure provide. This general network-location signal fit stay with referral activation and na only aggregate country statistics and ranking for verified referrals e dey serve. VeInvite no dey guess country from the app language you choose, no dey store raw IP address for this feature, and no dey publish wallet-to-country mapping. Country code no mean nationality or exact location.',
  },
  arz: {
    updated: 'آخر تحديث: 7 سبتمبر 2026',
    heading: 'تحديد تقريبي للبلد',
    body: 'لما جلسة المحفظة الموثقة تكون شغالة، VeInvite ممكن يسجل كود بلد من حرفين جاي من بنية edge موثوقة. الإشارة التقريبية لمكان الشبكة دي ممكن تتحفظ مع تفعيل الدعوة، وبتتستخدم بس في إحصائيات وترتيبات مجمعة حسب البلد للدعوات اللي تم التحقق منها. VeInvite ما بيستنتجش البلد من لغة التطبيق المختارة، وما بيخزنش عناوين IP الخام للميزة دي، وما بينشرش ربط بين المحافظ والبلدان. كود البلد مش معناه الجنسية ولا المكان الدقيق.',
  },
  mr: {
    updated: 'शेवटचे अद्यतन: 7 सप्टेंबर 2026',
    heading: 'देशाची साधारण नोंद',
    body: 'सत्यापित वॉलेट सत्र सक्रिय असताना VeInvite विश्वासार्ह एज पायाभूत सुविधेकडून मिळालेला दोन-अक्षरी देश कोड नोंदवू शकते. हा साधारण नेटवर्क-स्थान संकेत रेफरल सक्रियतेसोबत जतन केला जाऊ शकतो आणि फक्त सत्यापित रेफरलच्या देशनिहाय एकत्रित आकडेवारी व क्रमवारीसाठी वापरला जातो. VeInvite निवडलेल्या अॅप भाषेवरून देशाचा अंदाज लावत नाही, या सुविधेसाठी कच्चे IP पत्ते साठवत नाही आणि वॉलेट-देश जोडणी सार्वजनिक करत नाही. देश कोड म्हणजे राष्ट्रीयत्व किंवा अचूक स्थान नाही.',
  },
  te: {
    updated: 'చివరిగా నవీకరించబడింది: 7 సెప్టెంబర్ 2026',
    heading: 'సుమారు దేశ సమాచారం',
    body: 'ధృవీకరించిన వాలెట్ సెషన్ సక్రియంగా ఉన్నప్పుడు VeInvite నమ్మదగిన ఎడ్జ్ మౌలిక సదుపాయం అందించే రెండు అక్షరాల దేశ కోడ్‌ను నమోదు చేయవచ్చు. ఈ సుమారు నెట్‌వర్క్-స్థాన సంకేతాన్ని రిఫరల్ యాక్టివేషన్‌తో భద్రపరచి, ధృవీకరించిన రిఫరల్స్‌కు సంబంధించిన దేశవారీ సమగ్ర గణాంకాలు మరియు ర్యాంకింగ్‌ల కోసం మాత్రమే ఉపయోగిస్తారు. VeInvite ఎంచుకున్న యాప్ భాష ఆధారంగా దేశాన్ని ఊహించదు, ఈ ఫీచర్ కోసం ముడి IP చిరునామాలను నిల్వ చేయదు మరియు వాలెట్-దేశ మ్యాపింగ్‌లను ప్రచురించదు. దేశ కోడ్‌ను జాతీయతగా లేదా ఖచ్చితమైన స్థానంగా పరిగణించరు.',
  },
  sw: {
    updated: 'Ilisasishwa mwisho: 7 Septemba 2026',
    heading: 'Utambuzi wa nchi kwa kiwango cha jumla',
    body: 'Kipindi cha pochi kilichothibitishwa kinapokuwa hai, VeInvite inaweza kurekodi msimbo wa nchi wa herufi mbili unaotolewa na miundombinu ya edge inayoaminika. Ishara hii ya jumla ya eneo la mtandao inaweza kuhifadhiwa pamoja na uanzishaji wa mwaliko na kutumika tu kwa takwimu na viwango vya jumla vya nchi kwa mialiko iliyothibitishwa. VeInvite haitabiri nchi kutokana na lugha ya programu iliyochaguliwa, haihifadhi anwani ghafi za IP kwa kipengele hiki, na haichapishi uhusiano wa pochi na nchi. Msimbo wa nchi hauchukuliwi kuwa uraia au eneo sahihi.',
  },
  ha: {
    updated: 'An sabunta: 7 Satumba 2026',
    heading: 'Bayanan ƙasa a matakin gaba ɗaya',
    body: 'Lokacin da zaman walat da aka tabbatar yake aiki, VeInvite na iya rubuta lambar ƙasa mai haruffa biyu daga amintaccen tsarin edge. Ana iya adana wannan alamar wurin cibiyar sadarwa ta gaba ɗaya tare da kunna gayyata, kuma ana amfani da ita kawai don ƙididdiga da matsayi na ƙasashe a dunkule na gayyatar da aka tabbatar. VeInvite ba ya hasashen ƙasa daga harshen manhajar da aka zaɓa, ba ya adana ainihin adireshin IP don wannan fasalin, kuma ba ya wallafa haɗin walat da ƙasa. Ba a ɗaukar lambar ƙasa a matsayin ɗan ƙasa ko takamaiman wuri.',
  },
  el: {
    updated: 'Τελευταία ενημέρωση: 7 Σεπτεμβρίου 2026',
    heading: 'Κατά προσέγγιση αναγνώριση χώρας',
    body: 'Όταν είναι ενεργή μια επαληθευμένη συνεδρία πορτοφολιού, το VeInvite μπορεί να καταγράφει έναν κωδικό χώρας δύο γραμμάτων που παρέχεται από αξιόπιστη υποδομή edge. Αυτό το κατά προσέγγιση σήμα τοποθεσίας δικτύου μπορεί να διατηρείται μαζί με την ενεργοποίηση της πρόσκλησης και να χρησιμοποιείται μόνο για συγκεντρωτικά στατιστικά και κατατάξεις ανά χώρα για επαληθευμένες προσκλήσεις. Το VeInvite δεν συμπεραίνει τη χώρα από την επιλεγμένη γλώσσα της εφαρμογής, δεν αποθηκεύει ακατέργαστες διευθύνσεις IP για αυτή τη λειτουργία και δεν δημοσιεύει αντιστοιχίσεις πορτοφολιού με χώρα. Ο κωδικός χώρας δεν θεωρείται εθνικότητα ή ακριβής τοποθεσία.',
  },
};
