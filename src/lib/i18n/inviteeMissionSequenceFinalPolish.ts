import { INVITEE_COPY } from './inviteeCopy';

const CONVERSION_DESCRIPTIONS: Record<string, string> = {
  en: 'After completing the dApp mission, convert B3TR to VOT3 once.',
  ko: 'dApp 미션을 완료한 뒤 B3TR을 VOT3로 1회 전환하세요.',
  zh: '完成 dApp 任务后，将 B3TR 转换为 VOT3 1 次。',
  hi: 'dApp मिशन पूरा करने के बाद B3TR को VOT3 में एक बार बदलें।',
  es: 'Después de completar la misión de dApps, convierte B3TR a VOT3 una vez.',
  ja: 'dAppミッションを完了した後、B3TRをVOT3へ1回変換してください。',
  it: 'Dopo aver completato la missione dApp, converti B3TR in VOT3 una volta.',
  tr: 'dApp görevini tamamladıktan sonra B3TR’yi VOT3’e bir kez dönüştür.',
  nl: 'Zet na het voltooien van de dApp-missie één keer B3TR om naar VOT3.',
  de: 'Wandle nach Abschluss der dApp-Mission einmal B3TR in VOT3 um.',
  fr: 'Après avoir terminé la mission dApp, convertissez une fois des B3TR en VOT3.',
  ar: 'بعد إكمال مهمة dApp، حوّل B3TR إلى VOT3 مرة واحدة.',
  bn: 'dApp মিশন সম্পন্ন করার পর B3TR একবার VOT3-এ রূপান্তর করুন।',
  pt: 'Depois de concluir a missão de dApps, converta B3TR em VOT3 uma vez.',
  ru: 'После выполнения задания dApp один раз конвертируйте B3TR в VOT3.',
  id: 'Setelah menyelesaikan misi dApp, konversikan B3TR ke VOT3 satu kali.',
  vi: 'Sau khi hoàn thành nhiệm vụ dApp, hãy chuyển B3TR sang VOT3 một lần.',
  'zh-tw': '完成 dApp 任務後，將 B3TR 轉換為 VOT3 1 次。',
  sv: 'Efter att du har slutfört dApp-uppdraget, konvertera B3TR till VOT3 en gång.',
  ro: 'După ce finalizezi misiunea dApp, convertește B3TR în VOT3 o singură dată.',
  ur: 'dApp مشن مکمل کرنے کے بعد B3TR کو ایک بار VOT3 میں تبدیل کریں۔',
  pcm: 'After you complete the dApp mission, convert B3TR to VOT3 one time.',
  arz: 'بعد ما تكمّل مهمة الـ dApp، حوّل B3TR لـ VOT3 مرة واحدة.',
  mr: 'dApp मिशन पूर्ण केल्यानंतर B3TR चे VOT3 मध्ये एकदा रूपांतर करा.',
  te: 'dApp మిషన్ పూర్తి చేసిన తర్వాత B3TRను VOT3గా ఒకసారి మార్చండి.',
  sw: 'Baada ya kukamilisha misheni ya dApp, badilisha B3TR kuwa VOT3 mara moja.',
  ha: 'Bayan ka kammala aikin dApp, sauya B3TR zuwa VOT3 sau ɗaya.',
};

for (const [locale, description] of Object.entries(CONVERSION_DESCRIPTIONS)) {
  if (!INVITEE_COPY[locale]) continue;
  INVITEE_COPY[locale].conversionMissionDescription = description;
}

if (INVITEE_COPY.ko) {
  Object.assign(INVITEE_COPY.ko, {
    voteMission: 'Allocation 투표 1회 참여',
    voteMissionDescription: 'B3TR → VOT3 전환을 완료한 뒤 Allocation 투표에 1회 참여하세요.',
  });
}
