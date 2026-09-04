import type { Locale } from './locales';

export type PrivacyWalletLanguageCopy = {
  updated: string;
  heading: string;
  body: string;
};

export const PRIVACY_WALLET_LANGUAGE_COPY: Record<
  Locale,
  PrivacyWalletLanguageCopy
> = {
  en: {
    updated: 'Last updated: September 4, 2026',
    heading: 'Wallet language settings',
    body: 'When a verified wallet session is active, VeInvite may store the wallet’s explicit language preference and the language currently displayed, together with whether that display language came from browser detection, browser-local storage, a saved wallet preference, or an explicit selection. This operational wallet-language state is kept separately from anonymous usage analytics. Browser-detected or browser-local language is not turned into a cross-device wallet preference unless the user explicitly changes language while authenticated. Display language is not treated as a user’s country or nationality.',
  },
  ko: {
    updated: '최종 업데이트: 2026년 9월 4일',
    heading: '지갑 언어 설정',
    body: '검증된 지갑 세션이 활성화된 동안 VeInvite는 해당 지갑이 직접 저장한 언어 설정과 현재 앱에 표시되는 언어를, 브라우저 자동 감지·브라우저 로컬 저장값·저장된 지갑 설정·직접 선택 중 어떤 방식으로 결정되었는지와 함께 저장할 수 있습니다. 이 지갑별 언어 상태는 익명 이용 통계와 별도로 관리됩니다. 브라우저에서 자동 감지되었거나 로컬에 남아 있던 언어는 사용자가 인증된 상태에서 직접 언어를 변경하지 않는 한 다른 기기에도 적용되는 지갑 설정으로 저장되지 않습니다. 표시 언어를 사용자의 국가나 국적으로 판단하지 않습니다.',
  },
  zh: {
    updated: '最后更新：2026年9月4日',
    heading: '钱包语言设置',
    body: '在已验证的钱包会话有效期间，VeInvite 可能会保存该钱包明确设置的语言偏好和应用当前显示的语言，并记录该显示语言来自浏览器自动检测、浏览器本地存储、已保存的钱包偏好还是用户主动选择。此钱包语言状态与匿名使用统计分开管理。除非用户在已验证状态下主动更改语言，否则浏览器自动检测或本地保存的语言不会被转成跨设备同步的钱包偏好。显示语言不会被当作用户的国家或国籍。',
  },
  hi: {
    updated: 'अंतिम अपडेट: 4 सितंबर 2026',
    heading: 'वॉलेट भाषा सेटिंग',
    body: 'सत्यापित वॉलेट सेशन सक्रिय होने पर VeInvite उस वॉलेट की स्पष्ट रूप से चुनी गई भाषा और ऐप में वर्तमान में दिखाई जा रही भाषा को, साथ ही यह जानकारी कि भाषा ब्राउज़र पहचान, ब्राउज़र के स्थानीय स्टोरेज, सेव की गई वॉलेट पसंद या सीधे चयन से आई है, सहेज सकता है। यह वॉलेट-भाषा स्थिति गुमनाम उपयोग आँकड़ों से अलग रखी जाती है। ब्राउज़र से पहचानी गई या स्थानीय रूप से बची भाषा को तब तक सभी डिवाइस पर लागू होने वाली वॉलेट पसंद नहीं बनाया जाता, जब तक उपयोगकर्ता सत्यापित अवस्था में स्वयं भाषा न बदले। प्रदर्शित भाषा को उपयोगकर्ता का देश या राष्ट्रीयता नहीं माना जाता।',
  },
  es: {
    updated: 'Última actualización: 4 de septiembre de 2026',
    heading: 'Idioma de la cartera',
    body: 'Mientras haya una sesión de cartera verificada, VeInvite puede guardar la preferencia de idioma elegida expresamente para esa cartera y el idioma que se muestra actualmente, junto con su origen: detección del navegador, almacenamiento local del navegador, preferencia guardada de la cartera o selección explícita. Este estado de idioma vinculado a la cartera se mantiene separado de la analítica de uso anónima. Un idioma detectado por el navegador o conservado localmente no se convierte en una preferencia de cartera sincronizada entre dispositivos salvo que el usuario cambie el idioma de forma explícita mientras está autenticado. El idioma mostrado no se considera el país ni la nacionalidad del usuario.',
  },
  ja: {
    updated: '最終更新日：2026年9月4日',
    heading: 'ウォレットの言語設定',
    body: '認証済みウォレットのセッション中、VeInvite はそのウォレットで明示的に保存された言語設定と現在アプリに表示されている言語を、その言語がブラウザの自動判定、ブラウザのローカル保存、保存済みウォレット設定、またはユーザーの明示的な選択のどれに由来するかとともに保存する場合があります。このウォレット別の言語状態は匿名の利用統計とは分けて管理されます。ブラウザが自動判定した言語やローカルに残っていた言語は、認証中にユーザー自身が明示的に言語を変更しない限り、複数端末で共有されるウォレット設定にはなりません。表示言語をユーザーの国や国籍として扱うことはありません。',
  },
  it: {
    updated: 'Ultimo aggiornamento: 4 settembre 2026',
    heading: 'Lingua del wallet',
    body: 'Quando è attiva una sessione wallet verificata, VeInvite può memorizzare la preferenza linguistica scelta esplicitamente per quel wallet e la lingua attualmente visualizzata, indicando se deriva dal rilevamento del browser, dalla memoria locale del browser, da una preferenza wallet salvata o da una scelta esplicita. Questo stato linguistico associato al wallet è gestito separatamente dalle statistiche d’uso anonime. Una lingua rilevata dal browser o presente solo localmente non diventa una preferenza wallet valida su più dispositivi, a meno che l’utente non cambi esplicitamente lingua mentre è autenticato. La lingua visualizzata non viene considerata come paese o nazionalità dell’utente.',
  },
  tr: {
    updated: 'Son güncelleme: 4 Eylül 2026',
    heading: 'Cüzdan dil ayarları',
    body: 'Doğrulanmış bir cüzdan oturumu açıkken VeInvite, o cüzdan için açıkça kaydedilen dil tercihini ve uygulamada o anda gösterilen dili; bu dilin tarayıcı algılamasından, tarayıcıdaki yerel kayıttan, kayıtlı cüzdan tercihinden veya açık bir seçimden gelip gelmediğiyle birlikte saklayabilir. Bu cüzdana bağlı dil durumu anonim kullanım analitiğinden ayrı tutulur. Tarayıcının algıladığı veya yalnızca tarayıcıda kalan bir dil, kullanıcı doğrulanmış durumdayken dili açıkça değiştirmedikçe cihazlar arasında geçerli bir cüzdan tercihine dönüştürülmez. Gösterilen dil, kullanıcının ülkesi veya uyruğu olarak değerlendirilmez.',
  },
  nl: {
    updated: 'Laatst bijgewerkt: 4 september 2026',
    heading: 'Taalinstellingen van de wallet',
    body: 'Wanneer een geverifieerde walletsessie actief is, kan VeInvite de expliciet opgeslagen taalvoorkeur van die wallet en de taal die op dat moment in de app wordt weergegeven bewaren, samen met de bron daarvan: browserdetectie, lokale browseropslag, een opgeslagen walletvoorkeur of een expliciete keuze. Deze aan de wallet gekoppelde taalstatus wordt apart gehouden van anonieme gebruiksanalyses. Een door de browser gedetecteerde of alleen lokaal opgeslagen taal wordt niet omgezet in een walletvoorkeur voor meerdere apparaten, tenzij de gebruiker de taal tijdens een geverifieerde sessie zelf expliciet wijzigt. De weergegeven taal wordt niet gebruikt als aanwijzing voor het land of de nationaliteit van de gebruiker.',
  },
  de: {
    updated: 'Zuletzt aktualisiert: 4. September 2026',
    heading: 'Wallet-Spracheinstellungen',
    body: 'Während eine verifizierte Wallet-Sitzung aktiv ist, kann VeInvite die ausdrücklich für diese Wallet gespeicherte Sprachpräferenz und die aktuell in der App angezeigte Sprache speichern, einschließlich der Information, ob sie aus der Browsererkennung, dem lokalen Browserspeicher, einer gespeicherten Wallet-Präferenz oder einer ausdrücklichen Auswahl stammt. Dieser Wallet-bezogene Sprachstatus wird getrennt von der anonymen Nutzungsanalyse geführt. Eine vom Browser erkannte oder nur lokal gespeicherte Sprache wird nicht zu einer geräteübergreifenden Wallet-Präferenz, solange der Nutzer die Sprache nicht während einer verifizierten Sitzung ausdrücklich ändert. Die angezeigte Sprache wird nicht als Land oder Nationalität des Nutzers gewertet.',
  },
  fr: {
    updated: 'Dernière mise à jour : 4 septembre 2026',
    heading: 'Paramètres de langue du portefeuille',
    body: 'Lorsqu’une session de portefeuille vérifiée est active, VeInvite peut enregistrer la préférence de langue explicitement choisie pour ce portefeuille ainsi que la langue actuellement affichée dans l’application, avec son origine : détection du navigateur, stockage local du navigateur, préférence de portefeuille enregistrée ou choix explicite. Cet état linguistique lié au portefeuille est conservé séparément des statistiques d’utilisation anonymes. Une langue détectée par le navigateur ou présente uniquement dans le stockage local ne devient pas une préférence de portefeuille synchronisée entre appareils, sauf si l’utilisateur change explicitement de langue pendant une session vérifiée. La langue affichée n’est pas considérée comme le pays ou la nationalité de l’utilisateur.',
  },
  ar: {
    updated: 'آخر تحديث: 4 سبتمبر 2026',
    heading: 'إعدادات لغة المحفظة',
    body: 'عندما تكون جلسة محفظة موثقة نشطة، قد يحفظ VeInvite تفضيل اللغة الذي اختاره المستخدم صراحةً لهذه المحفظة واللغة المعروضة حاليًا في التطبيق، مع توضيح ما إذا كانت اللغة جاءت من اكتشاف المتصفح أو التخزين المحلي للمتصفح أو تفضيل محفوظ للمحفظة أو اختيار صريح. تُدار حالة اللغة المرتبطة بالمحفظة بشكل منفصل عن إحصاءات الاستخدام المجهولة. ولا تتحول اللغة التي اكتشفها المتصفح أو بقيت محليًا إلى تفضيل محفظة يعمل عبر الأجهزة إلا إذا غيّر المستخدم اللغة صراحةً أثناء جلسة موثقة. ولا تُعامل لغة العرض على أنها بلد المستخدم أو جنسيته.',
  },
  bn: {
    updated: 'সর্বশেষ হালনাগাদ: ৪ সেপ্টেম্বর ২০২৬',
    heading: 'ওয়ালেটের ভাষা সেটিংস',
    body: 'যাচাইকৃত ওয়ালেট সেশন সক্রিয় থাকলে VeInvite ওই ওয়ালেটের জন্য ব্যবহারকারী স্পষ্টভাবে যে ভাষা পছন্দ সংরক্ষণ করেছেন এবং অ্যাপে বর্তমানে যে ভাষা দেখানো হচ্ছে তা সংরক্ষণ করতে পারে। পাশাপাশি ভাষাটি ব্রাউজার শনাক্তকরণ, ব্রাউজারের স্থানীয় স্টোরেজ, সংরক্ষিত ওয়ালেট পছন্দ নাকি ব্যবহারকারীর সরাসরি নির্বাচনের মাধ্যমে এসেছে তাও রাখা হতে পারে। এই ওয়ালেট-সংযুক্ত ভাষার অবস্থা বেনামী ব্যবহার পরিসংখ্যান থেকে আলাদাভাবে পরিচালিত হয়। ব্রাউজার শনাক্ত করা বা শুধু স্থানীয়ভাবে থাকা ভাষা, ব্যবহারকারী যাচাইকৃত অবস্থায় নিজে ভাষা পরিবর্তন না করা পর্যন্ত, একাধিক ডিভাইসে প্রযোজ্য ওয়ালেট পছন্দে পরিণত হয় না। প্রদর্শিত ভাষাকে ব্যবহারকারীর দেশ বা জাতীয়তা হিসেবে ধরা হয় না।',
  },
  pt: {
    updated: 'Última atualização: 4 de setembro de 2026',
    heading: 'Definições de idioma da carteira',
    body: 'Enquanto uma sessão de carteira verificada estiver ativa, a VeInvite pode guardar a preferência de idioma escolhida explicitamente para essa carteira e o idioma atualmente apresentado na aplicação, juntamente com a respetiva origem: deteção do navegador, armazenamento local do navegador, preferência guardada da carteira ou seleção explícita. Este estado de idioma associado à carteira é mantido separado das estatísticas de utilização anónimas. Um idioma detetado pelo navegador ou guardado apenas localmente não se transforma numa preferência de carteira válida em vários dispositivos, a menos que o utilizador altere explicitamente o idioma enquanto está autenticado. O idioma apresentado não é tratado como o país ou a nacionalidade do utilizador.',
  },
  ru: {
    updated: 'Последнее обновление: 4 сентября 2026 г.',
    heading: 'Языковые настройки кошелька',
    body: 'Во время активной подтверждённой сессии кошелька VeInvite может сохранять явно выбранный для этого кошелька язык и язык, который сейчас отображается в приложении, а также источник этого языка: определение браузером, локальное хранилище браузера, сохранённая настройка кошелька или явный выбор пользователя. Это состояние языка, связанное с кошельком, хранится отдельно от анонимной аналитики использования. Язык, определённый браузером или оставшийся только в локальном хранилище, не становится настройкой кошелька для нескольких устройств, пока пользователь явно не изменит язык во время подтверждённой сессии. Язык интерфейса не считается страной или национальностью пользователя.',
  },
  id: {
    updated: 'Terakhir diperbarui: 4 September 2026',
    heading: 'Pengaturan bahasa dompet',
    body: 'Saat sesi dompet terverifikasi aktif, VeInvite dapat menyimpan preferensi bahasa yang dipilih secara eksplisit untuk dompet tersebut dan bahasa yang sedang ditampilkan di aplikasi, beserta sumbernya: deteksi browser, penyimpanan lokal browser, preferensi dompet yang tersimpan, atau pilihan langsung pengguna. Status bahasa yang terhubung ke dompet ini dikelola terpisah dari analitik penggunaan anonim. Bahasa yang terdeteksi oleh browser atau hanya tersimpan secara lokal tidak dijadikan preferensi dompet lintas perangkat kecuali pengguna secara eksplisit mengubah bahasa saat terautentikasi. Bahasa tampilan tidak dianggap sebagai negara atau kewarganegaraan pengguna.',
  },
  vi: {
    updated: 'Cập nhật lần cuối: 4 tháng 9, 2026',
    heading: 'Cài đặt ngôn ngữ của ví',
    body: 'Khi phiên ví đã xác minh đang hoạt động, VeInvite có thể lưu ngôn ngữ mà người dùng chủ động đặt cho ví đó và ngôn ngữ hiện đang hiển thị trong ứng dụng, kèm nguồn xác định ngôn ngữ như tự động nhận diện từ trình duyệt, bộ nhớ cục bộ của trình duyệt, tùy chọn đã lưu của ví hoặc lựa chọn trực tiếp của người dùng. Trạng thái ngôn ngữ gắn với ví này được quản lý riêng với số liệu sử dụng ẩn danh. Ngôn ngữ do trình duyệt tự nhận diện hoặc chỉ còn trong bộ nhớ cục bộ sẽ không trở thành tùy chọn ví dùng trên nhiều thiết bị trừ khi người dùng chủ động đổi ngôn ngữ trong khi đã xác thực. Ngôn ngữ hiển thị không được xem là quốc gia hay quốc tịch của người dùng.',
  },
  'zh-tw': {
    updated: '最後更新：2026年9月4日',
    heading: '錢包語言設定',
    body: '在已驗證的錢包工作階段有效期間，VeInvite 可能會儲存該錢包由使用者明確設定的語言偏好，以及應用程式目前顯示的語言，並記錄顯示語言來自瀏覽器自動偵測、瀏覽器本機儲存、已儲存的錢包偏好或使用者明確選擇。此錢包語言狀態會與匿名使用統計分開管理。瀏覽器自動偵測或僅留在本機的語言，不會在使用者已驗證狀態下主動變更語言之前，轉成可跨裝置套用的錢包偏好。顯示語言不會被視為使用者的國家或國籍。',
  },
  sv: {
    updated: 'Senast uppdaterad: 4 september 2026',
    heading: 'Plånbokens språkinställningar',
    body: 'När en verifierad plånbokssession är aktiv kan VeInvite spara den språkpreferens som uttryckligen valts för plånboken och det språk som för närvarande visas i appen, tillsammans med om språket kommer från webbläsarens detektering, lokal webbläsarlagring, en sparad plånbokspreferens eller ett uttryckligt val. Detta plånboksanknutna språkstatus hålls åtskilt från anonym användningsanalys. Ett språk som upptäckts av webbläsaren eller bara finns lokalt blir inte en plånbokspreferens mellan enheter om inte användaren uttryckligen ändrar språk under en verifierad session. Visningsspråket behandlas inte som användarens land eller nationalitet.',
  },
  ro: {
    updated: 'Ultima actualizare: 4 septembrie 2026',
    heading: 'Setările de limbă ale portofelului',
    body: 'Cât timp este activă o sesiune de portofel verificată, VeInvite poate salva preferința de limbă aleasă explicit pentru acel portofel și limba afișată în prezent în aplicație, împreună cu sursa acesteia: detectarea browserului, stocarea locală a browserului, o preferință salvată a portofelului sau o alegere explicită. Această stare de limbă asociată portofelului este păstrată separat de analizele anonime de utilizare. O limbă detectată de browser sau rămasă doar local nu devine o preferință de portofel valabilă pe mai multe dispozitive decât dacă utilizatorul schimbă explicit limba în timpul unei sesiuni verificate. Limba afișată nu este considerată țara sau naționalitatea utilizatorului.',
  },
  ur: {
    updated: 'آخری تازہ کاری: 4 ستمبر 2026',
    heading: 'والیٹ کی زبان کی ترتیبات',
    body: 'جب تصدیق شدہ والیٹ سیشن فعال ہو تو VeInvite اس والیٹ کے لیے صارف کی واضح طور پر محفوظ کردہ زبان کی ترجیح اور ایپ میں اس وقت دکھائی جانے والی زبان محفوظ کر سکتا ہے، اور یہ بھی کہ زبان براؤزر کی خودکار شناخت، براؤزر کی مقامی اسٹوریج، محفوظ والیٹ ترجیح یا صارف کے واضح انتخاب سے آئی ہے۔ والیٹ سے منسلک یہ زبان کی حالت گمنام استعمال کے تجزیات سے الگ رکھی جاتی ہے۔ براؤزر سے شناخت شدہ یا صرف مقامی طور پر محفوظ زبان اس وقت تک مختلف ڈیوائسز پر لاگو ہونے والی والیٹ ترجیح نہیں بنتی جب تک صارف تصدیق شدہ حالت میں خود زبان تبدیل نہ کرے۔ دکھائی جانے والی زبان کو صارف کا ملک یا قومیت نہیں سمجھا جاتا۔',
  },
  pcm: {
    updated: 'Last update: 4 September 2026',
    heading: 'Wallet language setting',
    body: 'When verified wallet session dey active, VeInvite fit save the language wey person choose directly for that wallet and the language wey app dey show now, plus whether e come from browser detection, browser local storage, saved wallet preference, or direct selection. This wallet-language state dey separate from anonymous usage analytics. Language wey browser detect or wey remain only for browser storage no go become cross-device wallet preference unless the user change language directly while the wallet session dey verified. Display language no mean say na the user country or nationality.',
  },
  arz: {
    updated: 'آخر تحديث: 4 سبتمبر 2026',
    heading: 'إعدادات لغة المحفظة',
    body: 'لما تكون جلسة المحفظة متحققة، VeInvite ممكن يحفظ اللغة اللي المستخدم اختارها بشكل واضح للمحفظة واللغة اللي التطبيق بيعرضها دلوقتي، وكمان مصدر اللغة سواء من اكتشاف المتصفح أو التخزين المحلي للمتصفح أو إعداد محفوظ للمحفظة أو اختيار مباشر. حالة اللغة المرتبطة بالمحفظة دي بتتخزن بشكل منفصل عن إحصائيات الاستخدام المجهولة. اللغة اللي المتصفح اكتشفها أو اللي موجودة محليًا بس مش بتتحول لإعداد محفظة يشتغل على أكتر من جهاز إلا لو المستخدم غيّر اللغة بنفسه وهو متحقق. لغة العرض مش معناها بلد المستخدم ولا جنسيته.',
  },
  mr: {
    updated: 'शेवटचे अद्यतन: 4 सप्टेंबर 2026',
    heading: 'वॉलेट भाषा सेटिंग',
    body: 'सत्यापित वॉलेट सत्र सक्रिय असताना VeInvite त्या वॉलेटसाठी वापरकर्त्याने स्पष्टपणे निवडलेली भाषा आणि अॅपमध्ये सध्या दिसणारी भाषा, तसेच ती भाषा ब्राउझरने ओळखली, ब्राउझरच्या स्थानिक स्टोरेजमधून आली, सेव्ह केलेल्या वॉलेट पसंतीतून आली की थेट निवडली गेली, हे जतन करू शकते. ही वॉलेटशी जोडलेली भाषा स्थिती अनामिक वापर विश्लेषणापासून वेगळी ठेवली जाते. ब्राउझरने ओळखलेली किंवा फक्त स्थानिकरित्या राहिलेली भाषा वापरकर्त्याने सत्यापित अवस्थेत स्वतः भाषा बदलल्याशिवाय अनेक डिव्हाइसवर लागू होणारी वॉलेट पसंती बनत नाही. दाखवलेली भाषा वापरकर्त्याचा देश किंवा राष्ट्रीयत्व मानली जात नाही.',
  },
  te: {
    updated: 'చివరి నవీకరణ: 4 సెప్టెంబర్ 2026',
    heading: 'వాలెట్ భాష సెట్టింగ్‌లు',
    body: 'ధృవీకరించిన వాలెట్ సెషన్ సక్రియంగా ఉన్నప్పుడు, VeInvite ఆ వాలెట్ కోసం వినియోగదారు స్పష్టంగా ఎంచుకున్న భాషా అభిరుచిని మరియు యాప్‌లో ప్రస్తుతం చూపిస్తున్న భాషను, అలాగే ఆ భాష బ్రౌజర్ గుర్తింపు, బ్రౌజర్ లోకల్ స్టోరేజ్, సేవ్ చేసిన వాలెట్ అభిరుచి లేదా వినియోగదారు ప్రత్యక్ష ఎంపికలో ఏదివల్ల వచ్చిందో కూడా భద్రపరచవచ్చు. ఈ వాలెట్‌కు అనుసంధానమైన భాషా స్థితి అనామక వినియోగ విశ్లేషణల నుండి వేరుగా నిర్వహించబడుతుంది. బ్రౌజర్ గుర్తించిన లేదా లోకల్‌గా మాత్రమే ఉన్న భాష, వినియోగదారు ధృవీకరించిన స్థితిలో స్వయంగా భాష మార్చితే తప్ప, పరికరాల మధ్య వర్తించే వాలెట్ అభిరుచిగా మారదు. చూపించే భాషను వినియోగదారి దేశం లేదా జాతీయతగా పరిగణించరు.',
  },
  sw: {
    updated: 'Ilisasishwa mwisho: 4 Septemba 2026',
    heading: 'Mipangilio ya lugha ya pochi',
    body: 'Wakati kipindi cha pochi kilichothibitishwa kinaendelea, VeInvite inaweza kuhifadhi lugha ambayo mtumiaji ameichagua wazi kwa pochi hiyo na lugha inayoonyeshwa sasa kwenye programu, pamoja na chanzo chake: utambuzi wa kivinjari, hifadhi ya ndani ya kivinjari, chaguo la lugha lililohifadhiwa kwa pochi, au uchaguzi wa moja kwa moja. Hali hii ya lugha inayohusishwa na pochi huhifadhiwa tofauti na takwimu za matumizi zisizomtambulisha mtu. Lugha iliyotambuliwa na kivinjari au iliyobaki kwenye hifadhi ya ndani pekee haitageuzwa kuwa chaguo la pochi linalotumika kwenye vifaa tofauti isipokuwa mtumiaji abadilishe lugha mwenyewe akiwa amethibitishwa. Lugha inayoonyeshwa haichukuliwi kuwa nchi au uraia wa mtumiaji.',
  },
  ha: {
    updated: 'Sabuntawa ta ƙarshe: 4 Satumba 2026',
    heading: 'Saitin harshen walat',
    body: 'Lokacin da ingantaccen zaman walat yake aiki, VeInvite na iya adana harshen da mai amfani ya zaɓa a fili domin wannan walat da harshen da ake nunawa a manhajar a yanzu, tare da bayanin ko ya fito ne daga gano harshen burauza, ma’ajiyar burauza ta cikin na’ura, zaɓin harshen walat da aka adana, ko zaɓin da mai amfani ya yi kai tsaye. Wannan bayanin harshen da ke da alaƙa da walat ana ware shi daga kididdigar amfani marar bayyana mutum. Harshen da burauza ta gano ko wanda ya rage a ma’ajiyar cikin na’ura ba zai zama zaɓin walat da ke aiki a na’urori daban-daban ba sai mai amfani ya canza harshen da kansa yayin zaman da aka tabbatar. Ba a ɗaukar harshen da ake nunawa a matsayin ƙasar mai amfani ko asalinsa ba.',
  },
};
