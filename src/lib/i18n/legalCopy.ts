import type { Locale } from './locales';

export type LegalDocumentKind = 'privacy' | 'terms';

type LegalSection = {
  heading: string;
  body: string;
};

export type LegalDocumentCopy = {
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  back: string;
};

const privacy: Record<Locale, LegalDocumentCopy> = {
  en: {
    eyebrow: 'LEGAL',
    title: 'VeInvite Privacy Policy',
    updated: 'Last updated: August 31, 2026',
    intro: 'VeInvite processes only the information reasonably needed to operate, secure, verify, and audit the referral onboarding service.',
    sections: [
      { heading: 'Information VeInvite may process', body: 'This may include wallet addresses, invite codes, referral status, authentication and verification timestamps, on-chain transaction and block references, onboarding progress, network information, and security or anti-abuse review signals.' },
      { heading: 'Information VeInvite does not request', body: 'VeInvite does not request or store private keys or seed phrases. Wallet signatures are used only to verify wallet control and should never require disclosure of a private key or seed phrase.' },
      { heading: 'Public blockchain data', body: 'VeChain transaction data is public by design. VeInvite may read and reference public on-chain activity to verify onboarding requirements, prevent duplicate rewards, investigate abuse, and maintain auditable reward records.' },
      { heading: 'Infrastructure and service providers', body: 'VeInvite relies on infrastructure providers such as Vercel, Supabase, VeChain network endpoints, and supported wallet providers. Those services may process technical information according to their own policies when necessary to provide the service.' },
      { heading: 'Retention', body: 'Referral, verification, security, and reward records may be retained as reasonably necessary for fraud prevention, auditability, accounting, dispute handling, and service integrity. Public blockchain records cannot be deleted by VeInvite.' },
      { heading: 'Data use', body: 'VeInvite does not sell personal data. Data is used to operate and improve the service, verify eligibility, protect the reward system, and comply with applicable ecosystem rules.' },
    ],
    back: 'Back to VeInvite',
  },
  ko: {
    eyebrow: '법률 문서',
    title: 'VeInvite 개인정보처리방침',
    updated: '최종 업데이트: 2026년 8월 31일',
    intro: 'VeInvite는 추천 기반 온보딩 서비스를 운영하고 보호하며 검증·감사하는 데 합리적으로 필요한 정보만 처리합니다.',
    sections: [
      { heading: 'VeInvite가 처리할 수 있는 정보', body: '지갑 주소, 초대 코드, 추천 상태, 인증 및 검증 시각, 온체인 거래와 블록 참조 정보, 온보딩 진행 상태, 네트워크 정보, 보안 또는 부정 이용 방지 검토 신호 등이 포함될 수 있습니다.' },
      { heading: 'VeInvite가 요청하지 않는 정보', body: 'VeInvite는 개인키나 시드 문구를 요청하거나 저장하지 않습니다. 지갑 서명은 지갑 소유권 확인에만 사용되며, 개인키나 시드 문구를 공개할 필요가 없습니다.' },
      { heading: '공개 블록체인 데이터', body: 'VeChain 거래 데이터는 블록체인 특성상 공개됩니다. VeInvite는 온보딩 요건 확인, 중복 보상 방지, 부정 이용 조사, 감사 가능한 보상 기록 유지를 위해 공개 온체인 활동을 조회하고 참조할 수 있습니다.' },
      { heading: '인프라 및 서비스 제공자', body: 'VeInvite는 Vercel, Supabase, VeChain 네트워크 엔드포인트 및 지원 지갑 제공자 등의 인프라를 이용합니다. 서비스 제공에 필요한 경우 해당 서비스는 각자의 정책에 따라 기술 정보를 처리할 수 있습니다.' },
      { heading: '보관', body: '추천, 검증, 보안 및 보상 기록은 부정 이용 방지, 감사 가능성, 회계, 분쟁 처리 및 서비스 무결성을 위해 합리적으로 필요한 기간 동안 보관될 수 있습니다. 공개 블록체인 기록은 VeInvite가 삭제할 수 없습니다.' },
      { heading: '정보 이용', body: 'VeInvite는 개인정보를 판매하지 않습니다. 정보는 서비스 운영 및 개선, 참여 자격 검증, 보상 시스템 보호, 적용 가능한 생태계 규칙 준수를 위해 사용됩니다.' },
    ],
    back: 'VeInvite로 돌아가기',
  },
  zh: {
    eyebrow: '法律文件',
    title: 'VeInvite 隐私政策',
    updated: '最后更新：2026年8月31日',
    intro: 'VeInvite 仅处理为运营、保护、验证和审计推荐式新用户引导服务而合理必要的信息。',
    sections: [
      { heading: 'VeInvite 可能处理的信息', body: '可能包括钱包地址、邀请码、推荐状态、身份验证与核验时间、链上交易及区块引用、引导进度、网络信息，以及安全或防滥用审核信号。' },
      { heading: 'VeInvite 不会要求的信息', body: 'VeInvite 不会要求或存储私钥或助记词。钱包签名仅用于确认你对钱包的控制权，不应要求你披露私钥或助记词。' },
      { heading: '公开的区块链数据', body: 'VeChain 交易数据因区块链特性而公开。VeInvite 可能读取和引用公开的链上活动，用于核验引导要求、防止重复奖励、调查滥用行为，以及保留可审计的奖励记录。' },
      { heading: '基础设施与服务提供商', body: 'VeInvite 使用 Vercel、Supabase、VeChain 网络端点以及受支持的钱包提供商等基础设施。为提供服务所必需时，这些服务可能依据各自的政策处理技术信息。' },
      { heading: '数据保留', body: '推荐、核验、安全和奖励记录可能在防止欺诈、保持可审计性、会计、争议处理及维护服务完整性所合理需要的期间内保留。公开的区块链记录无法由 VeInvite 删除。' },
      { heading: '数据用途', body: 'VeInvite 不出售个人数据。数据用于运营和改进服务、核验参与资格、保护奖励系统，并遵守适用的生态规则。' },
    ],
    back: '返回 VeInvite',
  },
  hi: {
    eyebrow: 'कानूनी दस्तावेज़',
    title: 'VeInvite गोपनीयता नीति',
    updated: 'अंतिम अपडेट: 31 अगस्त 2026',
    intro: 'VeInvite केवल वही जानकारी संसाधित करता है जो रेफ़रल-आधारित ऑनबोर्डिंग सेवा को चलाने, सुरक्षित रखने, सत्यापित करने और ऑडिट करने के लिए उचित रूप से आवश्यक है।',
    sections: [
      { heading: 'VeInvite किन जानकारियों को संसाधित कर सकता है', body: 'इसमें वॉलेट पते, आमंत्रण कोड, रेफ़रल की स्थिति, प्रमाणीकरण और सत्यापन का समय, ऑन-चेन ट्रांज़ैक्शन व ब्लॉक संदर्भ, ऑनबोर्डिंग प्रगति, नेटवर्क जानकारी और सुरक्षा या दुरुपयोग-रोधी समीक्षा संकेत शामिल हो सकते हैं।' },
      { heading: 'VeInvite कौन-सी जानकारी नहीं मांगता', body: 'VeInvite निजी कुंजी या सीड फ़्रेज़ नहीं मांगता और न ही उन्हें संग्रहीत करता है। वॉलेट सिग्नेचर का उपयोग केवल वॉलेट पर आपके नियंत्रण की पुष्टि के लिए होता है और इसमें कभी भी निजी कुंजी या सीड फ़्रेज़ बताने की आवश्यकता नहीं होनी चाहिए।' },
      { heading: 'सार्वजनिक ब्लॉकचेन डेटा', body: 'VeChain ट्रांज़ैक्शन डेटा ब्लॉकचेन की प्रकृति के कारण सार्वजनिक होता है। VeInvite ऑनबोर्डिंग शर्तों की पुष्टि, डुप्लिकेट पुरस्कार रोकने, दुरुपयोग की जांच करने और ऑडिट योग्य पुरस्कार रिकॉर्ड रखने के लिए सार्वजनिक ऑन-चेन गतिविधि को पढ़ और संदर्भित कर सकता है।' },
      { heading: 'इन्फ्रास्ट्रक्चर और सेवा प्रदाता', body: 'VeInvite Vercel, Supabase, VeChain नेटवर्क एंडपॉइंट और समर्थित वॉलेट प्रदाताओं जैसे इन्फ्रास्ट्रक्चर का उपयोग करता है। सेवा प्रदान करने के लिए आवश्यक होने पर ये सेवाएँ अपनी नीतियों के अनुसार तकनीकी जानकारी संसाधित कर सकती हैं।' },
      { heading: 'जानकारी का संरक्षण', body: 'रेफ़रल, सत्यापन, सुरक्षा और पुरस्कार रिकॉर्ड धोखाधड़ी रोकने, ऑडिट, लेखांकन, विवाद निपटान और सेवा की अखंडता के लिए उचित रूप से आवश्यक अवधि तक रखे जा सकते हैं। सार्वजनिक ब्लॉकचेन रिकॉर्ड VeInvite द्वारा हटाए नहीं जा सकते।' },
      { heading: 'डेटा का उपयोग', body: 'VeInvite व्यक्तिगत डेटा नहीं बेचता। डेटा का उपयोग सेवा चलाने और सुधारने, पात्रता सत्यापित करने, पुरस्कार प्रणाली की रक्षा करने और लागू इकोसिस्टम नियमों का पालन करने के लिए किया जाता है।' },
    ],
    back: 'VeInvite पर वापस जाएँ',
  },
  es: {
    eyebrow: 'DOCUMENTO LEGAL',
    title: 'Política de privacidad de VeInvite',
    updated: 'Última actualización: 31 de agosto de 2026',
    intro: 'VeInvite trata únicamente la información razonablemente necesaria para operar, proteger, verificar y auditar el servicio de incorporación mediante invitaciones.',
    sections: [
      { heading: 'Información que VeInvite puede tratar', body: 'Puede incluir direcciones de cartera, códigos de invitación, estado de la recomendación, fechas y horas de autenticación y verificación, referencias de transacciones y bloques en cadena, progreso de incorporación, información de red y señales de revisión de seguridad o prevención de abusos.' },
      { heading: 'Información que VeInvite no solicita', body: 'VeInvite no solicita ni almacena claves privadas ni frases semilla. Las firmas de la cartera se utilizan únicamente para verificar el control de la cartera y nunca deberían requerir que reveles una clave privada o una frase semilla.' },
      { heading: 'Datos públicos de la blockchain', body: 'Los datos de transacciones de VeChain son públicos por diseño. VeInvite puede consultar y referenciar actividad pública en cadena para verificar los requisitos de incorporación, evitar recompensas duplicadas, investigar abusos y mantener registros de recompensas auditables.' },
      { heading: 'Infraestructura y proveedores de servicios', body: 'VeInvite utiliza infraestructura como Vercel, Supabase, endpoints de la red VeChain y proveedores de carteras compatibles. Cuando sea necesario para prestar el servicio, estos proveedores pueden tratar información técnica de acuerdo con sus propias políticas.' },
      { heading: 'Conservación', body: 'Los registros de invitaciones, verificación, seguridad y recompensas pueden conservarse durante el tiempo razonablemente necesario para prevenir fraudes, permitir auditorías, llevar la contabilidad, gestionar disputas y mantener la integridad del servicio. VeInvite no puede eliminar los registros públicos de la blockchain.' },
      { heading: 'Uso de los datos', body: 'VeInvite no vende datos personales. Los datos se utilizan para operar y mejorar el servicio, verificar la elegibilidad, proteger el sistema de recompensas y cumplir las reglas aplicables del ecosistema.' },
    ],
    back: 'Volver a VeInvite',
  },
  ja: {
    eyebrow: '法的文書',
    title: 'VeInvite プライバシーポリシー',
    updated: '最終更新日：2026年8月31日',
    intro: 'VeInviteは、招待型オンボーディングサービスの運営、保護、検証、監査に合理的に必要な情報のみを取り扱います。',
    sections: [
      { heading: 'VeInviteが取り扱う可能性のある情報', body: 'ウォレットアドレス、招待コード、紹介状況、認証・検証日時、オンチェーン取引およびブロック参照情報、オンボーディング進捗、ネットワーク情報、セキュリティまたは不正利用防止の審査シグナルなどが含まれる場合があります。' },
      { heading: 'VeInviteが求めない情報', body: 'VeInviteは秘密鍵やシードフレーズを要求または保存しません。ウォレット署名はウォレットを管理していることの確認にのみ使用され、秘密鍵やシードフレーズを開示する必要はありません。' },
      { heading: '公開ブロックチェーンデータ', body: 'VeChainの取引データはブロックチェーンの性質上公開されています。VeInviteは、オンボーディング要件の確認、重複報酬の防止、不正利用の調査、監査可能な報酬記録の維持のために、公開オンチェーン活動を参照する場合があります。' },
      { heading: 'インフラおよびサービス提供者', body: 'VeInviteは、Vercel、Supabase、VeChainネットワークのエンドポイント、対応ウォレット提供者などのインフラを利用します。サービス提供に必要な場合、これらのサービスは各自のポリシーに従って技術情報を処理することがあります。' },
      { heading: '保存期間', body: '紹介、検証、セキュリティ、報酬に関する記録は、不正防止、監査可能性、会計、紛争対応、サービスの健全性維持のために合理的に必要な期間保存される場合があります。公開ブロックチェーン上の記録をVeInviteが削除することはできません。' },
      { heading: 'データの利用目的', body: 'VeInviteは個人データを販売しません。データは、サービスの運営・改善、参加資格の確認、報酬システムの保護、適用されるエコシステムルールの遵守のために利用されます。' },
    ],
    back: 'VeInviteに戻る',
  },
  it: {
    eyebrow: 'DOCUMENTO LEGALE',
    title: 'Informativa sulla privacy di VeInvite',
    updated: 'Ultimo aggiornamento: 31 agosto 2026',
    intro: 'VeInvite tratta esclusivamente le informazioni ragionevolmente necessarie per gestire, proteggere, verificare e sottoporre ad audit il servizio di onboarding tramite inviti.',
    sections: [
      { heading: 'Informazioni che VeInvite può trattare', body: 'Possono includere indirizzi wallet, codici di invito, stato del referral, date e orari di autenticazione e verifica, riferimenti a transazioni e blocchi on-chain, avanzamento dell’onboarding, informazioni di rete e segnali di revisione per sicurezza o prevenzione degli abusi.' },
      { heading: 'Informazioni che VeInvite non richiede', body: 'VeInvite non richiede né conserva chiavi private o seed phrase. Le firme del wallet vengono utilizzate esclusivamente per verificare il controllo del wallet e non richiedono mai la divulgazione di una chiave privata o di una seed phrase.' },
      { heading: 'Dati pubblici della blockchain', body: 'I dati delle transazioni VeChain sono pubblici per natura. VeInvite può leggere e utilizzare come riferimento l’attività pubblica on-chain per verificare i requisiti di onboarding, evitare ricompense duplicate, indagare su abusi e mantenere registri delle ricompense verificabili.' },
      { heading: 'Infrastruttura e fornitori di servizi', body: 'VeInvite utilizza infrastrutture quali Vercel, Supabase, endpoint della rete VeChain e fornitori di wallet supportati. Quando necessario per erogare il servizio, tali fornitori possono trattare informazioni tecniche secondo le proprie politiche.' },
      { heading: 'Conservazione', body: 'I dati relativi a referral, verifiche, sicurezza e ricompense possono essere conservati per il periodo ragionevolmente necessario alla prevenzione delle frodi, all’audit, alla contabilità, alla gestione delle controversie e all’integrità del servizio. I dati pubblici registrati sulla blockchain non possono essere eliminati da VeInvite.' },
      { heading: 'Uso dei dati', body: 'VeInvite non vende dati personali. I dati vengono utilizzati per gestire e migliorare il servizio, verificare l’idoneità, proteggere il sistema di ricompense e rispettare le regole applicabili dell’ecosistema.' },
    ],
    back: 'Torna a VeInvite',
  },
  tr: {
    eyebrow: 'YASAL BELGE',
    title: 'VeInvite Gizlilik Politikası',
    updated: 'Son güncelleme: 31 Ağustos 2026',
    intro: 'VeInvite, davet tabanlı kullanıcı katılım hizmetini işletmek, korumak, doğrulamak ve denetlemek için makul ölçüde gerekli olan bilgileri işler.',
    sections: [
      { heading: 'VeInvite’ın işleyebileceği bilgiler', body: 'Cüzdan adresleri, davet kodları, yönlendirme durumu, kimlik doğrulama ve doğrulama zamanları, zincir üstü işlem ve blok referansları, katılım ilerlemesi, ağ bilgileri ve güvenlik veya kötüye kullanım önleme inceleme sinyalleri bu kapsama girebilir.' },
      { heading: 'VeInvite’ın istemediği bilgiler', body: 'VeInvite özel anahtar veya seed phrase istemez ve saklamaz. Cüzdan imzaları yalnızca cüzdanın kontrolünü doğrulamak için kullanılır ve özel anahtarın ya da seed phrase’in açıklanmasını gerektirmez.' },
      { heading: 'Herkese açık blokzincir verileri', body: 'VeChain işlem verileri yapısı gereği herkese açıktır. VeInvite; katılım şartlarını doğrulamak, mükerrer ödülleri önlemek, kötüye kullanımı incelemek ve denetlenebilir ödül kayıtları tutmak için herkese açık zincir üstü faaliyetleri okuyabilir ve referans gösterebilir.' },
      { heading: 'Altyapı ve hizmet sağlayıcıları', body: 'VeInvite; Vercel, Supabase, VeChain ağ uç noktaları ve desteklenen cüzdan sağlayıcıları gibi altyapı hizmetlerinden yararlanır. Hizmetin sunulması için gerekli olduğunda bu sağlayıcılar teknik bilgileri kendi politikalarına göre işleyebilir.' },
      { heading: 'Saklama', body: 'Yönlendirme, doğrulama, güvenlik ve ödül kayıtları; dolandırıcılığı önleme, denetlenebilirlik, muhasebe, uyuşmazlık yönetimi ve hizmet bütünlüğü için makul ölçüde gerekli olduğu sürece saklanabilir. Herkese açık blokzincir kayıtları VeInvite tarafından silinemez.' },
      { heading: 'Verilerin kullanımı', body: 'VeInvite kişisel verileri satmaz. Veriler hizmeti işletmek ve geliştirmek, uygunluğu doğrulamak, ödül sistemini korumak ve geçerli ekosistem kurallarına uymak için kullanılır.' },
    ],
    back: 'VeInvite’a dön',
  },
  nl: {
    eyebrow: 'JURIDISCH DOCUMENT',
    title: 'Privacybeleid van VeInvite',
    updated: 'Laatst bijgewerkt: 31 augustus 2026',
    intro: 'VeInvite verwerkt alleen informatie die redelijkerwijs nodig is om de onboardingdienst op basis van uitnodigingen te beheren, beveiligen, verifiëren en controleren.',
    sections: [
      { heading: 'Informatie die VeInvite kan verwerken', body: 'Dit kan onder meer walletadressen, uitnodigingscodes, verwijzingsstatus, tijdstippen van authenticatie en verificatie, verwijzingen naar on-chain transacties en blokken, onboardingvoortgang, netwerkinformatie en signalen voor beveiligings- of misbruikcontrole omvatten.' },
      { heading: 'Informatie die VeInvite niet vraagt', body: 'VeInvite vraagt niet om privésleutels of seed phrases en slaat deze niet op. Wallet-handtekeningen worden uitsluitend gebruikt om de controle over een wallet te verifiëren en vereisen nooit dat een privésleutel of seed phrase wordt gedeeld.' },
      { heading: 'Openbare blockchaingegevens', body: 'VeChain-transactiegegevens zijn van nature openbaar. VeInvite kan openbare on-chain activiteit lezen en raadplegen om onboardingvereisten te verifiëren, dubbele beloningen te voorkomen, misbruik te onderzoeken en controleerbare beloningsgegevens bij te houden.' },
      { heading: 'Infrastructuur en dienstverleners', body: 'VeInvite maakt gebruik van infrastructuur zoals Vercel, Supabase, VeChain-netwerkendpoints en ondersteunde walletproviders. Voor zover nodig om de dienst te leveren, kunnen deze partijen technische informatie verwerken volgens hun eigen beleid.' },
      { heading: 'Bewaartermijn', body: 'Gegevens over verwijzingen, verificatie, beveiliging en beloningen kunnen worden bewaard zolang dat redelijkerwijs nodig is voor fraudepreventie, controleerbaarheid, boekhouding, geschilafhandeling en de integriteit van de dienst. Openbare blockchainrecords kunnen niet door VeInvite worden verwijderd.' },
      { heading: 'Gebruik van gegevens', body: 'VeInvite verkoopt geen persoonsgegevens. Gegevens worden gebruikt om de dienst te beheren en te verbeteren, geschiktheid te verifiëren, het beloningssysteem te beschermen en toepasselijke ecosysteemregels na te leven.' },
    ],
    back: 'Terug naar VeInvite',
  },
  de: {
    eyebrow: 'RECHTLICHES DOKUMENT',
    title: 'Datenschutzerklärung von VeInvite',
    updated: 'Zuletzt aktualisiert: 31. August 2026',
    intro: 'VeInvite verarbeitet nur Informationen, die vernünftigerweise erforderlich sind, um den einladungsbasierten Onboarding-Dienst zu betreiben, zu schützen, zu verifizieren und zu prüfen.',
    sections: [
      { heading: 'Informationen, die VeInvite verarbeiten kann', body: 'Dazu können Wallet-Adressen, Einladungscodes, Empfehlungsstatus, Zeitpunkte der Authentifizierung und Verifizierung, Verweise auf On-Chain-Transaktionen und Blöcke, Onboarding-Fortschritt, Netzwerkinformationen sowie Signale für Sicherheits- oder Missbrauchsprüfungen gehören.' },
      { heading: 'Informationen, die VeInvite nicht anfordert', body: 'VeInvite fordert keine privaten Schlüssel oder Seed-Phrasen an und speichert diese nicht. Wallet-Signaturen werden ausschließlich verwendet, um die Kontrolle über eine Wallet zu bestätigen, und erfordern niemals die Offenlegung eines privaten Schlüssels oder einer Seed-Phrase.' },
      { heading: 'Öffentliche Blockchain-Daten', body: 'VeChain-Transaktionsdaten sind systembedingt öffentlich. VeInvite kann öffentliche On-Chain-Aktivitäten lesen und referenzieren, um Onboarding-Anforderungen zu verifizieren, doppelte Belohnungen zu verhindern, Missbrauch zu untersuchen und prüfbare Belohnungsaufzeichnungen zu führen.' },
      { heading: 'Infrastruktur und Dienstanbieter', body: 'VeInvite nutzt Infrastruktur wie Vercel, Supabase, VeChain-Netzwerkendpunkte und unterstützte Wallet-Anbieter. Soweit dies für die Bereitstellung des Dienstes erforderlich ist, können diese Anbieter technische Informationen nach ihren eigenen Richtlinien verarbeiten.' },
      { heading: 'Aufbewahrung', body: 'Empfehlungs-, Verifizierungs-, Sicherheits- und Belohnungsdaten können so lange aufbewahrt werden, wie dies für Betrugsprävention, Prüfbarkeit, Buchhaltung, Streitbeilegung und die Integrität des Dienstes vernünftigerweise erforderlich ist. Öffentliche Blockchain-Daten können von VeInvite nicht gelöscht werden.' },
      { heading: 'Datennutzung', body: 'VeInvite verkauft keine personenbezogenen Daten. Daten werden verwendet, um den Dienst zu betreiben und zu verbessern, die Teilnahmeberechtigung zu verifizieren, das Belohnungssystem zu schützen und geltende Ökosystemregeln einzuhalten.' },
    ],
    back: 'Zurück zu VeInvite',
  },
  fr: {
    eyebrow: 'DOCUMENT JURIDIQUE',
    title: 'Politique de confidentialité de VeInvite',
    updated: 'Dernière mise à jour : 31 août 2026',
    intro: 'VeInvite traite uniquement les informations raisonnablement nécessaires pour exploiter, sécuriser, vérifier et auditer le service d’onboarding par invitation.',
    sections: [
      { heading: 'Informations que VeInvite peut traiter', body: 'Cela peut inclure les adresses de wallet, les codes d’invitation, le statut du parrainage, les dates et heures d’authentification et de vérification, les références de transactions et de blocs on-chain, la progression de l’onboarding, les informations réseau et les signaux liés aux contrôles de sécurité ou de prévention des abus.' },
      { heading: 'Informations que VeInvite ne demande pas', body: 'VeInvite ne demande ni ne conserve de clés privées ou de seed phrases. Les signatures du wallet servent uniquement à vérifier le contrôle du wallet et ne nécessitent jamais la divulgation d’une clé privée ou d’une seed phrase.' },
      { heading: 'Données publiques de la blockchain', body: 'Les données de transaction VeChain sont publiques par nature. VeInvite peut consulter et référencer l’activité publique on-chain afin de vérifier les conditions d’onboarding, d’éviter les récompenses en double, d’enquêter sur les abus et de conserver des registres de récompenses auditables.' },
      { heading: 'Infrastructure et prestataires de services', body: 'VeInvite s’appuie sur des infrastructures telles que Vercel, Supabase, les endpoints du réseau VeChain et les fournisseurs de wallets pris en charge. Lorsque cela est nécessaire à la fourniture du service, ces prestataires peuvent traiter des informations techniques conformément à leurs propres politiques.' },
      { heading: 'Conservation', body: 'Les données relatives aux parrainages, aux vérifications, à la sécurité et aux récompenses peuvent être conservées pendant la durée raisonnablement nécessaire à la prévention de la fraude, à l’audit, à la comptabilité, au traitement des litiges et à l’intégrité du service. Les données publiques inscrites sur la blockchain ne peuvent pas être supprimées par VeInvite.' },
      { heading: 'Utilisation des données', body: 'VeInvite ne vend pas de données personnelles. Les données servent à exploiter et améliorer le service, vérifier l’éligibilité, protéger le système de récompenses et respecter les règles applicables de l’écosystème.' },
    ],
    back: 'Retour à VeInvite',
  },
};

