import { INVITEE_COPY } from './inviteeCopy';

const CONVERSION_DESCRIPTIONS: Record<string, string> = {
  en: 'Convert B3TR to VOT3 once to complete this mission.',
  ko: '수량과 관계없이 B3TR을 VOT3로 1회 전환하면 완료돼요.',
  zh: '将 B3TR 转换为 VOT3 1 次即可完成此任务。',
  hi: 'B3TR को VOT3 में एक बार बदलने पर यह मिशन पूरा हो जाएगा।',
  es: 'Convierte B3TR a VOT3 una vez para completar esta misión.',
  ja: 'B3TRをVOT3へ1回変換すると、このミッションは完了です。',
  it: 'Converti B3TR in VOT3 una volta per completare questa missione.',
  tr: 'Bu görevi tamamlamak için B3TR’yi VOT3’e bir kez dönüştür.',
  nl: 'Zet B3TR één keer om naar VOT3 om deze missie te voltooien.',
  de: 'Wandle B3TR einmal in VOT3 um, um diese Mission abzuschließen.',
  fr: 'Convertissez une fois des B3TR en VOT3 pour terminer cette mission.',
  ar: 'حوّل B3TR إلى VOT3 مرة واحدة لإكمال هذه المهمة.',
  bn: 'B3TR একবার VOT3-এ রূপান্তর করলে এই মিশন সম্পন্ন হবে।',
  pt: 'Converta B3TR em VOT3 uma vez para concluir esta missão.',
  ru: 'Один раз конвертируйте B3TR в VOT3, чтобы выполнить это задание.',
  id: 'Konversikan B3TR ke VOT3 satu kali untuk menyelesaikan misi ini.',
  vi: 'Chuyển B3TR sang VOT3 một lần để hoàn thành nhiệm vụ này.',
  'zh-tw': '將 B3TR 轉換為 VOT3 1 次即可完成此任務。',
  sv: 'Konvertera B3TR till VOT3 en gång för att slutföra uppdraget.',
  ro: 'Convertește B3TR în VOT3 o singură dată pentru a finaliza misiunea.',
  ur: 'اس مشن کو مکمل کرنے کے لیے B3TR کو ایک بار VOT3 میں تبدیل کریں۔',
  pcm: 'Convert B3TR to VOT3 one time to complete this mission.',
  arz: 'حوّل B3TR لـ VOT3 مرة واحدة عشان تكمّل المهمة دي.',
  mr: 'हे मिशन पूर्ण करण्यासाठी B3TR चे VOT3 मध्ये एकदा रूपांतर करा.',
  te: 'ఈ మిషన్ పూర్తి చేయడానికి B3TRను VOT3గా ఒకసారి మార్చండి.',
  sw: 'Badilisha B3TR kuwa VOT3 mara moja ili kukamilisha misheni hii.',
  ha: 'Sauya B3TR zuwa VOT3 sau ɗaya domin kammala wannan aikin.',
};

for (const [locale, description] of Object.entries(CONVERSION_DESCRIPTIONS)) {
  if (!INVITEE_COPY[locale]) continue;
  INVITEE_COPY[locale].conversionMissionDescription = description;
}

if (INVITEE_COPY.ko) {
  Object.assign(INVITEE_COPY.ko, {
    voteMission: '보상 배분 투표 1회 참여',
    voteMissionDescription: 'B3TR → VOT3 전환을 완료한 뒤 보상 배분 투표에 1회 참여하세요.',
  });
}
