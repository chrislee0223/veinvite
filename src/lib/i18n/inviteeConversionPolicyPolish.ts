import { INVITEE_COPY } from './inviteeCopy';
import type { SupportedLocale } from './locales';

type MissionPolicyPatch = Pick<
  (typeof INVITEE_COPY)[string],
  | 'conversionMission'
  | 'conversionMissionDescription'
  | 'voteMission'
  | 'voteMissionDescription'
>;

const MISSION_POLICY_PATCHES: Record<SupportedLocale, MissionPolicyPatch> = {
  en: { conversionMission: 'Convert B3TR → VOT3 once', conversionMissionDescription: 'Convert any amount of B3TR to VOT3 once to complete this mission.', voteMission: 'Join Allocation Voting once', voteMissionDescription: 'Participate in VeBetterDAO Allocation Voting once.' },
  ko: { conversionMission: 'B3TR → VOT3 1회 전환', conversionMissionDescription: '수량과 관계없이 B3TR을 VOT3로 1회 전환하면 완료돼요.', voteMission: '보상 배분 투표 1회 참여', voteMissionDescription: 'VeBetterDAO에서 보상 배분 투표에 1회 참여하세요.' },
  zh: { conversionMission: '完成 1 次 B3TR → VOT3 转换', conversionMissionDescription: '无论数量多少，将 B3TR 转换为 VOT3 1 次即可完成此任务。', voteMission: '参与 1 次奖励分配投票', voteMissionDescription: '在 VeBetterDAO 参与 1 次奖励分配投票。' },
  hi: { conversionMission: 'B3TR → VOT3 एक बार बदलें', conversionMissionDescription: 'किसी भी मात्रा के B3TR को VOT3 में एक बार बदलने पर यह मिशन पूरा हो जाएगा।', voteMission: 'रिवॉर्ड आवंटन वोटिंग में एक बार भाग लें', voteMissionDescription: 'VeBetterDAO में रिवॉर्ड आवंटन वोटिंग में एक बार भाग लें।' },
  es: { conversionMission: 'Convierte B3TR → VOT3 una vez', conversionMissionDescription: 'Convierte cualquier cantidad de B3TR a VOT3 una vez para completar esta misión.', voteMission: 'Participa una vez en la votación de asignación', voteMissionDescription: 'Participa una vez en la votación de asignación de VeBetterDAO.' },
  ja: { conversionMission: 'B3TR → VOT3を1回変換', conversionMissionDescription: '数量に関係なく、B3TRをVOT3へ1回変換するとこのミッションは完了です。', voteMission: '報酬配分投票に1回参加', voteMissionDescription: 'VeBetterDAOで報酬配分投票に1回参加してください。' },
  it: { conversionMission: 'Converti B3TR → VOT3 una volta', conversionMissionDescription: 'Converti una qualsiasi quantità di B3TR in VOT3 una volta per completare questa missione.', voteMission: 'Partecipa una volta al voto di allocazione', voteMissionDescription: 'Partecipa una volta al voto di allocazione su VeBetterDAO.' },
  tr: { conversionMission: 'B3TR → VOT3 bir kez dönüştür', conversionMissionDescription: 'Miktarı ne olursa olsun B3TR’yi VOT3’e bir kez dönüştürerek bu görevi tamamla.', voteMission: 'Ödül dağıtım oylamasına bir kez katıl', voteMissionDescription: 'VeBetterDAO’da ödül dağıtım oylamasına bir kez katıl.' },
  nl: { conversionMission: 'Zet B3TR → VOT3 één keer om', conversionMissionDescription: 'Zet een willekeurige hoeveelheid B3TR één keer om naar VOT3 om deze missie te voltooien.', voteMission: 'Doe één keer mee aan de allocatiestemming', voteMissionDescription: 'Doe één keer mee aan de allocatiestemming van VeBetterDAO.' },
  de: { conversionMission: 'B3TR → VOT3 einmal umwandeln', conversionMissionDescription: 'Wandle eine beliebige Menge B3TR einmal in VOT3 um, um diese Mission abzuschließen.', voteMission: 'Einmal an der Zuteilungsabstimmung teilnehmen', voteMissionDescription: 'Nimm einmal an der Zuteilungsabstimmung von VeBetterDAO teil.' },
  fr: { conversionMission: 'Convertir B3TR → VOT3 une fois', conversionMissionDescription: 'Convertissez une quantité quelconque de B3TR en VOT3 une fois pour terminer cette mission.', voteMission: 'Participer une fois au vote d’allocation', voteMissionDescription: 'Participez une fois au vote d’allocation sur VeBetterDAO.' },
  ar: { conversionMission: 'حوّل B3TR إلى VOT3 مرة واحدة', conversionMissionDescription: 'حوّل أي كمية من B3TR إلى VOT3 مرة واحدة لإكمال هذه المهمة.', voteMission: 'شارك مرة واحدة في تصويت توزيع المكافآت', voteMissionDescription: 'شارك مرة واحدة في تصويت توزيع المكافآت على VeBetterDAO.' },
  bn: { conversionMission: 'B3TR → VOT3 একবার রূপান্তর করুন', conversionMissionDescription: 'যেকোনো পরিমাণ B3TR একবার VOT3-এ রূপান্তর করলে এই মিশন সম্পন্ন হবে।', voteMission: 'রিওয়ার্ড বণ্টন ভোটে একবার অংশ নিন', voteMissionDescription: 'VeBetterDAO-তে রিওয়ার্ড বণ্টন ভোটে একবার অংশ নিন।' },
  pt: { conversionMission: 'Converta B3TR → VOT3 uma vez', conversionMissionDescription: 'Converta qualquer quantidade de B3TR em VOT3 uma vez para concluir esta missão.', voteMission: 'Participe uma vez da votação de alocação', voteMissionDescription: 'Participe uma vez da votação de alocação no VeBetterDAO.' },
  ru: { conversionMission: 'Конвертируйте B3TR → VOT3 один раз', conversionMissionDescription: 'Один раз конвертируйте любое количество B3TR в VOT3, чтобы выполнить это задание.', voteMission: 'Один раз участвуйте в голосовании по распределению', voteMissionDescription: 'Один раз участвуйте в голосовании по распределению в VeBetterDAO.' },
  id: { conversionMission: 'Konversi B3TR → VOT3 satu kali', conversionMissionDescription: 'Konversikan berapa pun jumlah B3TR ke VOT3 satu kali untuk menyelesaikan misi ini.', voteMission: 'Ikuti voting alokasi satu kali', voteMissionDescription: 'Ikuti voting alokasi di VeBetterDAO satu kali.' },
  vi: { conversionMission: 'Chuyển B3TR → VOT3 một lần', conversionMissionDescription: 'Chuyển bất kỳ lượng B3TR nào sang VOT3 một lần để hoàn thành nhiệm vụ này.', voteMission: 'Tham gia bỏ phiếu phân bổ một lần', voteMissionDescription: 'Tham gia bỏ phiếu phân bổ trên VeBetterDAO một lần.' },
  'zh-tw': { conversionMission: '完成 1 次 B3TR → VOT3 轉換', conversionMissionDescription: '無論數量多少，將 B3TR 轉換為 VOT3 1 次即可完成此任務。', voteMission: '參與 1 次獎勵分配投票', voteMissionDescription: '在 VeBetterDAO 參與 1 次獎勵分配投票。' },
  sv: { conversionMission: 'Konvertera B3TR → VOT3 en gång', conversionMissionDescription: 'Konvertera valfri mängd B3TR till VOT3 en gång för att slutföra uppdraget.', voteMission: 'Delta en gång i allokeringsomröstningen', voteMissionDescription: 'Delta en gång i VeBetterDAO:s allokeringsomröstning.' },
  ro: { conversionMission: 'Convertește B3TR → VOT3 o dată', conversionMissionDescription: 'Convertește orice cantitate de B3TR în VOT3 o dată pentru a finaliza misiunea.', voteMission: 'Participă o dată la votul de alocare', voteMissionDescription: 'Participă o dată la votul de alocare din VeBetterDAO.' },
  ur: { conversionMission: 'B3TR کو VOT3 میں ایک بار تبدیل کریں', conversionMissionDescription: 'B3TR کی کسی بھی مقدار کو ایک بار VOT3 میں تبدیل کر کے یہ مشن مکمل کریں۔', voteMission: 'ریوارڈ تقسیم کی ووٹنگ میں ایک بار حصہ لیں', voteMissionDescription: 'VeBetterDAO میں ریوارڈ تقسیم کی ووٹنگ میں ایک بار حصہ لیں۔' },
  pcm: { conversionMission: 'Convert B3TR → VOT3 one time', conversionMissionDescription: 'Convert any amount of B3TR to VOT3 one time to complete this mission.', voteMission: 'Join reward allocation voting one time', voteMissionDescription: 'Join reward allocation voting for VeBetterDAO one time.' },
  arz: { conversionMission: 'حوّل B3TR لـ VOT3 مرة واحدة', conversionMissionDescription: 'حوّل أي كمية من B3TR لـ VOT3 مرة واحدة عشان تكمّل المهمة دي.', voteMission: 'شارك مرة واحدة في تصويت توزيع المكافآت', voteMissionDescription: 'شارك مرة واحدة في تصويت توزيع المكافآت على VeBetterDAO.' },
  mr: { conversionMission: 'B3TR → VOT3 एकदा रूपांतर करा', conversionMissionDescription: 'B3TR ची कोणतीही मात्रा एकदा VOT3 मध्ये रूपांतरित करून हे मिशन पूर्ण करा.', voteMission: 'बक्षीस वाटप मतदानात एकदा सहभागी व्हा', voteMissionDescription: 'VeBetterDAO मधील बक्षीस वाटप मतदानात एकदा सहभागी व्हा.' },
  te: { conversionMission: 'B3TR → VOT3 ఒకసారి మార్చండి', conversionMissionDescription: 'ఎంత పరిమాణమైనా B3TRను VOT3గా ఒకసారి మార్చితే ఈ మిషన్ పూర్తవుతుంది.', voteMission: 'రివార్డ్ కేటాయింపు ఓటింగ్‌లో ఒకసారి పాల్గొనండి', voteMissionDescription: 'VeBetterDAOలో రివార్డ్ కేటాయింపు ఓటింగ్‌లో ఒకసారి పాల్గొనండి.' },
  sw: { conversionMission: 'Badilisha B3TR → VOT3 mara moja', conversionMissionDescription: 'Badilisha kiasi chochote cha B3TR kuwa VOT3 mara moja ili kukamilisha misheni hii.', voteMission: 'Shiriki mara moja katika kura ya ugawaji', voteMissionDescription: 'Shiriki mara moja katika kura ya ugawaji ya VeBetterDAO.' },
  ha: { conversionMission: 'Sauya B3TR → VOT3 sau ɗaya', conversionMissionDescription: 'Sauya kowane adadin B3TR zuwa VOT3 sau ɗaya domin kammala wannan aikin.', voteMission: 'Shiga zaɓen rabon lada sau ɗaya', voteMissionDescription: 'Shiga zaɓen rabon lada na VeBetterDAO sau ɗaya.' },
  el: { conversionMission: 'Μετέτρεψε B3TR → VOT3 μία φορά', conversionMissionDescription: 'Μετέτρεψε οποιαδήποτε θετική ποσότητα B3TR σε VOT3 μία φορά για να ολοκληρώσεις αυτή την αποστολή.', voteMission: 'Συμμετείχε μία φορά στο Allocation Voting', voteMissionDescription: 'Συμμετείχε μία φορά στο Allocation Voting του VeBetterDAO.' },
};

for (const [locale, patch] of Object.entries(MISSION_POLICY_PATCHES)) {
  const target = INVITEE_COPY[locale];
  if (target) Object.assign(target, patch);
}
