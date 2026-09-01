import type { Locale } from './locales';

type ProfilePrivacyCopy = {
  updated: string;
  heading: string;
  body: string;
};

export const PROFILE_PRIVACY_COPY: Record<Locale, ProfilePrivacyCopy> = {
  en: {
    updated: 'Last updated: September 1, 2026',
    heading: 'Optional public profile',
    body: 'If you choose to create a VeInvite public profile, VeInvite stores the profile name and profile image you provide and associates them with your wallet address. This information is intended to be publicly displayed on VeInvite surfaces such as the leaderboard and Network. Creating a profile is optional; if no profile is set, VeInvite may display a shortened wallet address instead. Profile data does not affect referral eligibility, ranking calculations, Sybil decisions, or rewards.',
  },
  ko: {
    updated: '최종 업데이트: 2026년 9월 1일',
    heading: '선택적 공개 프로필',
    body: '사용자가 VeInvite 공개 프로필을 설정하면 VeInvite는 사용자가 입력한 프로필 이름과 프로필 이미지를 지갑 주소와 연결해 저장합니다. 이 정보는 리더보드와 네트워크 등 VeInvite의 공개 화면에 표시될 수 있습니다. 프로필 설정은 선택 사항이며, 프로필을 설정하지 않으면 마스킹된 지갑 주소가 대신 표시될 수 있습니다. 프로필 정보는 초대 자격, 순위 계산, Sybil 판정 또는 보상에 영향을 주지 않습니다.',
  },
  zh: {
    updated: '最后更新：2026年9月1日',
    heading: '可选的公开资料',
    body: '如果你选择创建 VeInvite 公开资料，VeInvite 会将你提供的资料名称和头像与钱包地址关联保存。这些信息用于在排行榜和 Network 等 VeInvite 公开页面中展示。创建资料完全自愿；如果未设置资料，VeInvite 可能改为显示缩短的钱包地址。资料信息不会影响邀请资格、排名计算、Sybil 判断或奖励。',
  },
  hi: {
    updated: 'अंतिम अपडेट: 1 सितंबर 2026',
    heading: 'वैकल्पिक सार्वजनिक प्रोफ़ाइल',
    body: 'यदि आप VeInvite की सार्वजनिक प्रोफ़ाइल बनाते हैं, तो VeInvite आपके दिए गए प्रोफ़ाइल नाम और तस्वीर को आपके वॉलेट पते से जोड़कर संग्रहीत करता है। यह जानकारी लीडरबोर्ड और Network जैसी VeInvite की सार्वजनिक स्क्रीन पर दिखाई जा सकती है। प्रोफ़ाइल बनाना वैकल्पिक है; प्रोफ़ाइल न होने पर VeInvite छोटा किया हुआ वॉलेट पता दिखा सकता है। प्रोफ़ाइल जानकारी रेफ़रल पात्रता, रैंकिंग गणना, Sybil निर्णय या पुरस्कारों को प्रभावित नहीं करती।',
  },
  es: {
    updated: 'Última actualización: 1 de septiembre de 2026',
    heading: 'Perfil público opcional',
    body: 'Si decides crear un perfil público de VeInvite, VeInvite guarda el nombre y la imagen de perfil que proporciones y los asocia a la dirección de tu cartera. Esta información está destinada a mostrarse públicamente en superficies de VeInvite como la clasificación y Network. Crear un perfil es opcional; si no lo configuras, VeInvite puede mostrar una dirección de cartera abreviada. Los datos del perfil no afectan a la elegibilidad de las invitaciones, el cálculo de la clasificación, las decisiones Sybil ni las recompensas.',
  },
  ja: {
    updated: '最終更新：2026年9月1日',
    heading: '任意の公開プロフィール',
    body: 'VeInviteの公開プロフィールを設定すると、入力したプロフィール名と画像がウォレットアドレスに関連付けて保存されます。これらの情報は、ランキングやNetworkなどVeInviteの公開画面に表示されます。プロフィール設定は任意で、設定しない場合は短縮したウォレットアドレスが表示されることがあります。プロフィール情報は招待資格、ランキング計算、Sybil判定、報酬には影響しません。',
  },
  it: {
    updated: 'Ultimo aggiornamento: 1 settembre 2026',
    heading: 'Profilo pubblico facoltativo',
    body: 'Se scegli di creare un profilo pubblico VeInvite, VeInvite salva il nome e l’immagine del profilo che fornisci associandoli al tuo indirizzo wallet. Queste informazioni sono destinate a essere mostrate pubblicamente nelle aree VeInvite come la classifica e il Network. Creare un profilo è facoltativo; senza profilo VeInvite può mostrare un indirizzo wallet abbreviato. I dati del profilo non influenzano l’idoneità degli inviti, il calcolo della classifica, le decisioni Sybil o le ricompense.',
  },
  tr: {
    updated: 'Son güncelleme: 1 Eylül 2026',
    heading: 'İsteğe bağlı herkese açık profil',
    body: 'VeInvite’ta herkese açık bir profil oluşturmayı seçersen verdiğin profil adı ve görseli cüzdan adresinle ilişkilendirilerek saklanır. Bu bilgiler VeInvite sıralaması ve Network gibi herkese açık alanlarda gösterilmek üzere kullanılır. Profil oluşturmak isteğe bağlıdır; profil ayarlamazsan VeInvite kısaltılmış cüzdan adresini gösterebilir. Profil verileri davet uygunluğunu, sıralama hesaplamasını, Sybil kararlarını veya ödülleri etkilemez.',
  },
  nl: {
    updated: 'Laatst bijgewerkt: 1 september 2026',
    heading: 'Optioneel openbaar profiel',
    body: 'Als je een openbaar VeInvite-profiel aanmaakt, bewaart VeInvite de profielnaam en profielfoto die je opgeeft en koppelt deze aan je walletadres. Deze informatie is bedoeld voor openbare weergave op VeInvite, bijvoorbeeld in de ranglijst en Network. Een profiel is optioneel; zonder profiel kan VeInvite een verkort walletadres tonen. Profielgegevens hebben geen invloed op uitnodigingsgeschiktheid, rangberekeningen, Sybil-beslissingen of beloningen.',
  },
  de: {
    updated: 'Zuletzt aktualisiert: 1. September 2026',
    heading: 'Optionales öffentliches Profil',
    body: 'Wenn du ein öffentliches VeInvite-Profil erstellst, speichert VeInvite den von dir angegebenen Profilnamen und das Profilbild und verknüpft sie mit deiner Wallet-Adresse. Diese Informationen sind für die öffentliche Anzeige in VeInvite vorgesehen, etwa in der Rangliste und im Network. Ein Profil ist freiwillig; ohne Profil kann VeInvite stattdessen eine gekürzte Wallet-Adresse anzeigen. Profildaten beeinflussen weder Einladungsberechtigung noch Rangberechnung, Sybil-Entscheidungen oder Belohnungen.',
  },
  fr: {
    updated: 'Dernière mise à jour : 1 septembre 2026',
    heading: 'Profil public facultatif',
    body: 'Si vous choisissez de créer un profil public VeInvite, VeInvite enregistre le nom et l’image de profil que vous fournissez et les associe à votre adresse de wallet. Ces informations sont destinées à être affichées publiquement dans VeInvite, notamment dans le classement et le Network. La création d’un profil est facultative ; sans profil, VeInvite peut afficher une adresse de wallet abrégée. Les données du profil n’influencent ni l’éligibilité des invitations, ni le calcul du classement, ni les décisions Sybil, ni les récompenses.',
  },
};
