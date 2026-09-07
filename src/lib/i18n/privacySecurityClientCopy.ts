import type { SupportedLocale } from './locales';

export type PrivacySecurityClientCopy = {
  updated: string;
  heading: string;
  body: string;
};

export const PRIVACY_SECURITY_CLIENT_COPY: Record<
  SupportedLocale,
  PrivacySecurityClientCopy
> = {
  en: {
    updated: 'Last updated: September 7, 2026',
    heading: 'Security and reward-abuse prevention',
    body: 'During a verified wallet session, VeInvite may use a random pseudonymous Security Client identifier in an HttpOnly browser cookie and store its SHA-256 hash with verified wallet relationships. This is separate from anonymous usage analytics and is used only for security, fraud, and reward-abuse review. This Security Client feature does not collect phone numbers, IMEI, advertising IDs, hardware serials, IP addresses, or browser-fingerprint components. A shared Security Client is only a review signal, not automatic proof of abuse. Technical Security Client relationships are normally deleted 365 days after that client was created; evidence needed for an unresolved review may be kept until the review is resolved. Final eligibility, security-decision, reward, and audit records may be retained longer where reasonably necessary.',
  },
  ko: {
    updated: '최종 업데이트: 2026년 9월 7일',
    heading: '보안 및 보상 부정 이용 방지',
    body: '검증된 지갑 세션이 활성화된 동안 VeInvite는 HttpOnly 브라우저 쿠키에 무작위 가명 Security Client 식별자를 사용하고, 서버에는 그 식별자의 SHA-256 해시와 검증된 지갑의 연결 관계를 저장할 수 있습니다. 이 정보는 익명 이용 통계와 분리되며 보안, 부정 이용 및 보상 악용 검토에만 사용됩니다. 이 Security Client 기능을 위해 전화번호, IMEI, 광고 ID, 하드웨어 일련번호, IP 주소 또는 브라우저 핑거프린트 구성요소를 수집하지 않습니다. 같은 Security Client가 확인되는 것은 검토 신호일 뿐 부정 이용의 자동 확정 근거가 아닙니다. 기술적인 Security Client 연결 관계는 원칙적으로 해당 Client가 생성된 날부터 365일 후 삭제하며, 아직 해결되지 않은 보안 검토에 필요한 증거는 검토가 끝날 때까지 보관할 수 있습니다. 최종 참여 자격, 보안 판정, 보상 및 감사 기록은 합리적으로 필요한 경우 더 오래 보관될 수 있습니다.',
  },
  zh: {
    updated: '最后更新：2026年9月7日',
    heading: '安全与奖励滥用防护',
    body: '在已验证的钱包会话期间，VeInvite 可能在 HttpOnly 浏览器 Cookie 中使用随机的假名化 Security Client 标识符，并在服务器上保存该标识符的 SHA-256 哈希及其与已验证钱包的关联关系。该信息与匿名使用统计分开，仅用于安全、欺诈和奖励滥用审核。此 Security Client 功能不会收集电话号码、IMEI、广告 ID、硬件序列号、IP 地址或浏览器指纹组成信息。共享同一 Security Client 仅作为审核信号，并不会自动证明存在滥用。技术性的 Security Client 关联通常会在该 Client 创建 365 天后删除；未解决的安全审核所需证据可保留至审核结束。最终资格、安全判定、奖励和审计记录在合理必要时可保留更长时间。',
  },
  hi: {
    updated: 'अंतिम अपडेट: 7 सितंबर 2026',
    heading: 'सुरक्षा और रिवॉर्ड दुरुपयोग की रोकथाम',
    body: 'सत्यापित वॉलेट सेशन के दौरान VeInvite HttpOnly ब्राउज़र कुकी में एक यादृच्छिक, छद्मनाम Security Client पहचानकर्ता का उपयोग कर सकता है और सर्वर पर उसका SHA-256 हैश सत्यापित वॉलेट संबंधों के साथ सहेज सकता है। यह गुमनाम उपयोग आँकड़ों से अलग है और केवल सुरक्षा, धोखाधड़ी तथा रिवॉर्ड दुरुपयोग की समीक्षा के लिए उपयोग होता है। इस Security Client सुविधा के लिए फोन नंबर, IMEI, विज्ञापन ID, हार्डवेयर सीरियल, IP पता या ब्राउज़र-फिंगरप्रिंट घटक एकत्र नहीं किए जाते। एक ही Security Client साझा होना केवल समीक्षा संकेत है, दुरुपयोग का स्वतः प्रमाण नहीं। तकनीकी Security Client संबंध सामान्यतः Client बनने के 365 दिन बाद हटा दिए जाते हैं; लंबित सुरक्षा समीक्षा के लिए आवश्यक साक्ष्य समीक्षा पूरी होने तक रखे जा सकते हैं। अंतिम पात्रता, सुरक्षा निर्णय, रिवॉर्ड और ऑडिट रिकॉर्ड उचित आवश्यकता होने पर अधिक समय तक रखे जा सकते हैं।',
  },
  es: {
    updated: 'Última actualización: 7 de septiembre de 2026',
    heading: 'Seguridad y prevención del abuso de recompensas',
    body: 'Durante una sesión de cartera verificada, VeInvite puede usar un identificador Security Client aleatorio y seudónimo en una cookie HttpOnly del navegador y guardar en el servidor su hash SHA-256 junto con las relaciones de carteras verificadas. Esta información se mantiene separada de las estadísticas de uso anónimas y se utiliza únicamente para revisar seguridad, fraude y abuso de recompensas. Esta función no recopila números de teléfono, IMEI, identificadores publicitarios, números de serie de hardware, direcciones IP ni componentes de huella digital del navegador. Compartir un mismo Security Client es solo una señal para revisión, no una prueba automática de abuso. Las relaciones técnicas de Security Client se eliminan normalmente 365 días después de la creación del Client; la evidencia necesaria para una revisión de seguridad pendiente puede conservarse hasta que se resuelva. Los registros finales de elegibilidad, decisiones de seguridad, recompensas y auditoría pueden conservarse durante más tiempo cuando sea razonablemente necesario.',
  },
  ja: {
    updated: '最終更新日：2026年9月7日',
    heading: 'セキュリティと報酬の不正利用防止',
    body: '認証済みウォレットのセッション中、VeInvite は HttpOnly のブラウザ Cookie にランダムな仮名化 Security Client 識別子を使用し、その SHA-256 ハッシュと認証済みウォレットとの関連をサーバーに保存する場合があります。これは匿名の利用統計とは分離され、セキュリティ、不正行為、報酬の悪用確認にのみ使用されます。この Security Client 機能では、電話番号、IMEI、広告 ID、ハードウェアのシリアル番号、IP アドレス、ブラウザフィンガープリントの構成情報は収集しません。同じ Security Client の共有は審査のためのシグナルにすぎず、不正利用を自動的に確定する証拠ではありません。技術的な Security Client の関連情報は通常、その Client の作成から365日後に削除されます。未解決のセキュリティ審査に必要な証拠は、審査が完了するまで保持される場合があります。最終的な参加資格、セキュリティ判定、報酬、監査記録は、合理的に必要な場合はより長く保持されることがあります。',
  },
  it: {
    updated: 'Ultimo aggiornamento: 7 settembre 2026',
    heading: 'Sicurezza e prevenzione degli abusi sui premi',
    body: 'Durante una sessione wallet verificata, VeInvite può usare un identificatore Security Client casuale e pseudonimo in un cookie HttpOnly del browser e conservarne sul server l’hash SHA-256 insieme alle relazioni tra wallet verificati. Questi dati sono separati dalle statistiche d’uso anonime e vengono utilizzati solo per verifiche di sicurezza, frode e abuso dei premi. Questa funzione Security Client non raccoglie numeri di telefono, IMEI, ID pubblicitari, numeri di serie hardware, indirizzi IP o componenti di fingerprint del browser. La condivisione dello stesso Security Client è solo un segnale di revisione, non una prova automatica di abuso. Le relazioni tecniche Security Client vengono normalmente eliminate 365 giorni dopo la creazione del Client; le prove necessarie per una verifica di sicurezza ancora aperta possono essere conservate fino alla sua conclusione. I record finali di idoneità, decisioni di sicurezza, premi e audit possono essere conservati più a lungo quando ragionevolmente necessario.',
  },
  tr: {
    updated: 'Son güncelleme: 7 Eylül 2026',
    heading: 'Güvenlik ve ödül kötüye kullanımını önleme',
    body: 'Doğrulanmış bir cüzdan oturumu sırasında VeInvite, HttpOnly tarayıcı çerezinde rastgele ve takma adlı bir Security Client tanımlayıcısı kullanabilir ve sunucuda bu tanımlayıcının SHA-256 özetini doğrulanmış cüzdan ilişkileriyle birlikte saklayabilir. Bu bilgi anonim kullanım analizinden ayrı tutulur ve yalnızca güvenlik, dolandırıcılık ve ödül kötüye kullanımı incelemelerinde kullanılır. Bu Security Client özelliği telefon numarası, IMEI, reklam kimliği, donanım seri numarası, IP adresi veya tarayıcı parmak izi bileşenleri toplamaz. Aynı Security Client’ın paylaşılması yalnızca inceleme sinyalidir; kötüye kullanımın otomatik kanıtı değildir. Teknik Security Client ilişkileri normalde Client oluşturulduktan 365 gün sonra silinir; çözülmemiş bir güvenlik incelemesi için gereken kanıtlar inceleme sonuçlanana kadar tutulabilir. Nihai uygunluk, güvenlik kararı, ödül ve denetim kayıtları makul ölçüde gerekli olduğunda daha uzun süre saklanabilir.',
  },
  nl: {
    updated: 'Laatst bijgewerkt: 7 september 2026',
    heading: 'Beveiliging en voorkoming van beloningsmisbruik',
    body: 'Tijdens een geverifieerde walletsessie kan VeInvite een willekeurige, gepseudonimiseerde Security Client-ID in een HttpOnly-browsercookie gebruiken en op de server de SHA-256-hash daarvan samen met relaties tussen geverifieerde wallets opslaan. Dit staat los van anonieme gebruiksstatistieken en wordt alleen gebruikt voor onderzoek naar beveiliging, fraude en misbruik van beloningen. Deze Security Client-functie verzamelt geen telefoonnummers, IMEI, advertentie-ID’s, hardware-serienummers, IP-adressen of onderdelen van browserfingerprinting. Het delen van één Security Client is slechts een signaal voor beoordeling en geen automatisch bewijs van misbruik. Technische Security Client-relaties worden normaal 365 dagen na het aanmaken van die Client verwijderd; bewijs dat nodig is voor een nog openstaande beveiligingsbeoordeling kan tot de afronding daarvan worden bewaard. Definitieve geschiktheids-, beveiligingsbesluit-, belonings- en auditgegevens kunnen langer worden bewaard wanneer dat redelijkerwijs nodig is.',
  },
  de: {
    updated: 'Zuletzt aktualisiert: 7. September 2026',
    heading: 'Sicherheit und Schutz vor Belohnungsmissbrauch',
    body: 'Während einer verifizierten Wallet-Sitzung kann VeInvite eine zufällige, pseudonyme Security-Client-Kennung in einem HttpOnly-Browser-Cookie verwenden und serverseitig deren SHA-256-Hash zusammen mit Beziehungen zu verifizierten Wallets speichern. Diese Informationen werden getrennt von anonymen Nutzungsstatistiken geführt und ausschließlich für Sicherheits-, Betrugs- und Belohnungsmissbrauchsprüfungen verwendet. Für diese Security-Client-Funktion werden keine Telefonnummern, IMEI, Werbe-IDs, Hardware-Seriennummern, IP-Adressen oder Browser-Fingerprint-Komponenten erhoben. Ein gemeinsam genutzter Security Client ist lediglich ein Prüfsignal und kein automatischer Nachweis für Missbrauch. Technische Security-Client-Beziehungen werden normalerweise 365 Tage nach Erstellung des Clients gelöscht; für eine noch offene Sicherheitsprüfung benötigte Nachweise können bis zu deren Abschluss aufbewahrt werden. Endgültige Berechtigungs-, Sicherheitsentscheidungs-, Belohnungs- und Auditaufzeichnungen können bei vernünftiger Notwendigkeit länger aufbewahrt werden.',
  },
  fr: {
    updated: 'Dernière mise à jour : 7 septembre 2026',
    heading: 'Sécurité et prévention des abus de récompenses',
    body: 'Pendant une session de portefeuille vérifiée, VeInvite peut utiliser un identifiant Security Client aléatoire et pseudonyme dans un cookie HttpOnly du navigateur et conserver sur le serveur son hachage SHA-256 avec les relations entre portefeuilles vérifiés. Ces informations sont séparées des statistiques d’utilisation anonymes et servent uniquement aux contrôles de sécurité, de fraude et d’abus de récompenses. Cette fonction Security Client ne collecte ni numéro de téléphone, ni IMEI, ni identifiant publicitaire, ni numéro de série matériel, ni adresse IP, ni composant d’empreinte du navigateur. Le partage d’un même Security Client constitue seulement un signal de contrôle et non une preuve automatique d’abus. Les relations techniques Security Client sont normalement supprimées 365 jours après la création du Client ; les preuves nécessaires à un contrôle de sécurité non résolu peuvent être conservées jusqu’à sa résolution. Les registres finaux d’éligibilité, de décisions de sécurité, de récompenses et d’audit peuvent être conservés plus longtemps lorsque cela est raisonnablement nécessaire.',
  },
  ar: {
    updated: 'آخر تحديث: 7 سبتمبر 2026',
    heading: 'الأمان ومنع إساءة استخدام المكافآت',
    body: 'أثناء جلسة محفظة موثقة، قد يستخدم VeInvite معرّف Security Client عشوائيًا ومستعارًا داخل ملف تعريف ارتباط HttpOnly في المتصفح، ويخزن على الخادم تجزئة SHA-256 لهذا المعرّف مع علاقاته بالمحافظ الموثقة. تُفصل هذه المعلومات عن إحصاءات الاستخدام المجهولة وتُستخدم فقط لمراجعات الأمان والاحتيال وإساءة استخدام المكافآت. لا تجمع ميزة Security Client هذه أرقام الهواتف أو IMEI أو معرّفات الإعلانات أو الأرقام التسلسلية للأجهزة أو عناوين IP أو مكونات بصمة المتصفح. اشتراك أكثر من محفظة في Security Client واحد هو مجرد إشارة للمراجعة وليس دليلًا تلقائيًا على إساءة الاستخدام. تُحذف علاقات Security Client التقنية عادةً بعد 365 يومًا من إنشاء Client، بينما قد يُحتفظ بالأدلة اللازمة لمراجعة أمنية غير محسومة حتى انتهاء المراجعة. ويمكن الاحتفاظ بسجلات الأهلية النهائية وقرارات الأمان والمكافآت والتدقيق مدة أطول عند الحاجة المعقولة.',
  },
  bn: {
    updated: 'সর্বশেষ হালনাগাদ: ৭ সেপ্টেম্বর ২০২৬',
    heading: 'নিরাপত্তা ও পুরস্কার অপব্যবহার প্রতিরোধ',
    body: 'যাচাইকৃত ওয়ালেট সেশনের সময় VeInvite ব্রাউজারের HttpOnly কুকিতে একটি এলোমেলো ছদ্মনাম Security Client শনাক্তকারী ব্যবহার করতে পারে এবং সার্ভারে সেই শনাক্তকারীর SHA-256 হ্যাশ যাচাইকৃত ওয়ালেট-সম্পর্কের সঙ্গে সংরক্ষণ করতে পারে। এটি বেনামী ব্যবহার পরিসংখ্যান থেকে আলাদা এবং কেবল নিরাপত্তা, জালিয়াতি ও পুরস্কার অপব্যবহার পর্যালোচনায় ব্যবহৃত হয়। এই Security Client সুবিধার জন্য ফোন নম্বর, IMEI, বিজ্ঞাপন ID, হার্ডওয়্যার সিরিয়াল, IP ঠিকানা বা ব্রাউজার-ফিঙ্গারপ্রিন্ট উপাদান সংগ্রহ করা হয় না। একই Security Client ভাগ করা কেবল পর্যালোচনার সংকেত, অপব্যবহারের স্বয়ংক্রিয় প্রমাণ নয়। প্রযুক্তিগত Security Client সম্পর্ক সাধারণত Client তৈরির ৩৬৫ দিন পর মুছে ফেলা হয়; অসম্পূর্ণ নিরাপত্তা পর্যালোচনার জন্য দরকারি প্রমাণ পর্যালোচনা শেষ হওয়া পর্যন্ত রাখা যেতে পারে। চূড়ান্ত যোগ্যতা, নিরাপত্তা সিদ্ধান্ত, পুরস্কার ও অডিট রেকর্ড যুক্তিসঙ্গত প্রয়োজনে আরও দীর্ঘ সময় রাখা যেতে পারে।',
  },
  pt: {
    updated: 'Última atualização: 7 de setembro de 2026',
    heading: 'Segurança e prevenção de abuso de recompensas',
    body: 'Durante uma sessão de carteira verificada, o VeInvite pode usar um identificador Security Client aleatório e pseudônimo em um cookie HttpOnly do navegador e armazenar no servidor o hash SHA-256 desse identificador junto com relações entre carteiras verificadas. Essas informações ficam separadas das estatísticas de uso anônimas e são usadas apenas para análises de segurança, fraude e abuso de recompensas. Esse recurso Security Client não coleta números de telefone, IMEI, IDs de publicidade, números de série de hardware, endereços IP nem componentes de impressão digital do navegador. Compartilhar o mesmo Security Client é apenas um sinal para revisão, não uma prova automática de abuso. As relações técnicas do Security Client são normalmente excluídas 365 dias após a criação do Client; evidências necessárias para uma revisão de segurança ainda não resolvida podem ser mantidas até a conclusão da revisão. Registros finais de elegibilidade, decisões de segurança, recompensas e auditoria podem ser mantidos por mais tempo quando razoavelmente necessário.',
  },
  ru: {
    updated: 'Последнее обновление: 7 сентября 2026 г.',
    heading: 'Безопасность и предотвращение злоупотреблений наградами',
    body: 'Во время подтвержденной сессии кошелька VeInvite может использовать случайный псевдонимный идентификатор Security Client в HttpOnly-cookie браузера и хранить на сервере его SHA-256-хэш вместе со связями подтвержденных кошельков. Эти данные отделены от анонимной статистики использования и применяются только для проверок безопасности, мошенничества и злоупотреблений наградами. Эта функция Security Client не собирает номера телефонов, IMEI, рекламные идентификаторы, серийные номера оборудования, IP-адреса или компоненты браузерного отпечатка. Общий Security Client является лишь сигналом для проверки, а не автоматическим доказательством злоупотребления. Технические связи Security Client обычно удаляются через 365 дней после создания Client; доказательства, необходимые для незавершенной проверки безопасности, могут храниться до ее завершения. Итоговые записи о праве на участие, решениях безопасности, наградах и аудите могут храниться дольше, когда это обоснованно необходимо.',
  },
  id: {
    updated: 'Terakhir diperbarui: 7 September 2026',
    heading: 'Keamanan dan pencegahan penyalahgunaan hadiah',
    body: 'Selama sesi dompet terverifikasi, VeInvite dapat menggunakan pengenal Security Client acak dan pseudonim dalam cookie HttpOnly browser serta menyimpan hash SHA-256 pengenal tersebut di server bersama hubungan dompet yang telah diverifikasi. Informasi ini dipisahkan dari statistik penggunaan anonim dan hanya digunakan untuk peninjauan keamanan, penipuan, dan penyalahgunaan hadiah. Fitur Security Client ini tidak mengumpulkan nomor telepon, IMEI, ID iklan, nomor seri perangkat keras, alamat IP, atau komponen sidik jari browser. Berbagi Security Client yang sama hanyalah sinyal untuk ditinjau, bukan bukti otomatis adanya penyalahgunaan. Hubungan teknis Security Client biasanya dihapus 365 hari setelah Client dibuat; bukti yang diperlukan untuk peninjauan keamanan yang belum selesai dapat disimpan sampai peninjauan tersebut diselesaikan. Catatan akhir tentang kelayakan, keputusan keamanan, hadiah, dan audit dapat disimpan lebih lama bila secara wajar diperlukan.',
  },
  vi: {
    updated: 'Cập nhật lần cuối: 7 tháng 9, 2026',
    heading: 'Bảo mật và ngăn chặn lạm dụng phần thưởng',
    body: 'Trong phiên ví đã được xác minh, VeInvite có thể sử dụng một mã Security Client ngẫu nhiên, được đặt dưới dạng bí danh trong cookie HttpOnly của trình duyệt và lưu trên máy chủ giá trị băm SHA-256 của mã đó cùng với mối liên hệ giữa các ví đã xác minh. Dữ liệu này được tách biệt khỏi thống kê sử dụng ẩn danh và chỉ dùng để xem xét bảo mật, gian lận và hành vi lạm dụng phần thưởng. Tính năng Security Client này không thu thập số điện thoại, IMEI, ID quảng cáo, số sê-ri phần cứng, địa chỉ IP hoặc thành phần dấu vân tay trình duyệt. Việc nhiều ví dùng chung một Security Client chỉ là tín hiệu để xem xét, không phải bằng chứng tự động về hành vi lạm dụng. Các mối liên hệ kỹ thuật của Security Client thường được xóa sau 365 ngày kể từ khi Client được tạo; bằng chứng cần thiết cho một cuộc xem xét bảo mật chưa kết thúc có thể được giữ cho đến khi việc xem xét hoàn tất. Hồ sơ cuối cùng về điều kiện tham gia, quyết định bảo mật, phần thưởng và kiểm toán có thể được lưu lâu hơn khi có lý do hợp lý.',
  },
  'zh-tw': {
    updated: '最後更新：2026年9月7日',
    heading: '安全與獎勵濫用防護',
    body: '在已驗證的錢包工作階段期間，VeInvite 可能在 HttpOnly 瀏覽器 Cookie 中使用隨機的假名化 Security Client 識別碼，並在伺服器保存該識別碼的 SHA-256 雜湊及其與已驗證錢包的關聯。這些資訊與匿名使用統計分開，僅用於安全、詐欺及獎勵濫用審查。此 Security Client 功能不會收集電話號碼、IMEI、廣告 ID、硬體序號、IP 位址或瀏覽器指紋組成資訊。共用同一 Security Client 只是一項審查訊號，不會自動視為濫用證據。技術性的 Security Client 關聯通常會在該 Client 建立 365 天後刪除；未完成的安全審查所需證據可保留至審查結束。最終資格、安全判定、獎勵及稽核紀錄在合理必要時可保留更久。',
  },
  sv: {
    updated: 'Senast uppdaterad: 7 september 2026',
    heading: 'Säkerhet och förebyggande av belöningsmissbruk',
    body: 'Under en verifierad plånbokssession kan VeInvite använda en slumpmässig, pseudonym Security Client-identifierare i en HttpOnly-cookie i webbläsaren och lagra dess SHA-256-hash på servern tillsammans med relationer mellan verifierade plånböcker. Informationen hålls åtskild från anonym användningsstatistik och används endast för granskning av säkerhet, bedrägeri och missbruk av belöningar. Funktionen samlar inte in telefonnummer, IMEI, annons-ID, serienummer för maskinvara, IP-adresser eller komponenter för webbläsarfingeravtryck. Att dela samma Security Client är endast en granskningssignal och inte automatiskt bevis på missbruk. Tekniska Security Client-relationer raderas normalt 365 dagar efter att Client skapades; bevis som behövs för en olöst säkerhetsgranskning kan behållas tills granskningen är avslutad. Slutliga uppgifter om behörighet, säkerhetsbeslut, belöningar och revision kan sparas längre när det rimligen behövs.',
  },
  ro: {
    updated: 'Ultima actualizare: 7 septembrie 2026',
    heading: 'Securitate și prevenirea abuzului de recompense',
    body: 'În timpul unei sesiuni de portofel verificate, VeInvite poate folosi un identificator Security Client aleatoriu și pseudonimizat într-un cookie HttpOnly al browserului și poate stoca pe server hash-ul SHA-256 al acestuia împreună cu relațiile dintre portofelele verificate. Aceste informații sunt separate de statisticile anonime de utilizare și sunt folosite doar pentru verificări de securitate, fraudă și abuz de recompense. Această funcție Security Client nu colectează numere de telefon, IMEI, ID-uri publicitare, numere de serie hardware, adrese IP sau componente de amprentare a browserului. Folosirea aceluiași Security Client este doar un semnal pentru analiză, nu o dovadă automată de abuz. Relațiile tehnice Security Client sunt șterse în mod normal la 365 de zile după crearea Clientului; dovezile necesare unei verificări de securitate nerezolvate pot fi păstrate până la soluționare. Înregistrările finale privind eligibilitatea, deciziile de securitate, recompensele și auditul pot fi păstrate mai mult timp atunci când este rezonabil necesar.',
  },
  ur: {
    updated: 'آخری تازہ کاری: 7 ستمبر 2026',
    heading: 'سیکیورٹی اور انعامات کے غلط استعمال کی روک تھام',
    body: 'تصدیق شدہ والیٹ سیشن کے دوران VeInvite براؤزر کی HttpOnly کوکی میں ایک بے ترتیب، فرضی نام والا Security Client شناخت کنندہ استعمال کر سکتا ہے اور سرور پر اس شناخت کنندہ کا SHA-256 ہیش تصدیق شدہ والیٹ روابط کے ساتھ محفوظ کر سکتا ہے۔ یہ معلومات گمنام استعمال کے اعداد و شمار سے الگ رکھی جاتی ہیں اور صرف سیکیورٹی، فراڈ اور انعامات کے غلط استعمال کی جانچ کے لیے استعمال ہوتی ہیں۔ اس Security Client فیچر کے لیے فون نمبر، IMEI، اشتہاری ID، ہارڈویئر سیریل نمبر، IP ایڈریس یا براؤزر فنگرپرنٹ اجزا جمع نہیں کیے جاتے۔ ایک ہی Security Client کا مشترک ہونا صرف جائزے کا اشارہ ہے، غلط استعمال کا خودکار ثبوت نہیں۔ تکنیکی Security Client روابط عام طور پر Client بننے کے 365 دن بعد حذف کر دیے جاتے ہیں؛ زیرِ التوا سیکیورٹی جائزے کے لیے ضروری ثبوت جائزہ مکمل ہونے تک رکھے جا سکتے ہیں۔ حتمی اہلیت، سیکیورٹی فیصلوں، انعامات اور آڈٹ کے ریکارڈ مناسب ضرورت کے مطابق زیادہ عرصے تک محفوظ رکھے جا سکتے ہیں۔',
  },
  pcm: {
    updated: 'Last update: 7 September 2026',
    heading: 'Security and reward abuse protection',
    body: 'When verified wallet session dey active, VeInvite fit put one random pseudonymous Security Client ID for HttpOnly browser cookie and keep only the SHA-256 hash for server together with verified wallet links. Dis one separate from anonymous usage statistics and na only for security, fraud and reward-abuse review. Dis Security Client feature no dey collect phone number, IMEI, advertising ID, hardware serial number, IP address or browser-fingerprint parts. If wallets share the same Security Client, na review signal only; e no mean say abuse don automatically confirm. Technical Security Client links normally go delete 365 days after the Client start; evidence wey an unresolved security review still need fit remain until the review finish. Final eligibility, security decision, reward and audit records fit stay longer when e reasonably necessary.',
  },
  arz: {
    updated: 'آخر تحديث: 7 سبتمبر 2026',
    heading: 'الأمان ومنع إساءة استخدام المكافآت',
    body: 'وقت ما جلسة المحفظة الموثقة تكون شغالة، VeInvite ممكن يستخدم معرّف Security Client عشوائي ومستعار جوه HttpOnly cookie في المتصفح، ويخزن على السيرفر SHA-256 hash للمعرّف مع علاقات المحافظ الموثقة. المعلومات دي منفصلة عن إحصائيات الاستخدام المجهولة وبتستخدم بس لمراجعة الأمان والاحتيال وإساءة استخدام المكافآت. ميزة Security Client دي ما بتجمعش رقم تليفون أو IMEI أو advertising ID أو serial number للهاردوير أو IP address أو مكونات browser fingerprint. مشاركة نفس Security Client مجرد إشارة للمراجعة، مش إثبات تلقائي على إساءة الاستخدام. علاقات Security Client التقنية بتتمسح عادة بعد 365 يوم من إنشاء الـClient؛ الدليل المطلوب لمراجعة أمنية لسه مفتوحة ممكن يفضل لحد ما المراجعة تخلص. سجلات الأهلية النهائية وقرارات الأمان والمكافآت والتدقيق ممكن تتخزن مدة أطول لما يكون ده ضروري بشكل معقول.',
  },
  mr: {
    updated: 'शेवटचे अद्यतन: 7 सप्टेंबर 2026',
    heading: 'सुरक्षा आणि रिवॉर्ड गैरवापर प्रतिबंध',
    body: 'सत्यापित वॉलेट सत्रादरम्यान VeInvite HttpOnly ब्राउझर कुकीमध्ये यादृच्छिक, छद्मनामी Security Client ओळख वापरू शकते आणि सर्व्हरवर त्या ओळखीचा SHA-256 हॅश सत्यापित वॉलेट संबंधांसह साठवू शकते. ही माहिती अनामिक वापर आकडेवारीपासून वेगळी ठेवली जाते आणि फक्त सुरक्षा, फसवणूक व रिवॉर्ड गैरवापर तपासणीसाठी वापरली जाते. या Security Client सुविधेसाठी फोन नंबर, IMEI, जाहिरात ID, हार्डवेअर सिरियल नंबर, IP पत्ता किंवा ब्राउझर फिंगरप्रिंट घटक गोळा केले जात नाहीत. एकच Security Client शेअर होणे हा फक्त तपासणीचा संकेत आहे; गैरवापराचा आपोआप पुरावा नाही. तांत्रिक Security Client संबंध साधारणपणे Client तयार झाल्यानंतर 365 दिवसांनी हटवले जातात; अपूर्ण सुरक्षा तपासणीसाठी आवश्यक पुरावे तपासणी पूर्ण होईपर्यंत ठेवले जाऊ शकतात. अंतिम पात्रता, सुरक्षा निर्णय, रिवॉर्ड आणि ऑडिट नोंदी वाजवी गरज असल्यास अधिक काळ ठेवता येतात.',
  },
  te: {
    updated: 'చివరిగా నవీకరించినది: 7 సెప్టెంబర్ 2026',
    heading: 'భద్రత మరియు రివార్డ్ దుర్వినియోగ నివారణ',
    body: 'ధృవీకరించిన వాలెట్ సెషన్ సమయంలో VeInvite, HttpOnly బ్రౌజర్ కుకీలో యాదృచ్ఛికమైన మారుపేరు Security Client గుర్తింపును ఉపయోగించి, సర్వర్‌లో ఆ గుర్తింపు యొక్క SHA-256 హ్యాష్‌ను ధృవీకరించిన వాలెట్ సంబంధాలతో కలిసి నిల్వ చేయవచ్చు. ఇది అనామక వినియోగ గణాంకాల నుంచి వేరుగా ఉంటుంది మరియు భద్రత, మోసం, రివార్డ్ దుర్వినియోగ సమీక్షల కోసం మాత్రమే ఉపయోగించబడుతుంది. ఈ Security Client సదుపాయం ఫోన్ నంబర్, IMEI, ప్రకటన ID, హార్డ్‌వేర్ సీరియల్ నంబర్, IP చిరునామా లేదా బ్రౌజర్ ఫింగర్‌ప్రింట్ భాగాలను సేకరించదు. ఒకే Security Client పంచుకోవడం సమీక్ష సంకేతం మాత్రమే; దుర్వినియోగానికి స్వయంచాలక సాక్ష్యం కాదు. సాంకేతిక Security Client సంబంధాలు సాధారణంగా Client సృష్టించిన 365 రోజుల తర్వాత తొలగించబడతాయి; పరిష్కారం కాని భద్రతా సమీక్షకు అవసరమైన ఆధారాలు సమీక్ష పూర్తయ్యే వరకు ఉంచవచ్చు. తుది అర్హత, భద్రతా నిర్ణయం, రివార్డ్ మరియు ఆడిట్ రికార్డులు సమంజసంగా అవసరమైతే మరింత కాలం నిల్వ ఉండవచ్చు.',
  },
  sw: {
    updated: 'Ilisasishwa mwisho: 7 Septemba 2026',
    heading: 'Usalama na kuzuia matumizi mabaya ya zawadi',
    body: 'Wakati kipindi cha pochi kilichothibitishwa kinaendelea, VeInvite inaweza kutumia kitambulisho cha Security Client cha nasibu na cha jina bandia katika kidakuzi cha HttpOnly cha kivinjari na kuhifadhi kwenye seva hash yake ya SHA-256 pamoja na mahusiano ya pochi zilizothibitishwa. Taarifa hizi hutenganishwa na takwimu za matumizi zisizomtambulisha mtu na hutumiwa tu kwa ukaguzi wa usalama, udanganyifu na matumizi mabaya ya zawadi. Kipengele hiki cha Security Client hakikusanyi nambari za simu, IMEI, vitambulisho vya matangazo, nambari za mfululizo za kifaa, anwani za IP au vipengele vya alama ya kivinjari. Kushiriki Security Client moja ni ishara ya ukaguzi tu, si uthibitisho wa moja kwa moja wa matumizi mabaya. Mahusiano ya kiufundi ya Security Client kwa kawaida hufutwa siku 365 baada ya Client kuundwa; ushahidi unaohitajika kwa ukaguzi wa usalama ambao haujakamilika unaweza kuhifadhiwa hadi ukaguzi huo utatuliwe. Rekodi za mwisho za ustahiki, maamuzi ya usalama, zawadi na ukaguzi zinaweza kuhifadhiwa muda mrefu zaidi inapohitajika kwa sababu ya msingi.',
  },
  ha: {
    updated: 'An sabunta: 7 Satumba 2026',
    heading: 'Tsaro da hana cin zarafin lada',
    body: 'A lokacin zaman walat da aka tabbatar, VeInvite na iya amfani da bazuwar Security Client ID na ɓoye suna a cikin HttpOnly cookie na burauza, sannan ya adana SHA-256 hash ɗinsa a sabar tare da alaƙar walat ɗin da aka tabbatar. Wannan bayanin ya bambanta da kididdigar amfani ta ɓoye suna kuma ana amfani da shi ne kawai don binciken tsaro, zamba da cin zarafin lada. Wannan fasalin Security Client ba ya tattara lambar waya, IMEI, advertising ID, serial number na na’ura, adireshin IP ko sassan browser fingerprint. Raba Security Client ɗaya alama ce ta dubawa kawai, ba hujjar cin zarafi kai tsaye ba. Ana share alaƙar Security Client ta fasaha yawanci bayan kwanaki 365 daga lokacin da aka ƙirƙiri Client; hujjar da ake bukata don binciken tsaro da bai kammala ba za a iya riƙewa har sai an warware binciken. Bayanan ƙarshe na cancanta, hukuncin tsaro, lada da audit za a iya riƙewa na tsawon lokaci idan akwai bukata mai ma’ana.',
  },
  el: {
    updated: 'Τελευταία ενημέρωση: 7 Σεπτεμβρίου 2026',
    heading: 'Ασφάλεια και αποτροπή κατάχρησης ανταμοιβών',
    body: 'Κατά τη διάρκεια επαληθευμένης συνεδρίας πορτοφολιού, το VeInvite μπορεί να χρησιμοποιεί ένα τυχαίο, ψευδωνυμοποιημένο αναγνωριστικό Security Client σε HttpOnly cookie του προγράμματος περιήγησης και να αποθηκεύει στον διακομιστή το SHA-256 hash του μαζί με τις σχέσεις επαληθευμένων πορτοφολιών. Οι πληροφορίες αυτές διατηρούνται χωριστά από τα ανώνυμα στατιστικά χρήσης και χρησιμοποιούνται μόνο για ελέγχους ασφάλειας, απάτης και κατάχρησης ανταμοιβών. Η λειτουργία Security Client δεν συλλέγει αριθμούς τηλεφώνου, IMEI, διαφημιστικά ID, σειριακούς αριθμούς υλικού, διευθύνσεις IP ή στοιχεία browser fingerprint. Η κοινή χρήση του ίδιου Security Client είναι μόνο ένδειξη για έλεγχο και όχι αυτόματη απόδειξη κατάχρησης. Οι τεχνικές σχέσεις Security Client διαγράφονται συνήθως 365 ημέρες μετά τη δημιουργία του Client· αποδεικτικά στοιχεία που χρειάζονται για εκκρεμή έλεγχο ασφάλειας μπορούν να διατηρηθούν έως την ολοκλήρωσή του. Τα τελικά αρχεία επιλεξιμότητας, αποφάσεων ασφάλειας, ανταμοιβών και ελέγχου μπορούν να διατηρηθούν περισσότερο όταν αυτό είναι εύλογα αναγκαίο.',
  },
};