const terms: Record<Locale, LegalDocumentCopy> = {
  en: {
    eyebrow: 'LEGAL',
    title: 'VeInvite Terms of Use',
    updated: 'Last updated: August 31, 2026',
    intro: 'VeInvite is a referral-based onboarding and reactivation service for the VeBetterDAO ecosystem. By using VeInvite, you agree to these terms and to comply with applicable VeBetterDAO rules and the terms of any third-party apps or wallets you use.',
    sections: [
      { heading: 'Referral eligibility', body: 'Referral eligibility is determined through VeInvite’s verification rules, including wallet ownership, entry-history checks, required onboarding activity, governance participation, duplicate prevention, and anti-abuse review. A wallet may qualify as new when no prior rewarded or allocation-voting VeBetterDAO activity is found. A wallet with older activity may qualify as returning when no rewarded or allocation-voting activity is found from the start of the previous 12 completed VeBetterDAO rounds through the eligibility check. Existing users with recent activity, self-referrals, duplicate referrals, manipulated activity, or referrals that cannot be verified may be rejected or excluded from rewards.' },
      { heading: 'Who a referral reward is for', body: 'The invitee’s dApp activity, B3TR-to-VOT3 conversion, and Allocation Voting are onboarding-verification criteria. VeInvite does not pay the invitee additional B3TR merely for those same actions. When funded referral rewards are enabled, the inviter who successfully brings an eligible new or returning user through verified onboarding may qualify for a referral reward after final verification.' },
      { heading: 'Rewards are not guaranteed', body: 'B3TR referral rewards are not fixed or guaranteed. Inviter eligibility, timing, and amounts may depend on onboarding evidence, final Sybil review, available VeInvite referral-reward pool funds and carry-over, VeBetterDAO allocation outcomes, and current ecosystem rules. Reward distribution may be paused or changed when needed for security, technical reliability, or rule compliance.' },
      { heading: 'Invite cancellation', body: 'An inviter may cancel an invite only before it has been accepted by an invitee. Once an invite has been accepted, it cannot be cancelled in order to protect the invitee’s onboarding progress and audit history.' },
      { heading: 'Wallet safety', body: 'VeInvite is non-custodial. VeInvite does not request or store private keys or seed phrases. Never share a private key or seed phrase with VeInvite, a community member, or anyone claiming to provide support.' },
      { heading: 'Service availability', body: 'Blockchain nodes, wallets, VeBetterDAO contracts, and third-party apps may experience delays or outages. VeInvite may temporarily restrict actions when verification cannot be completed safely and may update these terms as the service and ecosystem rules evolve.' },
    ],
    back: 'Back to VeInvite',
  },
  ko: {
    eyebrow: '법률 문서',
    title: 'VeInvite 이용약관',
    updated: '최종 업데이트: 2026년 8월 31일',
    intro: 'VeInvite는 VeBetterDAO 생태계를 위한 추천 기반 신규 사용자 온보딩 및 복귀 사용자 재활성화 서비스입니다. VeInvite를 이용하면 본 약관과 적용 가능한 VeBetterDAO 규칙, 그리고 이용하는 제3자 앱 또는 지갑의 약관을 준수하는 데 동의하는 것으로 간주됩니다.',
    sections: [
      { heading: '추천 참여 자격', body: '추천 참여 자격은 지갑 소유권, 진입 전 활동 이력, 필수 온보딩 활동, 거버넌스 참여, 중복 방지 및 부정 이용 검토를 포함한 VeInvite의 검증 규칙에 따라 결정됩니다. 이전에 보상 또는 Allocation Voting 활동이 확인되지 않는 지갑은 신규 사용자로 인정될 수 있습니다. 과거 활동은 있으나 최근 12개 완료 라운드 시작 시점부터 자격 확인 시점까지 보상 또는 Allocation Voting 활동이 없는 지갑은 복귀 사용자로 인정될 수 있습니다. 최근 활동이 있는 기존 사용자, 자기 초대, 중복 추천, 조작된 활동 또는 검증할 수 없는 추천은 거절되거나 보상에서 제외될 수 있습니다.' },
      { heading: '추천 보상의 대상', body: '초대받은 사용자의 dApp 활동, B3TR에서 VOT3로의 전환 및 Allocation Voting은 온보딩 검증 기준입니다. VeInvite는 이러한 행동을 이유로 피추천자에게 동일 행동에 대한 별도의 B3TR 보상을 추가 지급하지 않습니다. 추천 보상 재원이 활성화된 경우, 자격을 갖춘 신규 또는 복귀 사용자를 실제 온보딩 완료까지 연결한 초대자가 최종 검증 후 추천 보상 대상이 될 수 있습니다.' },
      { heading: '보상은 보장되지 않습니다', body: 'B3TR 추천 보상은 고정되거나 보장되지 않습니다. 초대자의 지급 자격, 지급 시점, 보상 금액은 온보딩 검증 결과, 최종 Sybil 검토, VeInvite 추천 보상 풀의 가용 자금과 이월분, VeBetterDAO 배분 결과 및 현재 생태계 규칙에 따라 달라질 수 있습니다. 보안, 기술적 안정성 또는 규칙 준수를 위해 보상 배분이 일시 중단되거나 변경될 수 있습니다.' },
      { heading: '초대 취소', body: '초대자는 피추천자가 초대를 수락하기 전까지만 초대를 취소할 수 있습니다. 피추천자가 초대를 수락한 이후에는 피추천자의 온보딩 진행 상태와 감사 기록을 보호하기 위해 초대를 취소할 수 없습니다.' },
      { heading: '지갑 보안', body: 'VeInvite는 비수탁형 서비스입니다. VeInvite는 개인키나 시드 문구를 요청하거나 저장하지 않습니다. VeInvite, 커뮤니티 구성원 또는 지원을 제공한다고 주장하는 누구에게도 개인키나 시드 문구를 공유하지 마세요.' },
      { heading: '서비스 이용 가능성', body: '블록체인 노드, 지갑, VeBetterDAO 계약 및 제3자 앱에는 지연이나 장애가 발생할 수 있습니다. VeInvite는 안전하게 검증을 완료할 수 없는 경우 일부 기능을 일시적으로 제한할 수 있으며, 서비스와 생태계 규칙의 변화에 따라 본 약관을 업데이트할 수 있습니다.' },
    ],
    back: 'VeInvite로 돌아가기',
  },
  zh: {
    eyebrow: '法律文件',
    title: 'VeInvite 使用条款',
    updated: '最后更新：2026年8月31日',
    intro: 'VeInvite 是面向 VeBetterDAO 生态的推荐式新用户引导与回归用户重新激活服务。使用 VeInvite 即表示你同意遵守本条款、适用的 VeBetterDAO 规则，以及你所使用的第三方应用或钱包的条款。',
    sections: [
      { heading: '推荐参与资格', body: '推荐参与资格依据 VeInvite 的验证规则确定，其中包括钱包控制权、进入前的活动历史、必需的引导活动、治理参与、重复参与防范以及防滥用审核。若未发现钱包此前存在获得奖励或 Allocation Voting 的 VeBetterDAO 活动，该钱包可能被认定为新用户。若钱包有更早的活动，但从最近 12 个已完成 VeBetterDAO 轮次中最早一轮的开始时间到资格检查时均未发现获得奖励或 Allocation Voting 活动，则可能被认定为回归用户。近期有相关活动的现有用户、自我邀请、重复推荐、操纵活动或无法验证的推荐可能会被拒绝或排除在奖励之外。' },
      { heading: '推荐奖励面向谁', body: '受邀用户的 dApp 活动、B3TR 转换为 VOT3 以及 Allocation Voting 是用于验证引导完成情况的条件。VeInvite 不会仅因为受邀用户完成这些相同行为而额外向其支付 B3TR。当推荐奖励资金已启用时，成功将符合资格的新用户或回归用户带至完成验证引导的邀请人，可在最终验证后获得推荐奖励资格。' },
      { heading: '奖励不作保证', body: 'B3TR 推荐奖励并非固定金额，也不作保证。邀请人的领取资格、发放时间和金额可能取决于引导证据、最终 Sybil 审核、VeInvite 推荐奖励池可用资金及结转金额、VeBetterDAO 分配结果以及当前生态规则。出于安全、技术可靠性或规则合规需要，奖励发放可能暂停或调整。' },
      { heading: '取消邀请', body: '邀请人只能在受邀用户接受邀请之前取消邀请。受邀用户一旦接受邀请，为保护其引导进度和审计记录，该邀请将不能取消。' },
      { heading: '钱包安全', body: 'VeInvite 是非托管服务。VeInvite 不会要求或存储私钥或助记词。请勿向 VeInvite、社区成员或任何声称提供支持的人分享私钥或助记词。' },
      { heading: '服务可用性', body: '区块链节点、钱包、VeBetterDAO 合约和第三方应用可能出现延迟或中断。当无法安全完成验证时，VeInvite 可能暂时限制部分操作，并可能随着服务和生态规则的发展更新本条款。' },
    ],
    back: '返回 VeInvite',
  },
  hi: {
    eyebrow: 'कानूनी दस्तावेज़',
    title: 'VeInvite उपयोग की शर्तें',
    updated: 'अंतिम अपडेट: 31 अगस्त 2026',
    intro: 'VeInvite, VeBetterDAO इकोसिस्टम के लिए रेफ़रल-आधारित नए उपयोगकर्ता ऑनबोर्डिंग और लौटने वाले उपयोगकर्ताओं को फिर से सक्रिय करने की सेवा है। VeInvite का उपयोग करके आप इन शर्तों, लागू VeBetterDAO नियमों और आपके द्वारा उपयोग किए जाने वाले किसी भी तृतीय-पक्ष ऐप या वॉलेट की शर्तों का पालन करने के लिए सहमत होते हैं।',
    sections: [
      { heading: 'रेफ़रल पात्रता', body: 'रेफ़रल पात्रता VeInvite के सत्यापन नियमों के अनुसार तय होती है, जिनमें वॉलेट नियंत्रण, प्रवेश से पहले की गतिविधि का इतिहास, आवश्यक ऑनबोर्डिंग गतिविधियाँ, गवर्नेंस भागीदारी, डुप्लिकेट रोकथाम और दुरुपयोग-रोधी समीक्षा शामिल हैं। यदि पहले कोई पुरस्कृत या Allocation Voting VeBetterDAO गतिविधि नहीं मिलती, तो वॉलेट को नया माना जा सकता है। यदि पुरानी गतिविधि मौजूद है, लेकिन पिछली 12 पूरी हुई VeBetterDAO राउंड की सबसे पुरानी शुरुआत से पात्रता जांच तक कोई पुरस्कृत या Allocation Voting गतिविधि नहीं मिलती, तो वॉलेट लौटने वाले उपयोगकर्ता के रूप में पात्र हो सकता है। हाल की संबंधित गतिविधि वाले मौजूदा उपयोगकर्ता, स्वयं को रेफ़र करना, डुप्लिकेट रेफ़रल, हेरफेर की गई गतिविधि या सत्यापित न किए जा सकने वाले रेफ़रल अस्वीकार किए जा सकते हैं या पुरस्कार से बाहर किए जा सकते हैं।' },
      { heading: 'रेफ़रल पुरस्कार किसके लिए है', body: 'आमंत्रित उपयोगकर्ता की dApp गतिविधि, B3TR से VOT3 रूपांतरण और Allocation Voting ऑनबोर्डिंग सत्यापन के मानदंड हैं। केवल इन्हीं गतिविधियों को पूरा करने के कारण VeInvite आमंत्रित उपयोगकर्ता को अतिरिक्त B3TR नहीं देता। जब वित्तपोषित रेफ़रल पुरस्कार सक्रिय हों, तो योग्य नए या लौटने वाले उपयोगकर्ता को सत्यापित ऑनबोर्डिंग पूरा कराने वाला आमंत्रक अंतिम सत्यापन के बाद रेफ़रल पुरस्कार के लिए पात्र हो सकता है।' },
      { heading: 'पुरस्कार की गारंटी नहीं है', body: 'B3TR रेफ़रल पुरस्कार निश्चित या गारंटीकृत नहीं हैं। आमंत्रक की पात्रता, भुगतान का समय और राशि ऑनबोर्डिंग प्रमाण, अंतिम Sybil समीक्षा, VeInvite रेफ़रल पुरस्कार पूल में उपलब्ध धन और कैरी-ओवर, VeBetterDAO आवंटन परिणाम और मौजूदा इकोसिस्टम नियमों पर निर्भर कर सकते हैं। सुरक्षा, तकनीकी विश्वसनीयता या नियमों के पालन के लिए पुरस्कार वितरण रोका या बदला जा सकता है।' },
      { heading: 'आमंत्रण रद्द करना', body: 'आमंत्रक किसी आमंत्रण को केवल तब तक रद्द कर सकता है जब तक आमंत्रित उपयोगकर्ता ने उसे स्वीकार न किया हो। स्वीकार किए जाने के बाद, आमंत्रित उपयोगकर्ता की ऑनबोर्डिंग प्रगति और ऑडिट रिकॉर्ड की सुरक्षा के लिए आमंत्रण रद्द नहीं किया जा सकता।' },
      { heading: 'वॉलेट सुरक्षा', body: 'VeInvite एक non-custodial सेवा है। VeInvite निजी कुंजी या सीड फ़्रेज़ नहीं मांगता और न ही उन्हें संग्रहीत करता है। अपनी निजी कुंजी या सीड फ़्रेज़ VeInvite, किसी समुदाय सदस्य या सहायता देने का दावा करने वाले किसी व्यक्ति के साथ साझा न करें।' },
      { heading: 'सेवा की उपलब्धता', body: 'ब्लॉकचेन नोड, वॉलेट, VeBetterDAO कॉन्ट्रैक्ट और तृतीय-पक्ष ऐप में देरी या रुकावट हो सकती है। जब सत्यापन सुरक्षित रूप से पूरा न किया जा सके, VeInvite कुछ कार्रवाइयों को अस्थायी रूप से सीमित कर सकता है और सेवा व इकोसिस्टम नियमों में बदलाव के साथ इन शर्तों को अपडेट कर सकता है।' },
    ],
    back: 'VeInvite पर वापस जाएँ',
  },
  es: {
    eyebrow: 'DOCUMENTO LEGAL',
    title: 'Condiciones de uso de VeInvite',
    updated: 'Última actualización: 31 de agosto de 2026',
    intro: 'VeInvite es un servicio de incorporación mediante invitaciones y reactivación de usuarios para el ecosistema VeBetterDAO. Al utilizar VeInvite, aceptas estas condiciones y te comprometes a cumplir las reglas aplicables de VeBetterDAO y las condiciones de las aplicaciones o carteras de terceros que utilices.',
    sections: [
      { heading: 'Elegibilidad de las invitaciones', body: 'La elegibilidad se determina mediante las reglas de verificación de VeInvite, que incluyen el control de la cartera, la revisión del historial previo, las actividades de incorporación obligatorias, la participación en la gobernanza, la prevención de duplicados y las revisiones contra abusos. Una cartera puede considerarse nueva si no se encuentra actividad previa de VeBetterDAO con recompensas o Allocation Voting. Una cartera con actividad más antigua puede considerarse de un usuario que regresa si no se encuentra actividad con recompensas o Allocation Voting desde el inicio de las 12 rondas completadas anteriores hasta la comprobación de elegibilidad. Los usuarios existentes con actividad reciente, las auto-invitaciones, las invitaciones duplicadas, la actividad manipulada o las invitaciones que no puedan verificarse pueden ser rechazadas o excluidas de las recompensas.' },
      { heading: 'A quién corresponde la recompensa por invitación', body: 'La actividad del invitado en dApps, la conversión de B3TR a VOT3 y la participación en Allocation Voting son criterios para verificar la incorporación. VeInvite no paga B3TR adicional al invitado simplemente por realizar esas mismas acciones. Cuando las recompensas financiadas estén activas, el invitador que consiga que un usuario nuevo o que regresa complete una incorporación verificada puede optar a una recompensa tras la verificación final.' },
      { heading: 'Las recompensas no están garantizadas', body: 'Las recompensas de invitación en B3TR no son fijas ni están garantizadas. La elegibilidad del invitador, el momento del pago y la cantidad pueden depender de las pruebas de incorporación, la revisión Sybil final, los fondos disponibles y acumulados del fondo de recompensas de VeInvite, los resultados de asignación de VeBetterDAO y las reglas vigentes del ecosistema. La distribución puede pausarse o modificarse por motivos de seguridad, fiabilidad técnica o cumplimiento de las reglas.' },
      { heading: 'Cancelación de una invitación', body: 'El invitador solo puede cancelar una invitación antes de que el invitado la acepte. Una vez aceptada, no puede cancelarse para proteger el progreso de incorporación y el historial de auditoría del invitado.' },
      { heading: 'Seguridad de la cartera', body: 'VeInvite es un servicio no custodial. VeInvite no solicita ni almacena claves privadas ni frases semilla. Nunca compartas una clave privada o una frase semilla con VeInvite, miembros de la comunidad o cualquier persona que afirme ofrecer soporte.' },
      { heading: 'Disponibilidad del servicio', body: 'Los nodos de blockchain, las carteras, los contratos de VeBetterDAO y las aplicaciones de terceros pueden sufrir retrasos o interrupciones. VeInvite puede limitar temporalmente determinadas acciones cuando no sea posible completar la verificación de forma segura y puede actualizar estas condiciones a medida que evolucionen el servicio y las reglas del ecosistema.' },
    ],
    back: 'Volver a VeInvite',
  },
  ja: {
    eyebrow: '法的文書',
    title: 'VeInvite 利用規約',
    updated: '最終更新日：2026年8月31日',
    intro: 'VeInviteは、VeBetterDAOエコシステム向けの招待型オンボーディングおよび復帰ユーザー再活性化サービスです。VeInviteを利用することで、本規約、適用されるVeBetterDAOのルール、および利用する第三者アプリやウォレットの規約を遵守することに同意したものとみなされます。',
    sections: [
      { heading: '招待参加資格', body: '招待参加資格は、ウォレットの管理権、参加前の活動履歴、必要なオンボーディング活動、ガバナンス参加、重複防止、不正利用防止審査を含むVeInviteの検証ルールに基づいて判断されます。過去に報酬を受け取った、またはAllocation Votingに参加したVeBetterDAO活動が確認されないウォレットは、新規ユーザーとして認められる場合があります。過去の活動があっても、直近12回の完了済みVeBetterDAOラウンドのうち最も古いラウンドの開始時点から資格確認時点まで、報酬受取またはAllocation Voting活動が確認されないウォレットは、復帰ユーザーとして認められる場合があります。最近の該当活動がある既存ユーザー、自己招待、重複紹介、操作された活動、または検証できない紹介は、拒否または報酬対象外となる場合があります。' },
      { heading: '招待報酬の対象', body: '招待されたユーザーのdApp活動、B3TRからVOT3への変換、Allocation Votingへの参加は、オンボーディングを確認するための条件です。VeInviteは、これらと同じ行動をしたことだけを理由に招待されたユーザーへ追加のB3TRを支払いません。資金のある招待報酬が有効な場合、参加資格のある新規または復帰ユーザーを検証済みオンボーディングの完了まで導いた招待者は、最終検証後に招待報酬の対象となる場合があります。' },
      { heading: '報酬は保証されません', body: 'B3TR招待報酬は固定額ではなく、保証もされません。招待者の受取資格、支払時期、金額は、オンボーディング証拠、最終Sybil審査、VeInvite招待報酬プールの利用可能資金と繰越額、VeBetterDAOの配分結果、現在のエコシステムルールによって変わる場合があります。セキュリティ、技術的な信頼性、ルール遵守のために、報酬配分が一時停止または変更されることがあります。' },
      { heading: '招待のキャンセル', body: '招待者は、招待されたユーザーが招待を受け入れる前に限りキャンセルできます。受け入れ後は、招待されたユーザーのオンボーディング進捗と監査記録を保護するため、キャンセルできません。' },
      { heading: 'ウォレットの安全', body: 'VeInviteは非カストディアル型サービスです。VeInviteは秘密鍵やシードフレーズを要求または保存しません。VeInvite、コミュニティメンバー、またはサポートを名乗る人物に秘密鍵やシードフレーズを共有しないでください。' },
      { heading: 'サービスの利用可能性', body: 'ブロックチェーンノード、ウォレット、VeBetterDAOコントラクト、第三者アプリでは遅延や障害が発生する場合があります。安全に検証を完了できない場合、VeInviteは一部の操作を一時的に制限することがあり、サービスやエコシステムルールの変化に応じて本規約を更新する場合があります。' },
    ],
    back: 'VeInviteに戻る',
  },
  it: {
    eyebrow: 'DOCUMENTO LEGALE',
    title: 'Termini di utilizzo di VeInvite',
    updated: 'Ultimo aggiornamento: 31 agosto 2026',
    intro: 'VeInvite è un servizio di onboarding tramite inviti e di riattivazione degli utenti per l’ecosistema VeBetterDAO. Utilizzando VeInvite accetti questi termini e ti impegni a rispettare le regole VeBetterDAO applicabili e i termini delle app o dei wallet di terze parti che utilizzi.',
    sections: [
      { heading: 'Idoneità al referral', body: 'L’idoneità viene determinata secondo le regole di verifica di VeInvite, che includono il controllo del wallet, la cronologia precedente all’ingresso, le attività di onboarding richieste, la partecipazione alla governance, la prevenzione dei duplicati e i controlli antiabuso. Un wallet può essere considerato nuovo quando non viene rilevata alcuna precedente attività VeBetterDAO con ricompense o Allocation Voting. Un wallet con attività più vecchia può essere considerato di un utente di ritorno se non viene rilevata attività con ricompense o Allocation Voting dall’inizio dei precedenti 12 round VeBetterDAO completati fino al controllo di idoneità. Utenti esistenti con attività recente, auto-referral, referral duplicati, attività manipolate o referral non verificabili possono essere rifiutati o esclusi dalle ricompense.' },
      { heading: 'A chi spetta la ricompensa per il referral', body: 'L’attività dell’invitato nelle dApp, la conversione da B3TR a VOT3 e l’Allocation Voting sono criteri di verifica dell’onboarding. VeInvite non paga B3TR aggiuntivi all’invitato semplicemente per aver svolto le stesse azioni. Quando le ricompense finanziate sono attive, l’invitante che porta un nuovo utente o un utente di ritorno idoneo fino al completamento dell’onboarding verificato può avere diritto a una ricompensa dopo la verifica finale.' },
      { heading: 'Le ricompense non sono garantite', body: 'Le ricompense referral in B3TR non sono fisse né garantite. L’idoneità dell’invitante, i tempi di pagamento e gli importi possono dipendere dalle prove di onboarding, dalla revisione Sybil finale, dai fondi disponibili e riportati nel pool di ricompense VeInvite, dai risultati delle allocazioni VeBetterDAO e dalle regole attuali dell’ecosistema. La distribuzione può essere sospesa o modificata per motivi di sicurezza, affidabilità tecnica o conformità alle regole.' },
      { heading: 'Annullamento dell’invito', body: 'L’invitante può annullare un invito solo prima che venga accettato dall’invitato. Dopo l’accettazione, l’invito non può essere annullato, per proteggere l’avanzamento dell’onboarding e la cronologia di audit dell’invitato.' },
      { heading: 'Sicurezza del wallet', body: 'VeInvite è un servizio non-custodial. VeInvite non richiede né conserva chiavi private o seed phrase. Non condividere mai una chiave privata o una seed phrase con VeInvite, con membri della community o con chiunque affermi di fornire assistenza.' },
      { heading: 'Disponibilità del servizio', body: 'Nodi blockchain, wallet, contratti VeBetterDAO e app di terze parti possono subire ritardi o interruzioni. VeInvite può limitare temporaneamente alcune operazioni quando la verifica non può essere completata in sicurezza e può aggiornare questi termini con l’evoluzione del servizio e delle regole dell’ecosistema.' },
    ],
    back: 'Torna a VeInvite',
  },
  tr: {
    eyebrow: 'YASAL BELGE',
    title: 'VeInvite Kullanım Koşulları',
    updated: 'Son güncelleme: 31 Ağustos 2026',
    intro: 'VeInvite, VeBetterDAO ekosistemi için davet tabanlı yeni kullanıcı katılımı ve geri dönen kullanıcıların yeniden etkinleştirilmesi hizmetidir. VeInvite’ı kullanarak bu koşullara, geçerli VeBetterDAO kurallarına ve kullandığınız üçüncü taraf uygulama veya cüzdanların koşullarına uymayı kabul edersiniz.',
    sections: [
      { heading: 'Davet uygunluğu', body: 'Davet uygunluğu; cüzdan kontrolü, katılım öncesi geçmiş kontrolleri, gerekli onboarding faaliyetleri, yönetişim katılımı, mükerrer katılımın önlenmesi ve kötüye kullanım incelemesi dahil VeInvite doğrulama kurallarına göre belirlenir. Daha önce ödüllendirilmiş veya Allocation Voting içeren VeBetterDAO faaliyeti bulunmayan bir cüzdan yeni kullanıcı olarak uygun sayılabilir. Daha eski faaliyeti bulunan bir cüzdan, önceki 12 tamamlanmış VeBetterDAO turunun başlangıcından uygunluk kontrolüne kadar ödüllendirilmiş veya Allocation Voting faaliyeti bulunmazsa geri dönen kullanıcı olarak uygun sayılabilir. Yakın zamanda ilgili faaliyeti bulunan mevcut kullanıcılar, kendi kendine yönlendirme, mükerrer yönlendirmeler, manipüle edilmiş faaliyetler veya doğrulanamayan yönlendirmeler reddedilebilir ya da ödüllerden çıkarılabilir.' },
      { heading: 'Davet ödülü kimin içindir', body: 'Davet edilen kullanıcının dApp faaliyeti, B3TR’den VOT3’e dönüşümü ve Allocation Voting katılımı onboarding doğrulama kriterleridir. VeInvite, yalnızca bu aynı işlemleri yaptığı için davet edilen kullanıcıya ek B3TR ödemez. Fonlanmış davet ödülleri etkin olduğunda, uygun yeni veya geri dönen kullanıcıyı doğrulanmış onboarding sürecinin sonuna kadar getiren davet sahibi, nihai doğrulamadan sonra davet ödülüne hak kazanabilir.' },
      { heading: 'Ödüller garanti edilmez', body: 'B3TR davet ödülleri sabit veya garantili değildir. Davet sahibinin uygunluğu, ödeme zamanı ve tutarı; onboarding kanıtlarına, nihai Sybil incelemesine, VeInvite davet ödül havuzundaki kullanılabilir ve devreden fonlara, VeBetterDAO tahsis sonuçlarına ve güncel ekosistem kurallarına bağlı olabilir. Güvenlik, teknik güvenilirlik veya kurallara uyum gerektiğinde ödül dağıtımı duraklatılabilir veya değiştirilebilir.' },
      { heading: 'Daveti iptal etme', body: 'Davet sahibi, davet edilen kişi daveti kabul etmeden önce daveti iptal edebilir. Davet kabul edildikten sonra, davet edilen kişinin onboarding ilerlemesini ve denetim geçmişini korumak için iptal edilemez.' },
      { heading: 'Cüzdan güvenliği', body: 'VeInvite saklama hizmeti sunmayan (non-custodial) bir hizmettir. VeInvite özel anahtar veya seed phrase istemez ve saklamaz. Özel anahtarınızı veya seed phrase’inizi VeInvite, topluluk üyeleri ya da destek sunduğunu iddia eden herhangi biriyle paylaşmayın.' },
      { heading: 'Hizmet kullanılabilirliği', body: 'Blokzincir düğümleri, cüzdanlar, VeBetterDAO sözleşmeleri ve üçüncü taraf uygulamalar gecikme veya kesinti yaşayabilir. Doğrulama güvenli biçimde tamamlanamadığında VeInvite bazı işlemleri geçici olarak sınırlandırabilir ve hizmet ile ekosistem kuralları geliştikçe bu koşulları güncelleyebilir.' },
    ],
    back: 'VeInvite’a dön',
  },
  nl: {
    eyebrow: 'JURIDISCH DOCUMENT',
    title: 'Gebruiksvoorwaarden van VeInvite',
    updated: 'Laatst bijgewerkt: 31 augustus 2026',
    intro: 'VeInvite is een uitnodigingsgebaseerde onboarding- en reactivatiedienst voor het VeBetterDAO-ecosysteem. Door VeInvite te gebruiken ga je akkoord met deze voorwaarden en met de toepasselijke VeBetterDAO-regels en de voorwaarden van apps of wallets van derden die je gebruikt.',
    sections: [
      { heading: 'Geschiktheid voor verwijzingen', body: 'De geschiktheid wordt bepaald volgens de verificatieregels van VeInvite, waaronder controle over de wallet, controle van de voorgeschiedenis, vereiste onboardingactiviteiten, deelname aan governance, preventie van dubbele deelname en controles op misbruik. Een wallet kan als nieuw worden aangemerkt wanneer geen eerdere VeBetterDAO-activiteit met beloningen of Allocation Voting wordt gevonden. Een wallet met oudere activiteit kan als terugkerend worden aangemerkt wanneer vanaf het begin van de vorige 12 voltooide VeBetterDAO-rondes tot de geschiktheidscontrole geen activiteit met beloningen of Allocation Voting wordt gevonden. Bestaande gebruikers met recente relevante activiteit, zelfverwijzingen, dubbele verwijzingen, gemanipuleerde activiteit of niet-verifieerbare verwijzingen kunnen worden geweigerd of uitgesloten van beloningen.' },
      { heading: 'Voor wie de verwijzingsbeloning is', body: 'De dApp-activiteit van de genodigde, de omzetting van B3TR naar VOT3 en Allocation Voting zijn criteria om de onboarding te verifiëren. VeInvite betaalt de genodigde niet extra in B3TR enkel voor het uitvoeren van diezelfde handelingen. Wanneer gefinancierde verwijzingsbeloningen actief zijn, kan de uitnodiger die een geschikte nieuwe of terugkerende gebruiker door de geverifieerde onboarding heen helpt na de definitieve verificatie in aanmerking komen voor een beloning.' },
      { heading: 'Beloningen zijn niet gegarandeerd', body: 'B3TR-verwijzingsbeloningen zijn niet vast of gegarandeerd. De geschiktheid van de uitnodiger, het uitbetalingsmoment en het bedrag kunnen afhangen van onboardingbewijs, de definitieve Sybil-controle, beschikbare en doorgeschoven middelen in de VeInvite-beloningspool, VeBetterDAO-toewijzingsresultaten en de actuele ecosysteemregels. Uitbetaling kan worden gepauzeerd of gewijzigd wanneer dat nodig is voor beveiliging, technische betrouwbaarheid of naleving van regels.' },
      { heading: 'Een uitnodiging annuleren', body: 'Een uitnodiger kan een uitnodiging alleen annuleren voordat deze door de genodigde is geaccepteerd. Na acceptatie kan de uitnodiging niet meer worden geannuleerd om de onboardingvoortgang en auditgeschiedenis van de genodigde te beschermen.' },
      { heading: 'Walletveiligheid', body: 'VeInvite is een non-custodial dienst. VeInvite vraagt niet om privésleutels of seed phrases en slaat deze niet op. Deel nooit een privésleutel of seed phrase met VeInvite, een communitylid of iemand die beweert ondersteuning te bieden.' },
      { heading: 'Beschikbaarheid van de dienst', body: 'Blockchainnodes, wallets, VeBetterDAO-contracten en apps van derden kunnen vertragingen of storingen ondervinden. VeInvite kan bepaalde handelingen tijdelijk beperken wanneer verificatie niet veilig kan worden afgerond en kan deze voorwaarden bijwerken wanneer de dienst en de ecosysteemregels veranderen.' },
    ],
    back: 'Terug naar VeInvite',
  },
  de: {
    eyebrow: 'RECHTLICHES DOKUMENT',
    title: 'Nutzungsbedingungen von VeInvite',
    updated: 'Zuletzt aktualisiert: 31. August 2026',
    intro: 'VeInvite ist ein einladungsbasierter Onboarding- und Reaktivierungsdienst für das VeBetterDAO-Ökosystem. Durch die Nutzung von VeInvite stimmst du diesen Bedingungen zu und verpflichtest dich, die geltenden VeBetterDAO-Regeln sowie die Bedingungen der von dir genutzten Drittanbieter-Apps oder Wallets einzuhalten.',
    sections: [
      { heading: 'Teilnahmeberechtigung für Empfehlungen', body: 'Die Berechtigung wird anhand der Verifizierungsregeln von VeInvite bestimmt. Dazu gehören die Kontrolle über die Wallet, Prüfungen der bisherigen Aktivität, erforderliche Onboarding-Aktivitäten, Governance-Teilnahme, Vermeidung von Mehrfachteilnahmen und Missbrauchsprüfungen. Eine Wallet kann als neu gelten, wenn keine frühere VeBetterDAO-Aktivität mit Belohnungen oder Allocation Voting gefunden wird. Eine Wallet mit älterer Aktivität kann als zurückkehrend gelten, wenn vom Beginn der vorherigen 12 abgeschlossenen VeBetterDAO-Runden bis zur Berechtigungsprüfung keine Aktivität mit Belohnungen oder Allocation Voting festgestellt wird. Bestehende Nutzer mit aktueller relevanter Aktivität, Selbstempfehlungen, doppelte Empfehlungen, manipulierte Aktivitäten oder nicht verifizierbare Empfehlungen können abgelehnt oder von Belohnungen ausgeschlossen werden.' },
      { heading: 'Für wen die Empfehlungsbelohnung bestimmt ist', body: 'Die dApp-Aktivität des eingeladenen Nutzers, die Umwandlung von B3TR in VOT3 und Allocation Voting sind Kriterien zur Verifizierung des Onboardings. VeInvite zahlt dem eingeladenen Nutzer nicht allein für dieselben Handlungen zusätzliches B3TR. Wenn finanzierte Empfehlungsbelohnungen aktiviert sind, kann der Einladende, der einen berechtigten neuen oder zurückkehrenden Nutzer durch das verifizierte Onboarding führt, nach der abschließenden Prüfung für eine Empfehlungsbelohnung berechtigt sein.' },
      { heading: 'Belohnungen sind nicht garantiert', body: 'B3TR-Empfehlungsbelohnungen sind weder fest noch garantiert. Berechtigung, Auszahlungszeitpunkt und Höhe können von Onboarding-Nachweisen, der abschließenden Sybil-Prüfung, verfügbaren und übertragenen Mitteln im VeInvite-Empfehlungsbelohnungspool, VeBetterDAO-Zuteilungsergebnissen und den aktuellen Ökosystemregeln abhängen. Die Verteilung kann aus Sicherheitsgründen, zur technischen Zuverlässigkeit oder zur Einhaltung von Regeln pausiert oder geändert werden.' },
      { heading: 'Einladung stornieren', body: 'Ein Einladender kann eine Einladung nur stornieren, bevor sie vom eingeladenen Nutzer angenommen wurde. Nach der Annahme kann sie nicht mehr storniert werden, um den Onboarding-Fortschritt und die Prüfhistorie des eingeladenen Nutzers zu schützen.' },
      { heading: 'Wallet-Sicherheit', body: 'VeInvite ist ein Non-Custodial-Dienst. VeInvite fordert keine privaten Schlüssel oder Seed-Phrasen an und speichert sie nicht. Teile niemals einen privaten Schlüssel oder eine Seed-Phrase mit VeInvite, einem Community-Mitglied oder jemandem, der behauptet, Support anzubieten.' },
      { heading: 'Verfügbarkeit des Dienstes', body: 'Blockchain-Nodes, Wallets, VeBetterDAO-Verträge und Drittanbieter-Apps können Verzögerungen oder Ausfälle erleben. VeInvite kann bestimmte Aktionen vorübergehend einschränken, wenn eine sichere Verifizierung nicht möglich ist, und diese Bedingungen aktualisieren, wenn sich der Dienst oder die Ökosystemregeln weiterentwickeln.' },
    ],
    back: 'Zurück zu VeInvite',
  },
  fr: {
    eyebrow: 'DOCUMENT JURIDIQUE',
    title: 'Conditions d’utilisation de VeInvite',
    updated: 'Dernière mise à jour : 31 août 2026',
    intro: 'VeInvite est un service d’onboarding par invitation et de réactivation des utilisateurs pour l’écosystème VeBetterDAO. En utilisant VeInvite, vous acceptez les présentes conditions ainsi que les règles VeBetterDAO applicables et les conditions des applications ou wallets tiers que vous utilisez.',
    sections: [
      { heading: 'Éligibilité au parrainage', body: 'L’éligibilité est déterminée selon les règles de vérification de VeInvite, notamment le contrôle du wallet, l’historique avant l’entrée, les activités d’onboarding requises, la participation à la gouvernance, la prévention des doublons et les contrôles anti-abus. Un wallet peut être considéré comme nouveau lorsqu’aucune activité VeBetterDAO antérieure avec récompense ou Allocation Voting n’est trouvée. Un wallet ayant une activité plus ancienne peut être considéré comme celui d’un utilisateur de retour si aucune activité avec récompense ou Allocation Voting n’est constatée depuis le début des 12 derniers rounds VeBetterDAO terminés jusqu’au contrôle d’éligibilité. Les utilisateurs existants ayant une activité récente pertinente, les auto-parrainages, les parrainages en double, les activités manipulées ou les parrainages non vérifiables peuvent être refusés ou exclus des récompenses.' },
      { heading: 'À qui s’adresse la récompense de parrainage', body: 'L’activité de l’invité dans les dApps, la conversion de B3TR en VOT3 et l’Allocation Voting sont des critères de vérification de l’onboarding. VeInvite ne verse pas de B3TR supplémentaire à l’invité simplement pour avoir effectué ces mêmes actions. Lorsque les récompenses de parrainage financées sont actives, l’invitant qui amène un nouvel utilisateur ou un utilisateur de retour éligible jusqu’à la fin d’un onboarding vérifié peut être éligible à une récompense après la vérification finale.' },
      { heading: 'Les récompenses ne sont pas garanties', body: 'Les récompenses de parrainage en B3TR ne sont ni fixes ni garanties. L’éligibilité de l’invitant, le moment du paiement et le montant peuvent dépendre des preuves d’onboarding, du contrôle Sybil final, des fonds disponibles et reportés dans le pool de récompenses VeInvite, des résultats d’allocation VeBetterDAO et des règles actuelles de l’écosystème. La distribution peut être suspendue ou modifiée lorsque cela est nécessaire pour la sécurité, la fiabilité technique ou le respect des règles.' },
      { heading: 'Annulation d’une invitation', body: 'L’invitant peut annuler une invitation uniquement avant son acceptation par l’invité. Une fois acceptée, elle ne peut plus être annulée afin de protéger la progression de l’onboarding et l’historique d’audit de l’invité.' },
      { heading: 'Sécurité du wallet', body: 'VeInvite est un service non custodial. VeInvite ne demande ni ne conserve de clés privées ou de seed phrases. Ne partagez jamais une clé privée ou une seed phrase avec VeInvite, un membre de la communauté ou toute personne prétendant fournir une assistance.' },
      { heading: 'Disponibilité du service', body: 'Les nœuds blockchain, wallets, contrats VeBetterDAO et applications tierces peuvent connaître des retards ou des interruptions. VeInvite peut limiter temporairement certaines actions lorsque la vérification ne peut pas être réalisée en toute sécurité et peut mettre à jour les présentes conditions à mesure que le service et les règles de l’écosystème évoluent.' },
    ],
    back: 'Retour à VeInvite',
  },
};

export const LEGAL_COPY: Record<
  LegalDocumentKind,
  Record<Locale, LegalDocumentCopy>
> = {
  privacy,
  terms,
};
