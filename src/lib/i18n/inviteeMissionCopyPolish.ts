import { INVITEE_COPY } from './inviteeCopy';

type MissionCopyPolish = Pick<
  (typeof INVITEE_COPY)[string],
  'appMission' | 'ready' | 'autoProgress'
>;

const MISSION_COPY_POLISH: Record<string, MissionCopyPolish> = {
  en: {
    appMission: 'Earn B3TR from 3 different dApps',
    ready: 'Ready',
    autoProgress: 'Mission progress is verified automatically from on-chain records.',
  },
  ko: {
    appMission: '서로 다른 dApp 3개에서 B3TR 받기',
    ready: '준비됨',
    autoProgress: '미션 진행 상황은 온체인 기록을 통해 자동으로 확인해요.',
  },
  zh: {
    appMission: '在 3 个不同的 dApp 中获得 B3TR',
    ready: '已准备',
    autoProgress: '任务进度会根据链上记录自动验证。',
  },
  hi: {
    appMission: '3 अलग-अलग dApps से B3TR कमाएँ',
    ready: 'तैयार',
    autoProgress: 'मिशन की प्रगति ऑन-चेन रिकॉर्ड से अपने-आप सत्यापित होती है।',
  },
  es: {
    appMission: 'Obtén B3TR en 3 dApps diferentes',
    ready: 'Listo',
    autoProgress: 'El progreso de las misiones se verifica automáticamente con los registros on-chain.',
  },
  ja: {
    appMission: '異なる3つのdAppでB3TRを獲得',
    ready: '準備完了',
    autoProgress: 'ミッションの進行状況はオンチェーン記録から自動で確認されます。',
  },
  it: {
    appMission: 'Ottieni B3TR da 3 dApp diverse',
    ready: 'Pronto',
    autoProgress: 'I progressi delle missioni vengono verificati automaticamente dai dati on-chain.',
  },
  tr: {
    appMission: '3 farklı dApp’ten B3TR kazan',
    ready: 'Hazır',
    autoProgress: 'Görev ilerlemesi zincir üstü kayıtlardan otomatik olarak doğrulanır.',
  },
  nl: {
    appMission: 'Verdien B3TR bij 3 verschillende dApps',
    ready: 'Klaar',
    autoProgress: 'De voortgang van missies wordt automatisch gecontroleerd aan de hand van on-chain gegevens.',
  },
  de: {
    appMission: 'Verdiene B3TR bei 3 verschiedenen dApps',
    ready: 'Bereit',
    autoProgress: 'Der Missionsfortschritt wird automatisch anhand von On-Chain-Daten überprüft.',
  },
  fr: {
    appMission: 'Gagnez des B3TR sur 3 dApps différentes',
    ready: 'Prêt',
    autoProgress: 'La progression des missions est vérifiée automatiquement à partir des données on-chain.',
  },
  ar: {
    appMission: 'احصل على B3TR من 3 تطبيقات dApp مختلفة',
    ready: 'جاهز',
    autoProgress: 'يتم التحقق من تقدم المهام تلقائيًا من سجلات البلوكشين.',
  },
  bn: {
    appMission: '৩টি ভিন্ন dApp থেকে B3TR অর্জন করুন',
    ready: 'প্রস্তুত',
    autoProgress: 'মিশনের অগ্রগতি অন-চেইন রেকর্ড থেকে স্বয়ংক্রিয়ভাবে যাচাই করা হয়।',
  },
  pt: {
    appMission: 'Ganhe B3TR em 3 dApps diferentes',
    ready: 'Pronto',
    autoProgress: 'O progresso das missões é verificado automaticamente pelos registros on-chain.',
  },
  ru: {
    appMission: 'Получите B3TR в 3 разных dApp',
    ready: 'Готово',
    autoProgress: 'Прогресс миссий автоматически проверяется по ончейн-записям.',
  },
  id: {
    appMission: 'Dapatkan B3TR dari 3 dApp berbeda',
    ready: 'Siap',
    autoProgress: 'Progres misi diverifikasi otomatis dari catatan on-chain.',
  },
  vi: {
    appMission: 'Nhận B3TR từ 3 dApp khác nhau',
    ready: 'Sẵn sàng',
    autoProgress: 'Tiến độ nhiệm vụ được tự động xác minh từ dữ liệu on-chain.',
  },
  'zh-tw': {
    appMission: '從 3 個不同的 dApp 獲得 B3TR',
    ready: '已準備',
    autoProgress: '任務進度會依鏈上紀錄自動驗證。',
  },
  sv: {
    appMission: 'Tjäna B3TR från 3 olika dApps',
    ready: 'Redo',
    autoProgress: 'Uppdragens framsteg verifieras automatiskt från on-chain-data.',
  },
  ro: {
    appMission: 'Obține B3TR din 3 dApp-uri diferite',
    ready: 'Pregătit',
    autoProgress: 'Progresul misiunilor este verificat automat din înregistrările on-chain.',
  },
  ur: {
    appMission: '3 مختلف dApps سے B3TR حاصل کریں',
    ready: 'تیار',
    autoProgress: 'مشن کی پیش رفت آن چین ریکارڈز سے خودکار طور پر تصدیق کی جاتی ہے۔',
  },
  pcm: {
    appMission: 'Get B3TR from 3 different dApps',
    ready: 'Ready',
    autoProgress: 'VeInvite dey verify mission progress automatically from on-chain records.',
  },
  arz: {
    appMission: 'خد B3TR من 3 dApps مختلفين',
    ready: 'جاهز',
    autoProgress: 'تقدم المهام بيتراجع تلقائيًا من سجلات البلوكشين.',
  },
  mr: {
    appMission: '3 वेगवेगळ्या dApps मधून B3TR मिळवा',
    ready: 'तयार',
    autoProgress: 'मिशनची प्रगती ऑन-चेन नोंदींमधून आपोआप पडताळली जाते.',
  },
  te: {
    appMission: '3 వేర్వేరు dApps నుంచి B3TR పొందండి',
    ready: 'సిద్ధం',
    autoProgress: 'మిషన్ పురోగతి ఆన్-చైన్ రికార్డుల ద్వారా ఆటోమేటిక్‌గా ధృవీకరించబడుతుంది.',
  },
  sw: {
    appMission: 'Pata B3TR kutoka dApp 3 tofauti',
    ready: 'Tayari',
    autoProgress: 'Maendeleo ya misheni yanathibitishwa kiotomatiki kutoka kwenye rekodi za on-chain.',
  },
  ha: {
    appMission: 'Samu B3TR daga dApps 3 daban-daban',
    ready: 'Shirye',
    autoProgress: 'Ana tabbatar da ci gaban ayyuka ta atomatik daga bayanan on-chain.',
  },
};

for (const [locale, copy] of Object.entries(MISSION_COPY_POLISH)) {
  const target = INVITEE_COPY[locale];
  if (target) Object.assign(target, copy);
}
