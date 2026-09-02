import type { Locale } from './locales';

export type PrivacyUsageAnalyticsCopy = {
  updated: string;
  heading: string;
  body: string;
};

export const PRIVACY_USAGE_ANALYTICS_COPY: Record<Locale, PrivacyUsageAnalyticsCopy> = {
  en: {
    updated: 'Last updated: September 3, 2026',
    heading: 'Anonymous usage analytics',
    body: 'To understand visits and improve VeInvite, the app uses a random browser identifier stored locally and records aggregate usage such as visit and session counts, active foreground time, app section, selected language, broad device category, referral-source category, and whether a verified wallet session existed. The analytics store does not save raw IP addresses, full user-agent strings, wallet addresses, invite codes, query strings, or full referrer URLs. Technical request data may be processed briefly for security and rate limiting. Usage analytics never determines referral, eligibility, Sybil, or reward decisions.',
  },
  ko: {
    updated: '최종 업데이트: 2026년 9월 3일',
    heading: '익명 이용 통계',
    body: 'VeInvite는 방문 현황을 이해하고 서비스를 개선하기 위해 브라우저에 임의의 식별자를 로컬로 저장하고 방문·세션 수, 실제 활성 이용시간, 이용한 앱 화면, 선택 언어, 대략적인 기기 유형, 유입경로 유형, 검증된 지갑 세션 존재 여부와 같은 이용 통계를 기록합니다. 이용 통계 저장소에는 원본 IP 주소, 전체 User-Agent 문자열, 지갑 주소, 초대 코드, 쿼리 문자열, 전체 유입 URL을 저장하지 않습니다. 보안 및 요청 제한을 위해 기술적 요청 정보가 일시적으로 처리될 수 있습니다. 이용 통계는 추천, 참여 자격, Sybil 판정 또는 보상 결정에 사용되지 않습니다.',
  },
  zh: {
    updated: '最后更新：2026年9月3日',
    heading: '匿名使用统计',
    body: '为了解访问情况并改进 VeInvite，应用会在浏览器本地保存一个随机标识符，并记录访问与会话次数、实际活跃使用时间、使用的应用页面、所选语言、大致设备类型、来源类别以及是否存在已验证的钱包会话等汇总使用数据。分析数据不会保存原始 IP 地址、完整 User-Agent、钱包地址、邀请码、查询字符串或完整来源网址。为安全和请求频率限制，技术请求信息可能会被短暂处理。使用统计绝不会用于决定推荐关系、参与资格、Sybil 判定或奖励。',
  },
  hi: {
    updated: 'अंतिम अपडेट: 3 सितंबर 2026',
    heading: 'अनाम उपयोग आँकड़े',
    body: 'VeInvite विज़िट को समझने और सेवा सुधारने के लिए ब्राउज़र में स्थानीय रूप से एक यादृच्छिक पहचानकर्ता रखता है और विज़िट व सेशन की संख्या, सक्रिय उपयोग समय, उपयोग किया गया ऐप सेक्शन, चुनी गई भाषा, सामान्य डिवाइस श्रेणी, रेफ़रल-स्रोत श्रेणी और सत्यापित वॉलेट सेशन की मौजूदगी जैसे समेकित उपयोग आँकड़े दर्ज करता है। एनालिटिक्स स्टोर में मूल IP पता, पूरा User-Agent, वॉलेट पता, आमंत्रण कोड, क्वेरी स्ट्रिंग या पूरा रेफ़रर URL संग्रहीत नहीं किया जाता। सुरक्षा और रेट लिमिटिंग के लिए तकनीकी अनुरोध जानकारी थोड़े समय के लिए संसाधित हो सकती है। ये आँकड़े रेफ़रल, पात्रता, Sybil या पुरस्कार निर्णय तय नहीं करते।',
  },
  es: {
    updated: 'Última actualización: 3 de septiembre de 2026',
    heading: 'Analítica de uso anónima',
    body: 'Para conocer las visitas y mejorar VeInvite, la aplicación guarda localmente un identificador aleatorio del navegador y registra datos agregados como número de visitas y sesiones, tiempo de uso activo, sección utilizada, idioma seleccionado, categoría general del dispositivo, categoría de procedencia y si existía una sesión de cartera verificada. El sistema de analítica no guarda direcciones IP originales, cadenas User-Agent completas, direcciones de cartera, códigos de invitación, cadenas de consulta ni URLs completas de referencia. Algunos datos técnicos de la solicitud pueden procesarse brevemente por seguridad y limitación de solicitudes. Esta analítica nunca decide referidos, elegibilidad, Sybil ni recompensas.',
  },
  ja: {
    updated: '最終更新日：2026年9月3日',
    heading: '匿名の利用統計',
    body: 'VeInvite は訪問状況を把握してサービスを改善するため、ブラウザにランダムな識別子をローカル保存し、訪問・セッション数、実際のアクティブ利用時間、利用した画面、選択言語、おおまかな端末区分、流入元の区分、認証済みウォレットセッションの有無などの集計データを記録します。分析用データには、生の IP アドレス、完全な User-Agent、ウォレットアドレス、招待コード、クエリ文字列、完全な参照元 URL は保存しません。セキュリティとレート制限のため、技術的なリクエスト情報を一時的に処理する場合があります。利用統計が紹介、参加資格、Sybil 判定、報酬の決定に使われることはありません。',
  },
  it: {
    updated: 'Ultimo aggiornamento: 3 settembre 2026',
    heading: 'Analisi anonima dell’utilizzo',
    body: 'Per comprendere le visite e migliorare VeInvite, l’app salva localmente nel browser un identificatore casuale e registra dati aggregati come numero di visite e sessioni, tempo di utilizzo attivo, sezione usata, lingua selezionata, categoria generale del dispositivo, categoria della provenienza e presenza di una sessione wallet verificata. Il sistema di analisi non salva indirizzi IP originali, User-Agent completi, indirizzi wallet, codici invito, stringhe di query o URL completi del referrer. Alcuni dati tecnici della richiesta possono essere elaborati brevemente per sicurezza e limitazione delle richieste. Queste analisi non determinano mai referral, idoneità, valutazioni Sybil o ricompense.',
  },
  tr: {
    updated: 'Son güncelleme: 3 Eylül 2026',
    heading: 'Anonim kullanım analitiği',
    body: 'VeInvite ziyaretleri anlamak ve hizmeti geliştirmek için tarayıcıda yerel olarak rastgele bir tanımlayıcı saklar; ziyaret ve oturum sayısı, aktif kullanım süresi, kullanılan uygulama bölümü, seçilen dil, genel cihaz kategorisi, yönlendirme kaynağı kategorisi ve doğrulanmış cüzdan oturumunun bulunup bulunmadığı gibi toplu kullanım verilerini kaydeder. Analitik deposunda ham IP adresleri, tam User-Agent dizeleri, cüzdan adresleri, davet kodları, sorgu dizeleri veya tam yönlendiren URL’ler saklanmaz. Güvenlik ve istek sınırlandırması için teknik istek bilgileri kısa süreli işlenebilir. Kullanım analitiği yönlendirme, uygunluk, Sybil veya ödül kararlarını belirlemez.',
  },
  nl: {
    updated: 'Laatst bijgewerkt: 3 september 2026',
    heading: 'Anonieme gebruiksstatistieken',
    body: 'Om bezoeken te begrijpen en VeInvite te verbeteren, bewaart de app lokaal een willekeurige browser-ID en registreert zij geaggregeerde gegevens zoals het aantal bezoeken en sessies, actieve gebruikstijd, gebruikte appsectie, gekozen taal, globale apparaatcategorie, herkomstcategorie en of er een geverifieerde walletsessie aanwezig was. De analysedatabase bewaart geen ruwe IP-adressen, volledige User-Agent-strings, walletadressen, uitnodigingscodes, querystrings of volledige verwijzende URL’s. Technische verzoekgegevens kunnen kort worden verwerkt voor beveiliging en rate limiting. Deze statistieken bepalen nooit verwijzingen, geschiktheid, Sybil-beoordelingen of beloningen.',
  },
  de: {
    updated: 'Zuletzt aktualisiert: 3. September 2026',
    heading: 'Anonyme Nutzungsanalyse',
    body: 'Um Besuche zu verstehen und VeInvite zu verbessern, speichert die App lokal eine zufällige Browser-Kennung und erfasst zusammengefasste Nutzungsdaten wie Besuchs- und Sitzungszahlen, aktive Nutzungszeit, verwendeten App-Bereich, gewählte Sprache, grobe Gerätekategorie, Herkunftskategorie und ob eine verifizierte Wallet-Sitzung bestand. Im Analysespeicher werden keine rohen IP-Adressen, vollständigen User-Agent-Zeichenfolgen, Wallet-Adressen, Einladungscodes, Query-Strings oder vollständigen Referrer-URLs gespeichert. Technische Anfragedaten können kurzzeitig für Sicherheit und Rate-Limits verarbeitet werden. Die Nutzungsanalyse entscheidet niemals über Empfehlungen, Berechtigung, Sybil-Bewertungen oder Belohnungen.',
  },
  fr: {
    updated: 'Dernière mise à jour : 3 septembre 2026',
    heading: 'Statistiques d’utilisation anonymes',
    body: 'Pour comprendre les visites et améliorer VeInvite, l’application stocke localement un identifiant aléatoire du navigateur et enregistre des données agrégées telles que le nombre de visites et de sessions, le temps d’utilisation active, la section utilisée, la langue choisie, la catégorie générale d’appareil, la catégorie de provenance et l’existence d’une session de portefeuille vérifiée. Le système d’analyse ne conserve pas les adresses IP brutes, les User-Agent complets, les adresses de portefeuille, les codes d’invitation, les chaînes de requête ni les URL complètes de provenance. Des informations techniques de requête peuvent être traitées brièvement pour la sécurité et la limitation de débit. Ces statistiques ne déterminent jamais les parrainages, l’éligibilité, les décisions Sybil ou les récompenses.',
  },
  ar: {
    updated: 'آخر تحديث: 3 سبتمبر 2026',
    heading: 'إحصاءات استخدام مجهولة الهوية',
    body: 'لفهم الزيارات وتحسين VeInvite، يحفظ التطبيق معرّفًا عشوائيًا للمتصفح محليًا ويسجل بيانات استخدام مجمعة مثل عدد الزيارات والجلسات، ووقت الاستخدام النشط، وقسم التطبيق المستخدم، واللغة المختارة، وفئة الجهاز العامة، وفئة مصدر الزيارة، وما إذا كانت هناك جلسة محفظة موثقة. لا يخزن نظام التحليلات عناوين IP الأصلية أو سلسلة User-Agent الكاملة أو عناوين المحافظ أو رموز الدعوة أو سلاسل الاستعلام أو عناوين الإحالة الكاملة. قد تتم معالجة معلومات الطلب التقنية لفترة وجيزة لأغراض الأمان وتحديد معدل الطلبات. ولا تُستخدم هذه الإحصاءات أبدًا لاتخاذ قرارات الإحالة أو الأهلية أو Sybil أو المكافآت.',
  },
  bn: {
    updated: 'সর্বশেষ হালনাগাদ: ৩ সেপ্টেম্বর ২০২৬',
    heading: 'বেনামী ব্যবহার পরিসংখ্যান',
    body: 'ভিজিট বোঝা ও VeInvite উন্নত করার জন্য অ্যাপটি ব্রাউজারে স্থানীয়ভাবে একটি র‌্যান্ডম শনাক্তকারী রাখে এবং ভিজিট ও সেশন সংখ্যা, সক্রিয় ব্যবহারের সময়, ব্যবহৃত অ্যাপ অংশ, নির্বাচিত ভাষা, সাধারণ ডিভাইস শ্রেণি, আগমনের উৎস শ্রেণি এবং যাচাইকৃত ওয়ালেট সেশন ছিল কি না—এ ধরনের সমষ্টিগত ব্যবহার তথ্য রেকর্ড করে। অ্যানালিটিক্সে কাঁচা IP ঠিকানা, সম্পূর্ণ User-Agent, ওয়ালেট ঠিকানা, আমন্ত্রণ কোড, কুয়েরি স্ট্রিং বা সম্পূর্ণ রেফারার URL সংরক্ষণ করা হয় না। নিরাপত্তা ও রেট লিমিটিংয়ের জন্য প্রযুক্তিগত অনুরোধ তথ্য অল্প সময়ের জন্য প্রক্রিয়া করা হতে পারে। এই পরিসংখ্যান রেফারেল, যোগ্যতা, Sybil বা পুরস্কারের সিদ্ধান্ত নির্ধারণ করে না।',
  },
  pt: {
    updated: 'Última atualização: 3 de setembro de 2026',
    heading: 'Análise de uso anônima',
    body: 'Para entender as visitas e melhorar o VeInvite, o app armazena localmente um identificador aleatório do navegador e registra dados agregados como número de visitas e sessões, tempo de uso ativo, seção usada, idioma selecionado, categoria geral do dispositivo, categoria da origem e se existia uma sessão de carteira verificada. O armazenamento de análise não guarda endereços IP brutos, User-Agent completos, endereços de carteira, códigos de convite, strings de consulta nem URLs completas de referência. Informações técnicas da solicitação podem ser processadas brevemente para segurança e limitação de requisições. A análise de uso nunca determina indicações, elegibilidade, decisões de Sybil ou recompensas.',
  },
  ru: {
    updated: 'Последнее обновление: 3 сентября 2026 г.',
    heading: 'Анонимная аналитика использования',
    body: 'Чтобы понимать посещаемость и улучшать VeInvite, приложение локально сохраняет случайный идентификатор браузера и записывает агрегированные данные: количество посещений и сессий, активное время использования, раздел приложения, выбранный язык, общую категорию устройства, категорию источника перехода и наличие подтвержденной сессии кошелька. В аналитическом хранилище не сохраняются исходные IP-адреса, полные строки User-Agent, адреса кошельков, коды приглашений, строки запроса или полные URL источников перехода. Технические данные запроса могут кратковременно обрабатываться для безопасности и ограничения частоты запросов. Аналитика использования никогда не определяет рефералы, право на участие, решения Sybil или награды.',
  },
  id: {
    updated: 'Terakhir diperbarui: 3 September 2026',
    heading: 'Analitik penggunaan anonim',
    body: 'Untuk memahami kunjungan dan meningkatkan VeInvite, aplikasi menyimpan pengenal browser acak secara lokal dan mencatat data penggunaan agregat seperti jumlah kunjungan dan sesi, waktu penggunaan aktif, bagian aplikasi yang digunakan, bahasa yang dipilih, kategori perangkat secara umum, kategori sumber kunjungan, dan apakah terdapat sesi dompet terverifikasi. Penyimpanan analitik tidak menyimpan alamat IP mentah, User-Agent lengkap, alamat dompet, kode undangan, query string, atau URL referrer lengkap. Informasi teknis permintaan dapat diproses sebentar untuk keamanan dan pembatasan permintaan. Analitik penggunaan tidak pernah menentukan referral, kelayakan, keputusan Sybil, atau hadiah.',
  },
  vi: {
    updated: 'Cập nhật lần cuối: 3 tháng 9, 2026',
    heading: 'Phân tích sử dụng ẩn danh',
    body: 'Để hiểu lượt truy cập và cải thiện VeInvite, ứng dụng lưu cục bộ một mã nhận dạng trình duyệt ngẫu nhiên và ghi nhận dữ liệu sử dụng tổng hợp như số lượt truy cập và phiên, thời gian sử dụng thực tế, khu vực ứng dụng đã dùng, ngôn ngữ đã chọn, nhóm thiết bị chung, nhóm nguồn truy cập và việc có phiên ví đã xác minh hay không. Kho phân tích không lưu địa chỉ IP gốc, chuỗi User-Agent đầy đủ, địa chỉ ví, mã mời, chuỗi truy vấn hoặc URL giới thiệu đầy đủ. Thông tin kỹ thuật của yêu cầu có thể được xử lý trong thời gian ngắn để bảo mật và giới hạn tần suất. Phân tích sử dụng không bao giờ quyết định giới thiệu, điều kiện tham gia, đánh giá Sybil hoặc phần thưởng.',
  },
  'zh-tw': {
    updated: '最後更新：2026年9月3日',
    heading: '匿名使用統計',
    body: '為了解造訪情況並改善 VeInvite，應用程式會在瀏覽器本機儲存一個隨機識別碼，並記錄造訪與工作階段次數、實際活躍使用時間、使用的應用程式頁面、所選語言、大致裝置類型、來源類別，以及是否存在已驗證的錢包工作階段等彙總資料。分析資料不會儲存原始 IP 位址、完整 User-Agent、錢包地址、邀請碼、查詢字串或完整來源網址。為了安全與請求頻率限制，技術性請求資訊可能會被短暫處理。使用統計絕不會用於決定推薦關係、參與資格、Sybil 判定或獎勵。',
  },
  sv: {
    updated: 'Senast uppdaterad: 3 september 2026',
    heading: 'Anonym användningsanalys',
    body: 'För att förstå besök och förbättra VeInvite lagrar appen lokalt en slumpmässig webbläsaridentifierare och registrerar aggregerad användning, till exempel antal besök och sessioner, aktiv användningstid, använd appsektion, valt språk, bred enhetskategori, kategori för trafikkälla och om en verifierad plånbokssession fanns. Analyslagret sparar inte råa IP-adresser, fullständiga User-Agent-strängar, plånboksadresser, inbjudningskoder, frågesträngar eller fullständiga hänvisnings-URL:er. Teknisk begäransinformation kan behandlas kortvarigt för säkerhet och hastighetsbegränsning. Analysen avgör aldrig hänvisningar, behörighet, Sybil-bedömningar eller belöningar.',
  },
  ro: {
    updated: 'Ultima actualizare: 3 septembrie 2026',
    heading: 'Analiză anonimă a utilizării',
    body: 'Pentru a înțelege vizitele și a îmbunătăți VeInvite, aplicația stochează local un identificator aleator al browserului și înregistrează date agregate precum numărul de vizite și sesiuni, timpul de utilizare activă, secțiunea folosită, limba selectată, categoria generală a dispozitivului, categoria sursei și existența unei sesiuni de portofel verificate. Sistemul de analiză nu păstrează adrese IP brute, șiruri User-Agent complete, adrese de portofel, coduri de invitație, șiruri de interogare sau URL-uri complete de referință. Informațiile tehnice ale cererii pot fi procesate pentru scurt timp pentru securitate și limitarea solicitărilor. Analiza nu determină niciodată recomandări, eligibilitate, decizii Sybil sau recompense.',
  },
  ur: {
    updated: 'آخری اپ ڈیٹ: 3 ستمبر 2026',
    heading: 'گمنام استعمال کے اعداد و شمار',
    body: 'VeInvite وزٹس کو سمجھنے اور سروس بہتر بنانے کے لیے براؤزر میں مقامی طور پر ایک رینڈم شناخت محفوظ کرتا ہے اور وزٹ و سیشن کی تعداد، فعال استعمال کا وقت، استعمال شدہ ایپ سیکشن، منتخب زبان، عمومی ڈیوائس کیٹیگری، آمد کے ذریعے کی کیٹیگری اور تصدیق شدہ والیٹ سیشن کی موجودگی جیسے مجموعی اعداد و شمار ریکارڈ کرتا ہے۔ اینالیٹکس میں اصل IP ایڈریس، مکمل User-Agent، والیٹ ایڈریس، دعوتی کوڈ، کوئری اسٹرنگ یا مکمل ریفرر URL محفوظ نہیں کیے جاتے۔ سکیورٹی اور ریٹ لمٹنگ کے لیے تکنیکی درخواست کی معلومات مختصر طور پر پراسیس کی جا سکتی ہیں۔ یہ اعداد و شمار ریفرل، اہلیت، Sybil یا انعام کے فیصلے نہیں کرتے۔',
  },
  pcm: {
    updated: 'Last updated: 3 September 2026',
    heading: 'Anonymous usage analytics',
    body: 'To understand visits and improve VeInvite, the app keeps a random browser identifier locally and records aggregate usage such as visits, sessions, active use time, app section, selected language, broad device type, referral-source category, and whether a verified wallet session existed. It does not store raw IP addresses, full User-Agent strings, wallet addresses, invite codes, query strings, or full referrer URLs in the analytics store. Technical request data may be processed briefly for security and rate limiting. Usage analytics never decides referral, eligibility, Sybil, or reward outcomes.',
  },
  arz: {
    updated: 'آخر تحديث: 3 سبتمبر 2026',
    heading: 'إحصاءات استخدام مجهولة الهوية',
    body: 'علشان نفهم الزيارات ونحسن VeInvite، التطبيق بيحفظ معرّف عشوائي للمتصفح محليًا وبيسجل بيانات استخدام مجمعة زي عدد الزيارات والجلسات، ووقت الاستخدام الفعلي، وقسم التطبيق المستخدم، واللغة المختارة، وفئة الجهاز بشكل عام، وفئة مصدر الزيارة، وهل فيه جلسة محفظة موثقة. مخزن التحليلات ما بيحفظش عنوان IP الأصلي، أو User-Agent كامل، أو عنوان المحفظة، أو كود الدعوة، أو query string، أو رابط الإحالة كامل. ممكن تتم معالجة معلومات تقنية للطلب لفترة قصيرة للأمان وتحديد معدل الطلبات. إحصاءات الاستخدام ما بتحددش قرارات الإحالة أو الأهلية أو Sybil أو المكافآت.',
  },
  mr: {
    updated: 'शेवटचे अद्यतन: 3 सप्टेंबर 2026',
    heading: 'अनामिक वापर विश्लेषण',
    body: 'भेटी समजून घेण्यासाठी आणि VeInvite सुधारण्यासाठी अॅप ब्राउझरमध्ये स्थानिक पातळीवर एक यादृच्छिक ओळखकर्ता ठेवते आणि भेटी व सेशनची संख्या, सक्रिय वापराचा वेळ, वापरलेला अॅप विभाग, निवडलेली भाषा, साधारण डिव्हाइस प्रकार, येण्याच्या स्रोताची श्रेणी आणि सत्यापित वॉलेट सेशन होते का यासारखी एकत्रित माहिती नोंदवते. विश्लेषण संचयात मूळ IP पत्ते, पूर्ण User-Agent, वॉलेट पत्ते, आमंत्रण कोड, क्वेरी स्ट्रिंग किंवा पूर्ण रेफरर URL जतन केले जात नाहीत. सुरक्षा आणि रेट लिमिटिंगसाठी तांत्रिक विनंती माहिती थोड्या वेळासाठी प्रक्रिया केली जाऊ शकते. हे विश्लेषण रेफरल, पात्रता, Sybil किंवा बक्षीस निर्णय ठरवत नाही.',
  },
  te: {
    updated: 'చివరిగా నవీకరించబడింది: 3 సెప్టెంబర్ 2026',
    heading: 'అజ్ఞాత వినియోగ విశ్లేషణ',
    body: 'సందర్శనలను అర్థం చేసుకుని VeInviteను మెరుగుపరచడానికి, యాప్ బ్రౌజర్‌లో యాదృచ్ఛిక గుర్తింపును స్థానికంగా ఉంచి, సందర్శనలు మరియు సెషన్‌ల సంఖ్య, క్రియాశీల వినియోగ సమయం, ఉపయోగించిన యాప్ విభాగం, ఎంచుకున్న భాష, సాధారణ పరికర వర్గం, వచ్చిన మూలం వర్గం మరియు ధృవీకరించిన వాలెట్ సెషన్ ఉందా వంటి సమగ్ర వినియోగ సమాచారాన్ని నమోదు చేస్తుంది. విశ్లేషణ నిల్వలో అసలు IP చిరునామాలు, పూర్తి User-Agent, వాలెట్ చిరునామాలు, ఆహ్వాన కోడ్‌లు, query stringలు లేదా పూర్తి referrer URLలు నిల్వ చేయబడవు. భద్రత మరియు rate limiting కోసం సాంకేతిక అభ్యర్థన సమాచారం కొద్దిసేపు ప్రాసెస్ కావచ్చు. వినియోగ విశ్లేషణ referral, eligibility, Sybil లేదా reward నిర్ణయాలను ఎప్పుడూ నిర్ణయించదు.',
  },
  sw: {
    updated: 'Ilisasishwa mwisho: 3 Septemba 2026',
    heading: 'Takwimu za matumizi zisizomtambulisha mtu',
    body: 'Ili kuelewa matembezi na kuboresha VeInvite, programu huhifadhi kitambulisho cha nasibu cha kivinjari kwenye kifaa na kurekodi takwimu zilizojumlishwa kama idadi ya matembezi na vipindi, muda wa matumizi hai, sehemu ya programu iliyotumika, lugha iliyochaguliwa, aina ya jumla ya kifaa, aina ya chanzo cha matembezi na kama kulikuwa na kipindi cha pochi kilichothibitishwa. Hifadhi ya takwimu haihifadhi anwani halisi za IP, User-Agent kamili, anwani za pochi, misimbo ya mwaliko, query string au URL kamili za rufaa. Taarifa za kiufundi za ombi zinaweza kuchakatwa kwa muda mfupi kwa usalama na udhibiti wa kiwango cha maombi. Takwimu hizi haziamui referral, ustahiki, Sybil au zawadi.',
  },
  ha: {
    updated: 'An sabunta na ƙarshe: 3 Satumba 2026',
    heading: 'Bayanan amfani na ɓoye-suna',
    body: 'Don fahimtar ziyara da inganta VeInvite, manhajar tana adana wata alamar burauza ta bazuwar a na’urar sannan tana rubuta bayanan amfani da aka tara kamar yawan ziyara da zaman amfani, lokacin amfani na ainihi, sashen manhajar da aka yi amfani da shi, harshen da aka zaɓa, nau’in na’ura gaba ɗaya, nau’in tushen ziyara da ko akwai zaman wallet da aka tabbatar. Ma’ajin nazari baya adana asalin adireshin IP, cikakken User-Agent, adireshin wallet, lambar gayyata, query string ko cikakken URL na referral. Ana iya sarrafa bayanan fasaha na buƙata na ɗan lokaci don tsaro da rate limiting. Wannan nazari baya yanke shawarar referral, cancanta, Sybil ko lada.',
  },
};
