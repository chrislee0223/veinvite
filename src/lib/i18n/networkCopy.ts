import type { SupportedLocale } from './locales';

type NetworkCopy = {
  navLabel: string;
  status: string;
  title: string;
  description: string;
};

export const NETWORK_COPY: Record<SupportedLocale, NetworkCopy> = {
  en: {
    navLabel: 'Network',
    status: 'COMING SOON',
    title: 'Your network is coming soon',
    description: 'We are preparing a view where you can see the friends you invited and the VeInvite network that grows from them at a glance.',
  },
  ko: {
    navLabel: '네트워크',
    status: '준비 중',
    title: '네트워크를 준비 중이에요',
    description: '초대한 친구와 그 아래로 이어지는 VeInvite 네트워크를 한눈에 확인할 수 있게 준비 중이에요.',
  },
  zh: {
    navLabel: '网络',
    status: '即将上线',
    title: '网络功能即将上线',
    description: '我们正在准备一个页面，让你可以一目了然地查看你邀请的好友，以及从他们继续扩展的 VeInvite 网络。',
  },
  hi: {
    navLabel: 'नेटवर्क',
    status: 'जल्द आ रहा है',
    title: 'आपका नेटवर्क जल्द आ रहा है',
    description: 'हम एक ऐसा दृश्य तैयार कर रहे हैं जहाँ आप अपने आमंत्रित दोस्तों और उनसे आगे बढ़ते VeInvite नेटवर्क को एक नज़र में देख सकेंगे।',
  },
  es: {
    navLabel: 'Red',
    status: 'PRÓXIMAMENTE',
    title: 'Tu red estará disponible pronto',
    description: 'Estamos preparando una vista para que puedas ver de un vistazo a los amigos que invitaste y la red de VeInvite que continúa a partir de ellos.',
  },
  ja: {
    navLabel: 'ネットワーク',
    status: '近日公開',
    title: 'ネットワーク機能を準備中です',
    description: '招待した友だちと、その先につながっていく VeInvite ネットワークをひと目で確認できる画面を準備しています。',
  },
  it: {
    navLabel: 'Rete',
    status: 'IN ARRIVO',
    title: 'La tua rete arriverà presto',
    description: 'Stiamo preparando una vista per vedere a colpo d’occhio gli amici che hai invitato e la rete VeInvite che continua a crescere da loro.',
  },
  tr: {
    navLabel: 'Ağ',
    status: 'YAKINDA',
    title: 'Ağın yakında geliyor',
    description: 'Davet ettiğin arkadaşları ve onlardan devam eden VeInvite ağını tek bakışta görebileceğin bir görünüm hazırlıyoruz.',
  },
  nl: {
    navLabel: 'Netwerk',
    status: 'BINNENKORT',
    title: 'Je netwerk komt binnenkort',
    description: 'We maken een overzicht waarin je in één oogopslag de vrienden die je hebt uitgenodigd en het VeInvite-netwerk dat daaruit verder groeit kunt zien.',
  },
  de: {
    navLabel: 'Netzwerk',
    status: 'BALD VERFÜGBAR',
    title: 'Dein Netzwerk kommt bald',
    description: 'Wir bereiten eine Ansicht vor, in der du deine eingeladenen Freunde und das daraus weiterwachsende VeInvite-Netzwerk auf einen Blick sehen kannst.',
  },
  fr: {
    navLabel: 'Réseau',
    status: 'BIENTÔT',
    title: 'Votre réseau arrive bientôt',
    description: 'Nous préparons une vue qui permettra de voir d’un coup d’œil les amis que vous avez invités et le réseau VeInvite qui se développe à partir d’eux.',
  },
  ar: {
    navLabel: 'الشبكة',
    status: 'قريبًا',
    title: 'شبكتك قادمة قريبًا',
    description: 'نجهّز عرضًا يتيح لك رؤية الأصدقاء الذين دعوتهم وشبكة VeInvite الممتدة من خلالهم في مكان واحد.',
  },
  bn: {
    navLabel: 'নেটওয়ার্ক',
    status: 'শীঘ্রই আসছে',
    title: 'আপনার নেটওয়ার্ক শীঘ্রই আসছে',
    description: 'আপনি যাদের আমন্ত্রণ করেছেন এবং তাদের থেকে এগিয়ে যাওয়া VeInvite নেটওয়ার্ক এক নজরে দেখার জন্য আমরা একটি ভিউ তৈরি করছি।',
  },
  pt: {
    navLabel: 'Rede',
    status: 'EM BREVE',
    title: 'Sua rede chega em breve',
    description: 'Estamos preparando uma visão para você acompanhar de uma só vez os amigos que convidou e a rede VeInvite que continua a partir deles.',
  },
  ru: {
    navLabel: 'Сеть',
    status: 'СКОРО',
    title: 'Ваша сеть скоро появится',
    description: 'Мы готовим экран, где можно будет сразу увидеть приглашённых вами друзей и сеть VeInvite, которая продолжает развиваться от них.',
  },
  id: {
    navLabel: 'Jaringan',
    status: 'SEGERA HADIR',
    title: 'Jaringan Anda segera hadir',
    description: 'Kami sedang menyiapkan tampilan agar Anda dapat melihat teman yang Anda undang dan jaringan VeInvite yang terus berkembang dari mereka dalam satu layar.',
  },
  vi: {
    navLabel: 'Mạng lưới',
    status: 'SẮP RA MẮT',
    title: 'Mạng lưới của bạn sắp ra mắt',
    description: 'Chúng tôi đang chuẩn bị một màn hình để bạn có thể xem nhanh những người bạn đã mời và mạng lưới VeInvite tiếp tục phát triển từ họ.',
  },
  'zh-tw': {
    navLabel: '網絡',
    status: '即將推出',
    title: '網絡功能即將推出',
    description: '我們正在準備一個頁面，讓你可以一目了然地查看你邀請的朋友，以及從他們繼續延伸的 VeInvite 網絡。',
  },
  sv: {
    navLabel: 'Nätverk',
    status: 'KOMMER SNART',
    title: 'Ditt nätverk kommer snart',
    description: 'Vi förbereder en vy där du snabbt kan se vännerna du har bjudit in och VeInvite-nätverket som fortsätter att växa från dem.',
  },
  ro: {
    navLabel: 'Rețea',
    status: 'ÎN CURÂND',
    title: 'Rețeaua ta va fi disponibilă în curând',
    description: 'Pregătim o vizualizare în care vei putea vedea dintr-o privire prietenii invitați și rețeaua VeInvite care continuă de la ei.',
  },
  ur: {
    navLabel: 'نیٹ ورک',
    status: 'جلد آ رہا ہے',
    title: 'آپ کا نیٹ ورک جلد آ رہا ہے',
    description: 'ہم ایک ایسا منظر تیار کر رہے ہیں جہاں آپ اپنے مدعو کیے گئے دوستوں اور ان سے آگے بڑھنے والے VeInvite نیٹ ورک کو ایک نظر میں دیکھ سکیں گے۔',
  },
  pcm: {
    navLabel: 'Network',
    status: 'E DEY COME',
    title: 'Your network dey come soon',
    description: 'We dey prepare one view wey go make you see the friends wey you invite and the VeInvite network wey dey grow from dem for one place.',
  },
  arz: {
    navLabel: 'الشبكة',
    status: 'قريب',
    title: 'شبكتك جاية قريب',
    description: 'بنجهّزلك شاشة تقدر تشوف فيها الناس اللي عزمتهم وشبكة VeInvite اللي بتكمل من خلالهم في مكان واحد.',
  },
  mr: {
    navLabel: 'नेटवर्क',
    status: 'लवकरच',
    title: 'तुमचे नेटवर्क लवकरच येत आहे',
    description: 'तुम्ही आमंत्रित केलेले मित्र आणि त्यांच्यापासून पुढे वाढणारे VeInvite नेटवर्क एका नजरेत पाहता येईल असा व्ह्यू आम्ही तयार करत आहोत.',
  },
  te: {
    navLabel: 'నెట్‌వర్క్',
    status: 'త్వరలో',
    title: 'మీ నెట్‌వర్క్ త్వరలో వస్తోంది',
    description: 'మీరు ఆహ్వానించిన స్నేహితులు మరియు వారి నుంచి ముందుకు విస్తరించే VeInvite నెట్‌వర్క్‌ను ఒకే చూపులో చూడగల వీక్షణను సిద్ధం చేస్తున్నాం.',
  },
  sw: {
    navLabel: 'Mtandao',
    status: 'INAKUJA HIVI KARIBUNI',
    title: 'Mtandao wako unakuja hivi karibuni',
    description: 'Tunaandaa mwonekano ambao utakuruhusu kuona kwa haraka marafiki uliowaalika na mtandao wa VeInvite unaoendelea kukua kutoka kwao.',
  },
  ha: {
    navLabel: 'Cibiyar sadarwa',
    status: 'NA TAFE ZUWA',
    title: 'Cibiyar sadarwarka na tafe zuwa',
    description: 'Muna shirya shafi da zai ba ka damar ganin abokan da ka gayyata da kuma cibiyar VeInvite da ke ci gaba daga gare su a wuri guda.',
  },
  el: {
    navLabel: 'Δίκτυο',
    status: 'ΣΥΝΤΟΜΑ',
    title: 'Το δίκτυό σου έρχεται σύντομα',
    description: 'Ετοιμάζουμε μια προβολή όπου θα μπορείς να βλέπεις με μια ματιά τους φίλους που προσκάλεσες και το δίκτυο VeInvite που αναπτύσσεται από αυτούς.',
  },
};
