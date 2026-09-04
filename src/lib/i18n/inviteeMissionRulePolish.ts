import { INVITEE_COPY } from './inviteeCopy';

type MissionRulePatch = Pick<
  (typeof INVITEE_COPY)[string],
  | 'appMissionDescription'
  | 'conversionMission'
  | 'conversionMissionDescription'
>;

const MISSION_RULE_PATCHES: Record<string, MissionRulePatch> = {
  en: {
    appMissionDescription: 'Use VeBetterDAO dApps and earn a B3TR reward from each one to complete this mission.',
    conversionMission: 'Convert B3TR → VOT3 once',
    conversionMissionDescription: 'Convert B3TR to VOT3 once to complete this mission.',
  },
  ko: {
    appMissionDescription: 'VeBetterDAO dApp을 이용해 각각 B3TR 보상을 받으면 완료돼요.',
    conversionMission: 'B3TR → VOT3 1회 전환',
    conversionMissionDescription: '수량과 관계없이 B3TR을 VOT3로 1회 전환하면 완료돼요.',
  },
  zh: {
    appMissionDescription: '使用 VeBetterDAO dApp，并从每个应用获得 B3TR 奖励即可完成。',
    conversionMission: '完成 1 次 B3TR → VOT3 转换',
    conversionMissionDescription: '将 B3TR 转换为 VOT3 1 次即可完成此任务。',
  },
  hi: {
    appMissionDescription: 'VeBetterDAO dApps का उपयोग करें और हर dApp से B3TR रिवॉर्ड पाकर मिशन पूरा करें।',
    conversionMission: 'B3TR → VOT3 एक बार बदलें',
    conversionMissionDescription: 'B3TR को VOT3 में एक बार बदलने पर यह मिशन पूरा हो जाएगा।',
  },
  es: {
    appMissionDescription: 'Usa dApps de VeBetterDAO y obtén una recompensa B3TR en cada una para completar la misión.',
    conversionMission: 'Convierte B3TR → VOT3 una vez',
    conversionMissionDescription: 'Convierte B3TR a VOT3 una vez para completar esta misión.',
  },
  ja: {
    appMissionDescription: 'VeBetterDAOのdAppを利用し、それぞれでB3TR報酬を獲得すると完了です。',
    conversionMission: 'B3TR → VOT3を1回変換',
    conversionMissionDescription: 'B3TRをVOT3へ1回変換すると、このミッションは完了です。',
  },
  it: {
    appMissionDescription: 'Usa le dApp di VeBetterDAO e ottieni una ricompensa B3TR da ciascuna per completare la missione.',
    conversionMission: 'Converti B3TR → VOT3 una volta',
    conversionMissionDescription: 'Converti B3TR in VOT3 una volta per completare questa missione.',
  },
  tr: {
    appMissionDescription: 'VeBetterDAO dApp’lerini kullan ve her birinden B3TR ödülü alarak görevi tamamla.',
    conversionMission: 'B3TR → VOT3 bir kez dönüştür',
    conversionMissionDescription: 'Bu görevi tamamlamak için B3TR’yi VOT3’e bir kez dönüştür.',
  },
  nl: {
    appMissionDescription: 'Gebruik VeBetterDAO-dApps en ontvang bij elke dApp een B3TR-beloning om de missie te voltooien.',
    conversionMission: 'Zet B3TR → VOT3 één keer om',
    conversionMissionDescription: 'Zet B3TR één keer om naar VOT3 om deze missie te voltooien.',
  },
  de: {
    appMissionDescription: 'Nutze VeBetterDAO-dApps und erhalte bei jeder eine B3TR-Belohnung, um die Mission abzuschließen.',
    conversionMission: 'B3TR → VOT3 einmal umwandeln',
    conversionMissionDescription: 'Wandle B3TR einmal in VOT3 um, um diese Mission abzuschließen.',
  },
  fr: {
    appMissionDescription: 'Utilisez les dApps VeBetterDAO et obtenez une récompense B3TR sur chacune pour terminer la mission.',
    conversionMission: 'Convertir B3TR → VOT3 une fois',
    conversionMissionDescription: 'Convertissez une fois des B3TR en VOT3 pour terminer cette mission.',
  },
  ar: {
    appMissionDescription: 'استخدم تطبيقات VeBetterDAO واحصل على مكافأة B3TR من كل تطبيق لإكمال المهمة.',
    conversionMission: 'حوّل B3TR → VOT3 مرة واحدة',
    conversionMissionDescription: 'حوّل B3TR إلى VOT3 مرة واحدة لإكمال هذه المهمة.',
  },
  bn: {
    appMissionDescription: 'VeBetterDAO dApp ব্যবহার করে প্রতিটি dApp থেকে B3TR পুরস্কার পেলে মিশনটি সম্পন্ন হবে।',
    conversionMission: 'B3TR → VOT3 একবার রূপান্তর করুন',
    conversionMissionDescription: 'B3TR একবার VOT3-এ রূপান্তর করলে এই মিশন সম্পন্ন হবে।',
  },
  pt: {
    appMissionDescription: 'Use dApps da VeBetterDAO e receba uma recompensa B3TR em cada uma para concluir a missão.',
    conversionMission: 'Converta B3TR → VOT3 uma vez',
    conversionMissionDescription: 'Converta B3TR em VOT3 uma vez para concluir esta missão.',
  },
  ru: {
    appMissionDescription: 'Используйте dApp VeBetterDAO и получите награду B3TR в каждом из них, чтобы завершить миссию.',
    conversionMission: 'Конвертируйте B3TR → VOT3 один раз',
    conversionMissionDescription: 'Один раз конвертируйте B3TR в VOT3, чтобы выполнить это задание.',
  },
  id: {
    appMissionDescription: 'Gunakan dApp VeBetterDAO dan dapatkan hadiah B3TR dari masing-masing dApp untuk menyelesaikan misi.',
    conversionMission: 'Konversi B3TR → VOT3 satu kali',
    conversionMissionDescription: 'Konversikan B3TR ke VOT3 satu kali untuk menyelesaikan misi ini.',
  },
  vi: {
    appMissionDescription: 'Sử dụng các dApp VeBetterDAO và nhận phần thưởng B3TR từ mỗi dApp để hoàn thành nhiệm vụ.',
    conversionMission: 'Chuyển B3TR → VOT3 một lần',
    conversionMissionDescription: 'Chuyển B3TR sang VOT3 một lần để hoàn thành nhiệm vụ này.',
  },
  'zh-tw': {
    appMissionDescription: '使用 VeBetterDAO dApp，並從每個應用取得 B3TR 獎勵即可完成。',
    conversionMission: '完成 1 次 B3TR → VOT3 轉換',
    conversionMissionDescription: '將 B3TR 轉換為 VOT3 1 次即可完成此任務。',
  },
  sv: {
    appMissionDescription: 'Använd VeBetterDAO-dApps och få en B3TR-belöning från var och en för att slutföra uppdraget.',
    conversionMission: 'Konvertera B3TR → VOT3 en gång',
    conversionMissionDescription: 'Konvertera B3TR till VOT3 en gång för att slutföra uppdraget.',
  },
  ro: {
    appMissionDescription: 'Folosește dApp-urile VeBetterDAO și primește o recompensă B3TR din fiecare pentru a finaliza misiunea.',
    conversionMission: 'Convertește B3TR → VOT3 o dată',
    conversionMissionDescription: 'Convertește B3TR în VOT3 o singură dată pentru a finaliza misiunea.',
  },
  ur: {
    appMissionDescription: 'VeBetterDAO dApps استعمال کریں اور مشن مکمل کرنے کے لیے ہر dApp سے B3TR انعام حاصل کریں۔',
    conversionMission: 'B3TR → VOT3 ایک بار تبدیل کریں',
    conversionMissionDescription: 'اس مشن کو مکمل کرنے کے لیے B3TR کو ایک بار VOT3 میں تبدیل کریں۔',
  },
  pcm: {
    appMissionDescription: 'Use VeBetterDAO dApps and collect B3TR reward from each one to complete the mission.',
    conversionMission: 'Convert B3TR → VOT3 one time',
    conversionMissionDescription: 'Convert B3TR to VOT3 one time to complete this mission.',
  },
  arz: {
    appMissionDescription: 'استخدم dApps بتاعة VeBetterDAO وخد مكافأة B3TR من كل واحد عشان تكمّل المهمة.',
    conversionMission: 'حوّل B3TR → VOT3 مرة واحدة',
    conversionMissionDescription: 'حوّل B3TR لـ VOT3 مرة واحدة عشان تكمّل المهمة دي.',
  },
  mr: {
    appMissionDescription: 'VeBetterDAO dApps वापरा आणि प्रत्येक dApp मधून B3TR रिवॉर्ड मिळवून मिशन पूर्ण करा.',
    conversionMission: 'B3TR → VOT3 एकदा रूपांतर करा',
    conversionMissionDescription: 'हे मिशन पूर्ण करण्यासाठी B3TR चे VOT3 मध्ये एकदा रूपांतर करा.',
  },
  te: {
    appMissionDescription: 'VeBetterDAO dApps ఉపయోగించి ప్రతి dApp నుంచి B3TR రివార్డ్ పొందితే మిషన్ పూర్తవుతుంది.',
    conversionMission: 'B3TR → VOT3 ఒకసారి మార్చండి',
    conversionMissionDescription: 'ఈ మిషన్ పూర్తి చేయడానికి B3TRను VOT3గా ఒకసారి మార్చండి.',
  },
  sw: {
    appMissionDescription: 'Tumia dApp za VeBetterDAO na upate zawadi ya B3TR kutoka kila moja ili kukamilisha misheni.',
    conversionMission: 'Badilisha B3TR → VOT3 mara moja',
    conversionMissionDescription: 'Badilisha B3TR kuwa VOT3 mara moja ili kukamilisha misheni hii.',
  },
  ha: {
    appMissionDescription: 'Yi amfani da VeBetterDAO dApps kuma ka samu ladan B3TR daga kowanne domin kammala aikin.',
    conversionMission: 'Sauya B3TR → VOT3 sau ɗaya',
    conversionMissionDescription: 'Sauya B3TR zuwa VOT3 sau ɗaya domin kammala wannan aikin.',
  },
};

for (const [locale, patch] of Object.entries(MISSION_RULE_PATCHES)) {
  if (!INVITEE_COPY[locale]) continue;
  Object.assign(INVITEE_COPY[locale], patch);
}

if (INVITEE_COPY.ko) {
  Object.assign(INVITEE_COPY.ko, {
    voteMission: '보상 배분 투표 1회 참여',
    voteMissionDescription: 'B3TR → VOT3 전환을 완료한 뒤 보상 배분 투표에 1회 참여하세요.',
  });
}
