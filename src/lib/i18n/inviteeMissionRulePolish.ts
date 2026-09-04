import { INVITEE_COPY } from './inviteeCopy';

type MissionRulePatch = Pick<
  (typeof INVITEE_COPY)[string],
  | 'appMissionDescription'
  | 'conversionMissionDescription'
>;

const MISSION_RULE_PATCHES: Record<string, MissionRulePatch> = {
  en: {
    appMissionDescription: 'Use VeBetterDAO dApps and earn a B3TR reward from each one to complete this mission.',
    conversionMissionDescription: 'After your first dApp reward, convert B3TR to VOT3 once.',
  },
  ko: {
    appMissionDescription: 'VeBetterDAO dApp을 이용해 각각 B3TR 보상을 받으면 완료돼요.',
    conversionMissionDescription: '첫 dApp 보상을 받은 뒤 B3TR을 VOT3로 1회 전환하세요.',
  },
  zh: {
    appMissionDescription: '使用 VeBetterDAO dApp，并从每个应用获得 B3TR 奖励即可完成。',
    conversionMissionDescription: '获得第一笔 dApp 奖励后，完成 1 次 B3TR → VOT3 转换。',
  },
  hi: {
    appMissionDescription: 'VeBetterDAO dApps का उपयोग करें और हर dApp से B3TR रिवॉर्ड पाकर मिशन पूरा करें।',
    conversionMissionDescription: 'पहला dApp रिवॉर्ड मिलने के बाद B3TR को VOT3 में एक बार बदलें।',
  },
  es: {
    appMissionDescription: 'Usa dApps de VeBetterDAO y obtén una recompensa B3TR en cada una para completar la misión.',
    conversionMissionDescription: 'Después de tu primera recompensa de una dApp, convierte B3TR a VOT3 una vez.',
  },
  ja: {
    appMissionDescription: 'VeBetterDAOのdAppを利用し、それぞれでB3TR報酬を獲得すると完了です。',
    conversionMissionDescription: '最初のdApp報酬を受け取った後、B3TRをVOT3へ1回変換してください。',
  },
  it: {
    appMissionDescription: 'Usa le dApp di VeBetterDAO e ottieni una ricompensa B3TR da ciascuna per completare la missione.',
    conversionMissionDescription: 'Dopo la prima ricompensa da una dApp, converti B3TR in VOT3 una volta.',
  },
  tr: {
    appMissionDescription: 'VeBetterDAO dApp’lerini kullan ve her birinden B3TR ödülü alarak görevi tamamla.',
    conversionMissionDescription: 'İlk dApp ödülünden sonra B3TR’yi VOT3’e bir kez dönüştür.',
  },
  nl: {
    appMissionDescription: 'Gebruik VeBetterDAO-dApps en ontvang bij elke dApp een B3TR-beloning om de missie te voltooien.',
    conversionMissionDescription: 'Zet na je eerste dApp-beloning één keer B3TR om naar VOT3.',
  },
  de: {
    appMissionDescription: 'Nutze VeBetterDAO-dApps und erhalte bei jeder eine B3TR-Belohnung, um die Mission abzuschließen.',
    conversionMissionDescription: 'Wandle nach deiner ersten dApp-Belohnung einmal B3TR in VOT3 um.',
  },
  fr: {
    appMissionDescription: 'Utilisez les dApps VeBetterDAO et obtenez une récompense B3TR sur chacune pour terminer la mission.',
    conversionMissionDescription: 'Après votre première récompense dApp, convertissez une fois des B3TR en VOT3.',
  },
  ar: {
    appMissionDescription: 'استخدم تطبيقات VeBetterDAO واحصل على مكافأة B3TR من كل تطبيق لإكمال المهمة.',
    conversionMissionDescription: 'بعد أول مكافأة dApp، حوّل B3TR إلى VOT3 مرة واحدة.',
  },
  bn: {
    appMissionDescription: 'VeBetterDAO dApp ব্যবহার করে প্রতিটি dApp থেকে B3TR পুরস্কার পেলে মিশনটি সম্পন্ন হবে।',
    conversionMissionDescription: 'প্রথম dApp পুরস্কার পাওয়ার পর B3TR একবার VOT3-এ রূপান্তর করুন।',
  },
  pt: {
    appMissionDescription: 'Use dApps da VeBetterDAO e receba uma recompensa B3TR em cada uma para concluir a missão.',
    conversionMissionDescription: 'Após sua primeira recompensa de dApp, converta B3TR em VOT3 uma vez.',
  },
  ru: {
    appMissionDescription: 'Используйте dApp VeBetterDAO и получите награду B3TR в каждом из них, чтобы завершить миссию.',
    conversionMissionDescription: 'После первой награды в dApp один раз конвертируйте B3TR в VOT3.',
  },
  id: {
    appMissionDescription: 'Gunakan dApp VeBetterDAO dan dapatkan hadiah B3TR dari masing-masing dApp untuk menyelesaikan misi.',
    conversionMissionDescription: 'Setelah hadiah dApp pertama, konversikan B3TR ke VOT3 satu kali.',
  },
  vi: {
    appMissionDescription: 'Sử dụng các dApp VeBetterDAO và nhận phần thưởng B3TR từ mỗi dApp để hoàn thành nhiệm vụ.',
    conversionMissionDescription: 'Sau phần thưởng dApp đầu tiên, hãy chuyển B3TR sang VOT3 một lần.',
  },
  'zh-tw': {
    appMissionDescription: '使用 VeBetterDAO dApp，並從每個應用取得 B3TR 獎勵即可完成。',
    conversionMissionDescription: '取得第一筆 dApp 獎勵後，完成 1 次 B3TR → VOT3 轉換。',
  },
  sv: {
    appMissionDescription: 'Använd VeBetterDAO-dApps och få en B3TR-belöning från var och en för att slutföra uppdraget.',
    conversionMissionDescription: 'Efter din första dApp-belöning, konvertera B3TR till VOT3 en gång.',
  },
  ro: {
    appMissionDescription: 'Folosește dApp-urile VeBetterDAO și primește o recompensă B3TR din fiecare pentru a finaliza misiunea.',
    conversionMissionDescription: 'După prima recompensă dApp, convertește B3TR în VOT3 o singură dată.',
  },
  ur: {
    appMissionDescription: 'VeBetterDAO dApps استعمال کریں اور مشن مکمل کرنے کے لیے ہر dApp سے B3TR انعام حاصل کریں۔',
    conversionMissionDescription: 'پہلا dApp انعام ملنے کے بعد B3TR کو ایک بار VOT3 میں تبدیل کریں۔',
  },
  pcm: {
    appMissionDescription: 'Use VeBetterDAO dApps and collect B3TR reward from each one to complete the mission.',
    conversionMissionDescription: 'After your first dApp reward, convert B3TR to VOT3 one time.',
  },
  arz: {
    appMissionDescription: 'استخدم dApps بتاعة VeBetterDAO وخد مكافأة B3TR من كل واحد عشان تكمّل المهمة.',
    conversionMissionDescription: 'بعد أول مكافأة dApp، حوّل B3TR لـ VOT3 مرة واحدة.',
  },
  mr: {
    appMissionDescription: 'VeBetterDAO dApps वापरा आणि प्रत्येक dApp मधून B3TR रिवॉर्ड मिळवून मिशन पूर्ण करा.',
    conversionMissionDescription: 'पहिला dApp रिवॉर्ड मिळाल्यानंतर B3TR चे VOT3 मध्ये एकदा रूपांतर करा.',
  },
  te: {
    appMissionDescription: 'VeBetterDAO dApps ఉపయోగించి ప్రతి dApp నుంచి B3TR రివార్డ్ పొందితే మిషన్ పూర్తవుతుంది.',
    conversionMissionDescription: 'మొదటి dApp రివార్డ్ వచ్చిన తర్వాత B3TRను VOT3గా ఒకసారి మార్చండి.',
  },
  sw: {
    appMissionDescription: 'Tumia dApp za VeBetterDAO na upate zawadi ya B3TR kutoka kila moja ili kukamilisha misheni.',
    conversionMissionDescription: 'Baada ya zawadi yako ya kwanza ya dApp, badilisha B3TR kuwa VOT3 mara moja.',
  },
  ha: {
    appMissionDescription: 'Yi amfani da VeBetterDAO dApps kuma ka samu ladan B3TR daga kowanne domin kammala aikin.',
    conversionMissionDescription: 'Bayan ladan dApp na farko, sauya B3TR zuwa VOT3 sau ɗaya.',
  },
};

for (const [locale, patch] of Object.entries(MISSION_RULE_PATCHES)) {
  if (!INVITEE_COPY[locale]) continue;
  Object.assign(INVITEE_COPY[locale], patch);
}
