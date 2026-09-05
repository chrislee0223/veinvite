import type { Locale } from './locales';

export type PrivacyProductAnalyticsCopy = {
  updated: string;
  heading: string;
  body: string;
};

export const PRIVACY_PRODUCT_ANALYTICS_COPY: Record<
  Locale,
  PrivacyProductAnalyticsCopy
> = {
  en: {
    updated: 'Last updated: September 5, 2026',
    heading: 'Anonymous product interaction analytics',
    body: 'When anonymous usage analytics is enabled, VeInvite may also record a limited set of product actions such as starting a wallet connection, wallet verification success or failure, copying or sharing an invite link, invite-acceptance outcomes, opening a mission link, and reward-claim outcomes. These events use the same daily anonymous browser identifier and only coarse context such as app section, selected language, device category, source category, and app build. They do not contain wallet addresses, invite or referral codes, full URLs, query strings, or free-form metadata. Raw product events are kept for up to 30 days and then only identifier-free aggregate totals remain. These analytics never establish referral, mission completion, eligibility, Sybil status, or rewards.',
  },
  ko: {
    updated: '최종 업데이트: 2026년 9월 5일',
    heading: '익명 기능 이용 통계',
    body: '익명 이용 통계를 켠 경우 VeInvite는 지갑 연결 시작, 지갑 인증 성공·실패, 초대 링크 복사·공유, 초대 수락 결과, 미션 링크 열기, 보상 청구 결과처럼 제한된 기능 이용 행동도 기록할 수 있습니다. 이 이벤트는 같은 일일 익명 브라우저 ID를 사용하며 앱 화면, 선택 언어, 대략적인 기기 유형, 유입경로 유형, 앱 빌드 같은 제한된 정보만 함께 기록합니다. 지갑 주소, 초대·추천 코드, 전체 URL, 쿼리 문자열, 자유 형식 메타데이터는 포함하지 않습니다. 원본 기능 이용 이벤트는 최대 30일만 보관한 뒤 식별자가 없는 집계 수치만 남깁니다. 이 통계는 추천 관계, 미션 완료, 참여 자격, Sybil 판정 또는 보상의 근거가 되지 않습니다.',
  },
  zh: {
    updated: '最后更新：2026年9月5日',
    heading: '匿名产品交互统计',
    body: '启用匿名使用统计后，VeInvite 还可能记录少量产品操作，例如开始连接钱包、钱包验证成功或失败、复制或分享邀请链接、接受邀请的结果、打开任务链接以及领取奖励的结果。这些事件使用同一个每日匿名浏览器 ID，并只附带应用页面、所选语言、大致设备类别、来源类别和应用版本等粗略信息。不会包含钱包地址、邀请或推荐码、完整 URL、查询字符串或自由格式元数据。原始产品事件最多保留 30 天，之后仅保留不含标识符的汇总数据。这些统计绝不会用于确定推荐关系、任务完成、参与资格、Sybil 状态或奖励。',
  },
  hi: {
    updated: 'अंतिम अपडेट: 5 सितंबर 2026',
    heading: 'गुमनाम उत्पाद इंटरैक्शन आँकड़े',
    body: 'जब गुमनाम उपयोग आँकड़े चालू हों, VeInvite कुछ सीमित उत्पाद क्रियाएँ भी दर्ज कर सकता है, जैसे वॉलेट कनेक्शन शुरू करना, वॉलेट सत्यापन का सफल या विफल होना, आमंत्रण लिंक कॉपी या शेयर करना, आमंत्रण स्वीकार करने का परिणाम, मिशन लिंक खोलना और रिवॉर्ड क्लेम का परिणाम। ये इवेंट वही दैनिक गुमनाम ब्राउज़र ID उपयोग करते हैं और केवल ऐप सेक्शन, चुनी भाषा, सामान्य डिवाइस श्रेणी, स्रोत श्रेणी और ऐप बिल्ड जैसी सीमित जानकारी रखते हैं। इनमें वॉलेट पते, आमंत्रण या रेफ़रल कोड, पूरे URL, क्वेरी स्ट्रिंग या मुक्त-रूप मेटाडेटा शामिल नहीं होते। कच्चे उत्पाद इवेंट अधिकतम 30 दिन रखे जाते हैं; उसके बाद केवल पहचान-रहित समेकित आँकड़े रहते हैं। ये आँकड़े रेफ़रल, मिशन पूर्णता, पात्रता, Sybil स्थिति या रिवॉर्ड तय नहीं करते।',
  },
  es: {
    updated: 'Última actualización: 5 de septiembre de 2026',
    heading: 'Analítica anónima de interacción con el producto',
    body: 'Cuando la analítica de uso anónima está activada, VeInvite también puede registrar un conjunto limitado de acciones, como iniciar la conexión de una cartera, el éxito o fallo de su verificación, copiar o compartir un enlace de invitación, el resultado de aceptar una invitación, abrir un enlace de misión y el resultado de reclamar una recompensa. Estos eventos usan el mismo ID anónimo diario del navegador y solo contexto general como sección, idioma, categoría de dispositivo, categoría de origen y versión de la aplicación. No incluyen direcciones de cartera, códigos de invitación o referido, URL completas, cadenas de consulta ni metadatos de formato libre. Los eventos sin procesar se conservan hasta 30 días y después solo quedan totales agregados sin identificadores. Esta analítica nunca determina referidos, misiones completadas, elegibilidad, estado Sybil ni recompensas.',
  },
  ja: {
    updated: '最終更新日：2026年9月5日',
    heading: '匿名のプロダクト操作統計',
    body: '匿名の利用統計を有効にしている場合、VeInvite はウォレット接続の開始、ウォレット認証の成功・失敗、招待リンクのコピー・共有、招待受諾の結果、ミッションリンクを開いたこと、報酬請求の結果など、限定された操作も記録することがあります。これらは同じ日次匿名ブラウザー ID を使用し、画面、選択言語、おおまかな端末区分、流入元区分、アプリのビルドなどの粗い情報だけを伴います。ウォレットアドレス、招待・紹介コード、完全な URL、クエリ文字列、自由形式のメタデータは含みません。生のイベントは最大30日間だけ保持し、その後は識別子のない集計値のみ残します。これらの統計が紹介関係、ミッション完了、参加資格、Sybil 判定、報酬の根拠になることはありません。',
  },
  it: {
    updated: 'Ultimo aggiornamento: 5 settembre 2026',
    heading: 'Analisi anonima delle interazioni con il prodotto',
    body: 'Quando l’analisi anonima dell’utilizzo è attiva, VeInvite può registrare anche un insieme limitato di azioni, come l’avvio della connessione del wallet, l’esito della verifica del wallet, la copia o condivisione di un link di invito, l’esito dell’accettazione di un invito, l’apertura di un link missione e l’esito della richiesta di una ricompensa. Gli eventi usano lo stesso ID anonimo giornaliero del browser e solo informazioni generali come sezione dell’app, lingua, categoria del dispositivo, categoria della provenienza e build dell’app. Non includono indirizzi wallet, codici invito o referral, URL completi, query string o metadati liberi. Gli eventi grezzi sono conservati fino a 30 giorni, poi restano solo totali aggregati privi di identificatori. Queste analisi non determinano referral, completamento missioni, idoneità, stato Sybil o ricompense.',
  },
  tr: {
    updated: 'Son güncelleme: 5 Eylül 2026',
    heading: 'Anonim ürün etkileşimi analitiği',
    body: 'Anonim kullanım analitiği açıkken VeInvite; cüzdan bağlantısı başlatma, cüzdan doğrulamasının başarılı veya başarısız olması, davet bağlantısını kopyalama veya paylaşma, davet kabul sonucu, görev bağlantısı açma ve ödül talebi sonucu gibi sınırlı sayıda ürün eylemini de kaydedebilir. Bu olaylar aynı günlük anonim tarayıcı kimliğini ve yalnızca uygulama bölümü, seçilen dil, genel cihaz kategorisi, kaynak kategorisi ve uygulama derlemesi gibi kaba bağlamı kullanır. Cüzdan adresi, davet veya referral kodu, tam URL, sorgu dizesi ya da serbest biçimli metadata içermez. Ham ürün olayları en fazla 30 gün tutulur, sonra yalnızca kimliksiz toplu sayılar kalır. Bu analitik referral, görev tamamlama, uygunluk, Sybil durumu veya ödüller için belirleyici değildir.',
  },
  nl: {
    updated: 'Laatst bijgewerkt: 5 september 2026',
    heading: 'Anonieme analyse van productinteracties',
    body: 'Wanneer anonieme gebruiksstatistieken zijn ingeschakeld, kan VeInvite ook een beperkte set handelingen registreren, zoals het starten van een walletverbinding, het slagen of mislukken van walletverificatie, het kopiëren of delen van een uitnodigingslink, de uitkomst van het accepteren van een uitnodiging, het openen van een missielink en de uitkomst van een beloningsclaim. Deze gebeurtenissen gebruiken hetzelfde dagelijkse anonieme browser-ID en alleen grove context zoals appsectie, taal, apparaatcategorie, herkomstcategorie en appbuild. Ze bevatten geen walletadres, uitnodigings- of referralcode, volledige URL, querystring of vrije metadata. Ruwe productgebeurtenissen worden maximaal 30 dagen bewaard; daarna blijven alleen geaggregeerde totalen zonder identificatoren over. Deze analyse bepaalt nooit referrals, missievoltooiing, geschiktheid, Sybil-status of beloningen.',
  },
  de: {
    updated: 'Zuletzt aktualisiert: 5. September 2026',
    heading: 'Anonyme Analyse von Produktinteraktionen',
    body: 'Wenn die anonyme Nutzungsanalyse aktiviert ist, kann VeInvite zusätzlich eine begrenzte Auswahl von Aktionen erfassen, etwa den Start einer Wallet-Verbindung, Erfolg oder Fehlschlag der Wallet-Verifizierung, das Kopieren oder Teilen eines Einladungslinks, Ergebnisse der Einladungsannahme, das Öffnen eines Missionslinks und Ergebnisse einer Belohnungsanforderung. Diese Ereignisse verwenden dieselbe tägliche anonyme Browser-ID und nur grobe Angaben wie App-Bereich, Sprache, Gerätekategorie, Herkunftskategorie und App-Build. Wallet-Adressen, Einladungs- oder Referral-Codes, vollständige URLs, Query-Strings und frei formulierte Metadaten werden nicht erfasst. Rohereignisse werden höchstens 30 Tage gespeichert; danach bleiben nur kennungsfreie aggregierte Summen. Diese Analyse entscheidet niemals über Referral-Beziehungen, Missionsabschluss, Berechtigung, Sybil-Status oder Belohnungen.',
  },
  fr: {
    updated: 'Dernière mise à jour : 5 septembre 2026',
    heading: 'Analyse anonyme des interactions avec le produit',
    body: 'Lorsque les statistiques d’utilisation anonymes sont activées, VeInvite peut aussi enregistrer un ensemble limité d’actions, par exemple le début d’une connexion de portefeuille, la réussite ou l’échec de sa vérification, la copie ou le partage d’un lien d’invitation, le résultat de l’acceptation d’une invitation, l’ouverture d’un lien de mission et le résultat d’une demande de récompense. Ces événements utilisent le même identifiant anonyme quotidien du navigateur et uniquement un contexte général comme la section, la langue, la catégorie d’appareil, la catégorie de provenance et la version de l’application. Ils ne contiennent pas d’adresse de portefeuille, de code d’invitation ou de parrainage, d’URL complète, de chaîne de requête ni de métadonnées libres. Les événements bruts sont conservés jusqu’à 30 jours, puis seuls des totaux agrégés sans identifiant subsistent. Ces statistiques ne déterminent jamais les parrainages, l’achèvement des missions, l’éligibilité, le statut Sybil ou les récompenses.',
  },
  ar: {
    updated: 'آخر تحديث: 5 سبتمبر 2026',
    heading: 'تحليلات مجهولة لتفاعلات المنتج',
    body: 'عند تفعيل إحصاءات الاستخدام المجهولة، قد يسجل VeInvite أيضًا مجموعة محدودة من الإجراءات مثل بدء ربط المحفظة، نجاح أو فشل التحقق منها، نسخ أو مشاركة رابط دعوة، نتيجة قبول الدعوة، فتح رابط مهمة، ونتيجة طلب المكافأة. تستخدم هذه الأحداث معرّف المتصفح المجهول اليومي نفسه ولا ترافقها إلا معلومات عامة مثل قسم التطبيق واللغة المختارة وفئة الجهاز وفئة مصدر الزيارة وإصدار التطبيق. ولا تتضمن عنوان المحفظة أو رمز الدعوة أو الإحالة أو عنوان URL كاملًا أو سلسلة استعلام أو بيانات وصفية حرة. تُحفظ الأحداث الخام لمدة تصل إلى 30 يومًا ثم تبقى فقط إجماليات مجمعة بلا معرّفات. ولا تحدد هذه التحليلات علاقة الإحالة أو إكمال المهام أو الأهلية أو حالة Sybil أو المكافآت.',
  },
  bn: {
    updated: 'সর্বশেষ হালনাগাদ: ৫ সেপ্টেম্বর ২০২৬',
    heading: 'বেনামী পণ্য-ইন্টারঅ্যাকশন বিশ্লেষণ',
    body: 'বেনামী ব্যবহার পরিসংখ্যান চালু থাকলে VeInvite সীমিত কিছু কাজও নথিভুক্ত করতে পারে, যেমন ওয়ালেট সংযোগ শুরু, ওয়ালেট যাচাই সফল বা ব্যর্থ হওয়া, আমন্ত্রণ লিংক কপি বা শেয়ার করা, আমন্ত্রণ গ্রহণের ফল, মিশন লিংক খোলা এবং পুরস্কার দাবি করার ফল। এসব ইভেন্ট একই দৈনিক বেনামী ব্রাউজার ID ব্যবহার করে এবং শুধু অ্যাপের অংশ, নির্বাচিত ভাষা, সাধারণ ডিভাইস শ্রেণি, উৎস শ্রেণি ও অ্যাপ বিল্ডের মতো সীমিত তথ্য রাখে। এতে ওয়ালেট ঠিকানা, আমন্ত্রণ বা রেফারেল কোড, সম্পূর্ণ URL, কুয়েরি স্ট্রিং বা মুক্ত-রূপ মেটাডেটা থাকে না। কাঁচা ইভেন্ট সর্বোচ্চ ৩০ দিন রাখা হয়, তারপর কেবল পরিচয়বিহীন সমষ্টিগত সংখ্যা থাকে। এই বিশ্লেষণ রেফারেল, মিশন সম্পন্ন, যোগ্যতা, Sybil অবস্থা বা পুরস্কার নির্ধারণ করে না।',
  },
  pt: {
    updated: 'Última atualização: 5 de setembro de 2026',
    heading: 'Análise anónima de interações com o produto',
    body: 'Quando a análise de uso anónima está ativada, o VeInvite também pode registar um conjunto limitado de ações, como iniciar a ligação de uma carteira, sucesso ou falha na verificação da carteira, copiar ou partilhar um link de convite, resultado da aceitação de um convite, abrir um link de missão e resultado de um pedido de recompensa. Estes eventos usam o mesmo ID anónimo diário do navegador e apenas contexto geral, como secção da app, idioma, categoria do dispositivo, categoria de origem e build da app. Não incluem endereços de carteira, códigos de convite ou referral, URLs completos, query strings nem metadados livres. Os eventos brutos são mantidos até 30 dias; depois ficam apenas totais agregados sem identificadores. Esta análise nunca determina referrals, conclusão de missões, elegibilidade, estado Sybil ou recompensas.',
  },
  ru: {
    updated: 'Последнее обновление: 5 сентября 2026 г.',
    heading: 'Анонимная аналитика действий в приложении',
    body: 'Если анонимная аналитика использования включена, VeInvite может также фиксировать ограниченный набор действий: начало подключения кошелька, успех или ошибку его проверки, копирование или отправку ссылки-приглашения, результат принятия приглашения, открытие ссылки на задание и результат запроса награды. Эти события используют тот же ежедневный анонимный ID браузера и только общие данные: раздел приложения, язык, категорию устройства, категорию источника и сборку приложения. Они не содержат адресов кошельков, кодов приглашения или referral, полных URL, строк запросов или произвольных метаданных. Сырые события хранятся не более 30 дней, затем остаются только агрегированные итоги без идентификаторов. Эта аналитика не определяет referral-связи, выполнение заданий, право участия, Sybil-статус или награды.',
  },
  id: {
    updated: 'Terakhir diperbarui: 5 September 2026',
    heading: 'Analitik interaksi produk anonim',
    body: 'Saat analitik penggunaan anonim diaktifkan, VeInvite juga dapat mencatat sejumlah terbatas tindakan seperti mulai menghubungkan dompet, keberhasilan atau kegagalan verifikasi dompet, menyalin atau membagikan tautan undangan, hasil penerimaan undangan, membuka tautan misi, dan hasil klaim hadiah. Peristiwa ini memakai ID browser anonim harian yang sama dan hanya konteks umum seperti bagian aplikasi, bahasa, kategori perangkat, kategori sumber, dan build aplikasi. Data tidak memuat alamat dompet, kode undangan atau referral, URL lengkap, query string, atau metadata bebas. Peristiwa mentah disimpan maksimal 30 hari, lalu hanya total agregat tanpa pengenal yang tersisa. Analitik ini tidak pernah menentukan referral, penyelesaian misi, kelayakan, status Sybil, atau hadiah.',
  },
  vi: {
    updated: 'Cập nhật lần cuối: 5 tháng 9, 2026',
    heading: 'Phân tích tương tác sản phẩm ẩn danh',
    body: 'Khi bật thống kê sử dụng ẩn danh, VeInvite cũng có thể ghi nhận một số hành động giới hạn như bắt đầu kết nối ví, kết quả xác minh ví, sao chép hoặc chia sẻ liên kết mời, kết quả chấp nhận lời mời, mở liên kết nhiệm vụ và kết quả yêu cầu phần thưởng. Các sự kiện này dùng cùng ID trình duyệt ẩn danh theo ngày và chỉ kèm thông tin khái quát như khu vực ứng dụng, ngôn ngữ, loại thiết bị, loại nguồn truy cập và bản build ứng dụng. Không có địa chỉ ví, mã mời hoặc giới thiệu, URL đầy đủ, chuỗi truy vấn hay metadata tự do. Sự kiện thô chỉ được lưu tối đa 30 ngày, sau đó chỉ còn số liệu tổng hợp không chứa định danh. Phân tích này không bao giờ quyết định quan hệ giới thiệu, hoàn thành nhiệm vụ, điều kiện tham gia, trạng thái Sybil hay phần thưởng.',
  },
  'zh-tw': {
    updated: '最後更新：2026年9月5日',
    heading: '匿名產品互動統計',
    body: '啟用匿名使用統計後，VeInvite 也可能記錄少量產品操作，例如開始連接錢包、錢包驗證成功或失敗、複製或分享邀請連結、接受邀請的結果、開啟任務連結，以及領取獎勵的結果。這些事件使用同一個每日匿名瀏覽器 ID，且只附帶應用程式頁面、所選語言、大致裝置類別、來源類別與應用程式版本等概略資訊。不會包含錢包地址、邀請或推薦碼、完整 URL、查詢字串或自由格式 metadata。原始產品事件最多保留 30 天，之後只保留不含識別碼的彙總數字。這些統計絕不會用來決定推薦關係、任務完成、參與資格、Sybil 狀態或獎勵。',
  },
  sv: {
    updated: 'Senast uppdaterad: 5 september 2026',
    heading: 'Anonym analys av produktinteraktioner',
    body: 'När anonym användningsanalys är aktiverad kan VeInvite även registrera ett begränsat antal handlingar, till exempel att en plånboksanslutning startas, om plånboksverifiering lyckas eller misslyckas, att en inbjudningslänk kopieras eller delas, resultatet av att acceptera en inbjudan, att en uppdragslänk öppnas och resultatet av ett belöningsanspråk. Händelserna använder samma dagliga anonyma webbläsar-ID och endast grov kontext som appsektion, språk, enhetskategori, källkategori och appversion. De innehåller inte plånboksadresser, inbjudnings- eller referral-koder, fullständiga URL:er, frågesträngar eller fri metadata. Råa händelser sparas i högst 30 dagar; därefter återstår endast aggregerade totalsiffror utan identifierare. Analysen avgör aldrig referral, slutförda uppdrag, behörighet, Sybil-status eller belöningar.',
  },
  ro: {
    updated: 'Ultima actualizare: 5 septembrie 2026',
    heading: 'Analiză anonimă a interacțiunilor cu produsul',
    body: 'Când analiza anonimă a utilizării este activată, VeInvite poate înregistra și un set limitat de acțiuni, precum începerea conectării unui portofel, succesul sau eșecul verificării lui, copierea sau distribuirea unui link de invitație, rezultatul acceptării invitației, deschiderea unui link de misiune și rezultatul solicitării unei recompense. Evenimentele folosesc același ID anonim zilnic al browserului și numai context general, precum secțiunea aplicației, limba, categoria dispozitivului, categoria sursei și build-ul aplicației. Nu includ adrese de portofel, coduri de invitație sau referral, URL-uri complete, query string-uri sau metadate libere. Evenimentele brute sunt păstrate cel mult 30 de zile, apoi rămân doar totaluri agregate fără identificatori. Analiza nu stabilește niciodată referral-uri, finalizarea misiunilor, eligibilitatea, statutul Sybil sau recompensele.',
  },
  ur: {
    updated: 'آخری اپ ڈیٹ: 5 ستمبر 2026',
    heading: 'گمنام پروڈکٹ تعامل کے اعداد و شمار',
    body: 'جب گمنام استعمال کے اعداد و شمار فعال ہوں تو VeInvite محدود پروڈکٹ کارروائیاں بھی ریکارڈ کر سکتا ہے، مثلاً والیٹ کنکشن شروع کرنا، والیٹ تصدیق کی کامیابی یا ناکامی، دعوتی لنک کاپی یا شیئر کرنا، دعوت قبول کرنے کا نتیجہ، مشن لنک کھولنا اور انعام کلیم کا نتیجہ۔ یہ ایونٹس وہی روزانہ گمنام براؤزر ID استعمال کرتے ہیں اور صرف عمومی سیاق جیسے ایپ سیکشن، منتخب زبان، ڈیوائس کی عمومی قسم، ذریعہ اور ایپ build رکھتے ہیں۔ ان میں والیٹ ایڈریس، دعوت یا referral کوڈ، مکمل URL، query string یا آزاد metadata شامل نہیں ہوتا۔ خام ایونٹس زیادہ سے زیادہ 30 دن رکھے جاتے ہیں، پھر صرف بغیر شناخت کے مجموعی اعداد باقی رہتے ہیں۔ یہ تجزیات referral، مشن مکمل ہونے، اہلیت، Sybil حیثیت یا انعامات کا فیصلہ نہیں کرتے۔',
  },
  pcm: {
    updated: 'Last update: 5 September 2026',
    heading: 'Anonymous product interaction analytics',
    body: 'If anonymous usage analytics dey on, VeInvite fit record small set of actions like when wallet connection start, wallet verification succeed or fail, when invite link copy or share, invite acceptance result, mission link open, and reward claim result. Dem use the same daily anonymous browser ID and only broad info like app section, language, device category, source category and app build. E no contain wallet address, invite or referral code, full URL, query string or free-form metadata. Raw events dey stay up to 30 days, after that na only aggregate totals without identifiers remain. This analytics no dey decide referral, mission completion, eligibility, Sybil status or reward.',
  },
  arz: {
    updated: 'آخر تحديث: 5 سبتمبر 2026',
    heading: 'تحليلات مجهولة لتفاعل المستخدم مع التطبيق',
    body: 'لما إحصاءات الاستخدام المجهولة تكون شغالة، VeInvite ممكن يسجل شوية أفعال محدودة زي بداية توصيل المحفظة، نجاح أو فشل التحقق منها، نسخ أو مشاركة لينك الدعوة، نتيجة قبول الدعوة، فتح لينك مهمة ونتيجة طلب المكافأة. الأحداث دي بتستخدم نفس ID المتصفح المجهول اليومي ومعاها بس معلومات عامة زي جزء التطبيق واللغة ونوع الجهاز ومصدر الزيارة ونسخة التطبيق. مفيهاش عنوان محفظة ولا كود دعوة أو referral ولا URL كامل ولا query string ولا metadata حرة. الأحداث الخام بتتخزن لحد 30 يوم وبعد كده بيفضل بس إجماليات مجمعة من غير معرّفات. التحليلات دي مش بتحدد referral ولا إكمال مهمة ولا أهلية ولا حالة Sybil ولا مكافآت.',
  },
  mr: {
    updated: 'शेवटचे अपडेट: 5 सप्टेंबर 2026',
    heading: 'निनावी उत्पादन परस्परसंवाद विश्लेषण',
    body: 'निनावी वापर विश्लेषण सुरू असल्यास VeInvite काही मर्यादित कृती नोंदवू शकते, जसे वॉलेट कनेक्शन सुरू करणे, वॉलेट पडताळणी यशस्वी किंवा अयशस्वी होणे, आमंत्रण लिंक कॉपी किंवा शेअर करणे, आमंत्रण स्वीकारण्याचा निकाल, मिशन लिंक उघडणे आणि रिवॉर्ड क्लेमचा निकाल. या इव्हेंटसाठी तोच दररोजचा निनावी ब्राउझर ID आणि फक्त अॅप विभाग, भाषा, डिव्हाइस श्रेणी, स्रोत श्रेणी व अॅप build यांसारखी सामान्य माहिती वापरली जाते. वॉलेट पत्ता, आमंत्रण किंवा referral कोड, पूर्ण URL, query string किंवा मुक्त metadata यात नसते. कच्चे इव्हेंट जास्तीत जास्त 30 दिवस ठेवले जातात; त्यानंतर फक्त ओळखरहित एकत्रित संख्या राहतात. हे विश्लेषण referral, मिशन पूर्णता, पात्रता, Sybil स्थिती किंवा रिवॉर्ड ठरवत नाही.',
  },
  te: {
    updated: 'చివరి నవీకరణ: 5 సెప్టెంబర్ 2026',
    heading: 'అనామక ప్రొడక్ట్ ఇంటరాక్షన్ విశ్లేషణ',
    body: 'అనామక వినియోగ విశ్లేషణ ఆన్‌లో ఉన్నప్పుడు VeInvite కొన్ని పరిమిత చర్యలను కూడా నమోదు చేయవచ్చు: వాలెట్ కనెక్షన్ ప్రారంభించడం, వాలెట్ ధృవీకరణ విజయవంతం లేదా విఫలం కావడం, ఆహ్వాన లింక్ కాపీ లేదా షేర్ చేయడం, ఆహ్వానం అంగీకరించిన ఫలితం, మిషన్ లింక్ తెరవడం, రివార్డ్ క్లెయిమ్ ఫలితం. ఈ ఈవెంట్‌లు అదే రోజువారీ అనామక బ్రౌజర్ IDను ఉపయోగిస్తాయి మరియు యాప్ విభాగం, భాష, పరికర వర్గం, మూల వర్గం, యాప్ build వంటి సాధారణ సమాచారాన్ని మాత్రమే ఉంచుతాయి. వాలెట్ అడ్రస్, ఆహ్వాన లేదా referral కోడ్, పూర్తి URL, query string లేదా స్వేచ్ఛా metadata ఉండదు. ముడి ఈవెంట్‌లు గరిష్ఠంగా 30 రోజులు మాత్రమే ఉంచబడతాయి; తర్వాత గుర్తింపు లేని సమగ్ర సంఖ్యలు మాత్రమే మిగులుతాయి. ఇవి referral, మిషన్ పూర్తి, అర్హత, Sybil స్థితి లేదా రివార్డ్‌ను నిర్ణయించవు.',
  },
  sw: {
    updated: 'Ilisasishwa mwisho: 5 Septemba 2026',
    heading: 'Uchanganuzi wa mwingiliano wa bidhaa usiotambulisha mtu',
    body: 'Uchanganuzi wa matumizi usiotambulisha mtu ukiwashwa, VeInvite inaweza pia kurekodi vitendo vichache vilivyowekwa wazi, kama kuanza kuunganisha pochi, mafanikio au kushindwa kwa uthibitishaji wa pochi, kunakili au kushiriki kiungo cha mwaliko, matokeo ya kukubali mwaliko, kufungua kiungo cha kazi na matokeo ya kudai zawadi. Matukio haya hutumia ID ileile ya kila siku ya kivinjari isiyotambulisha mtu na muktadha wa jumla tu kama sehemu ya programu, lugha, aina ya kifaa, aina ya chanzo na build ya programu. Hayana anwani ya pochi, msimbo wa mwaliko au referral, URL kamili, query string au metadata huru. Matukio ghafi huhifadhiwa hadi siku 30, kisha hubaki jumla zilizokusanywa zisizo na vitambulishi. Uchanganuzi huu hauamui referral, kukamilika kwa kazi, ustahiki, hali ya Sybil au zawadi.',
  },
  ha: {
    updated: 'Sabuntawa na ƙarshe: 5 Satumba 2026',
    heading: 'Nazarin hulɗar samfur ba tare da bayyana mutum ba',
    body: 'Idan an kunna nazarin amfani marar bayyana mutum, VeInvite na iya rubuta wasu takaitattun ayyuka kamar fara haɗa wallet, nasara ko gazawar tabbatar da wallet, kwafa ko raba hanyar gayyata, sakamakon karɓar gayyata, buɗe hanyar aikin mission da sakamakon neman reward. Waɗannan events suna amfani da ID ɗin browser marar suna na kowace rana da kuma bayanai na gaba ɗaya kawai kamar sashen app, harshe, nau’in na’ura, nau’in tushen ziyara da app build. Ba sa ɗauke da adireshin wallet, lambar gayyata ko referral, cikakken URL, query string ko metadata na kyauta. Ana ajiye raw events har zuwa kwanaki 30, daga nan sai jimillar bayanai marasa identifiers kawai su rage. Wannan nazarin ba ya yanke hukunci kan referral, kammala mission, cancanta, matsayin Sybil ko reward.',
  },
};
