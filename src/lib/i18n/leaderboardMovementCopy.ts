import type { Locale } from './locales';

type LeaderboardMovementCopy = {
  newEntry: string;
  up: (places: number) => string;
  down: (places: number) => string;
  same: string;
  newEntryAria: string;
};

const COPY: Record<string, LeaderboardMovementCopy> = {
  en: {
    newEntry: 'NEW',
    up: (places) => `${places} places up since the previous round ended`,
    down: (places) => `${places} places down since the previous round ended`,
    same: 'Same rank as at the end of the previous round',
    newEntryAria: 'New leaderboard entry since the previous round ended',
  },
  ko: {
    newEntry: '신규',
    up: (places) => `직전 라운드 종료 대비 ${places}계단 상승`,
    down: (places) => `직전 라운드 종료 대비 ${places}계단 하락`,
    same: '직전 라운드 종료와 같은 순위',
    newEntryAria: '직전 라운드 이후 리더보드 신규 진입',
  },
  zh: {
    newEntry: '新',
    up: (places) => `较上一轮结束时上升 ${places} 位`,
    down: (places) => `较上一轮结束时下降 ${places} 位`,
    same: '与上一轮结束时排名相同',
    newEntryAria: '上一轮结束后新进入排行榜',
  },
  hi: {
    newEntry: 'नया',
    up: (places) => `पिछले राउंड के अंत से ${places} स्थान ऊपर`,
    down: (places) => `पिछले राउंड के अंत से ${places} स्थान नीचे`,
    same: 'पिछले राउंड के अंत के समान रैंक',
    newEntryAria: 'पिछले राउंड के बाद लीडरबोर्ड में नई एंट्री',
  },
  es: {
    newEntry: 'NUEVO',
    up: (places) => `${places} puestos arriba desde el cierre de la ronda anterior`,
    down: (places) => `${places} puestos abajo desde el cierre de la ronda anterior`,
    same: 'Mismo puesto que al cierre de la ronda anterior',
    newEntryAria: 'Nueva entrada en la clasificación desde la ronda anterior',
  },
  ja: {
    newEntry: '新規',
    up: (places) => `前回ラウンド終了時から ${places} 位上昇`,
    down: (places) => `前回ラウンド終了時から ${places} 位下降`,
    same: '前回ラウンド終了時と同じ順位',
    newEntryAria: '前回ラウンド終了後にランキングへ新規ランクイン',
  },
  it: {
    newEntry: 'NUOVO',
    up: (places) => `${places} posizioni in più dalla fine del round precedente`,
    down: (places) => `${places} posizioni in meno dalla fine del round precedente`,
    same: 'Stessa posizione della fine del round precedente',
    newEntryAria: 'Nuovo ingresso in classifica dal round precedente',
  },
  tr: {
    newEntry: 'YENİ',
    up: (places) => `Önceki turun sonuna göre ${places} sıra yükseldi`,
    down: (places) => `Önceki turun sonuna göre ${places} sıra geriledi`,
    same: 'Önceki turun sonuyla aynı sıra',
    newEntryAria: 'Önceki turdan sonra liderlik tablosuna yeni giriş',
  },
  nl: {
    newEntry: 'NIEUW',
    up: (places) => `${places} plaatsen gestegen sinds het einde van de vorige ronde`,
    down: (places) => `${places} plaatsen gedaald sinds het einde van de vorige ronde`,
    same: 'Dezelfde positie als aan het einde van de vorige ronde',
    newEntryAria: 'Nieuwe notering sinds het einde van de vorige ronde',
  },
  de: {
    newEntry: 'NEU',
    up: (places) => `${places} Plätze höher als am Ende der vorherigen Runde`,
    down: (places) => `${places} Plätze niedriger als am Ende der vorherigen Runde`,
    same: 'Gleicher Rang wie am Ende der vorherigen Runde',
    newEntryAria: 'Seit der vorherigen Runde neu in der Rangliste',
  },
  fr: {
    newEntry: 'NOUV.',
    up: (places) => `${places} places gagnées depuis la fin du tour précédent`,
    down: (places) => `${places} places perdues depuis la fin du tour précédent`,
    same: 'Même rang qu’à la fin du tour précédent',
    newEntryAria: 'Nouvelle entrée au classement depuis le tour précédent',
  },
  ar: {
    newEntry: 'جديد',
    up: (places) => `صعود ${places} مراكز منذ نهاية الجولة السابقة`,
    down: (places) => `تراجع ${places} مراكز منذ نهاية الجولة السابقة`,
    same: 'نفس الترتيب عند نهاية الجولة السابقة',
    newEntryAria: 'دخول جديد إلى لوحة الصدارة منذ الجولة السابقة',
  },
  bn: {
    newEntry: 'নতুন',
    up: (places) => `আগের রাউন্ড শেষের তুলনায় ${places} ধাপ ওপরে`,
    down: (places) => `আগের রাউন্ড শেষের তুলনায় ${places} ধাপ নিচে`,
    same: 'আগের রাউন্ড শেষে যে র‍্যাঙ্ক ছিল, এখনও একই',
    newEntryAria: 'আগের রাউন্ডের পর লিডারবোর্ডে নতুন প্রবেশ',
  },
  pt: {
    newEntry: 'NOVO',
    up: (places) => `${places} posições acima desde o fim da rodada anterior`,
    down: (places) => `${places} posições abaixo desde o fim da rodada anterior`,
    same: 'Mesma posição do fim da rodada anterior',
    newEntryAria: 'Nova entrada no ranking desde a rodada anterior',
  },
  ru: {
    newEntry: 'НОВ.',
    up: (places) => `На ${places} позиций выше, чем в конце прошлого раунда`,
    down: (places) => `На ${places} позиций ниже, чем в конце прошлого раунда`,
    same: 'Та же позиция, что и в конце прошлого раунда',
    newEntryAria: 'Новое появление в рейтинге после прошлого раунда',
  },
  id: {
    newEntry: 'BARU',
    up: (places) => `Naik ${places} peringkat sejak ronde sebelumnya berakhir`,
    down: (places) => `Turun ${places} peringkat sejak ronde sebelumnya berakhir`,
    same: 'Peringkat sama seperti saat ronde sebelumnya berakhir',
    newEntryAria: 'Baru masuk papan peringkat sejak ronde sebelumnya',
  },
  vi: {
    newEntry: 'MỚI',
    up: (places) => `Tăng ${places} bậc so với cuối vòng trước`,
    down: (places) => `Giảm ${places} bậc so với cuối vòng trước`,
    same: 'Giữ nguyên thứ hạng so với cuối vòng trước',
    newEntryAria: 'Mới vào bảng xếp hạng kể từ vòng trước',
  },
  'zh-tw': {
    newEntry: '新',
    up: (places) => `較上一輪結束時上升 ${places} 名`,
    down: (places) => `較上一輪結束時下降 ${places} 名`,
    same: '與上一輪結束時排名相同',
    newEntryAria: '上一輪結束後新進入排行榜',
  },
  sv: {
    newEntry: 'NY',
    up: (places) => `${places} placeringar upp sedan förra rundan slutade`,
    down: (places) => `${places} placeringar ner sedan förra rundan slutade`,
    same: 'Samma placering som vid slutet av förra rundan',
    newEntryAria: 'Ny på topplistan sedan förra rundan',
  },
  ro: {
    newEntry: 'NOU',
    up: (places) => `Cu ${places} poziții mai sus față de finalul rundei trecute`,
    down: (places) => `Cu ${places} poziții mai jos față de finalul rundei trecute`,
    same: 'Aceeași poziție ca la finalul rundei trecute',
    newEntryAria: 'Intrare nouă în clasament după runda trecută',
  },
  ur: {
    newEntry: 'نیا',
    up: (places) => `پچھلے راؤنڈ کے اختتام سے ${places} درجے اوپر`,
    down: (places) => `پچھلے راؤنڈ کے اختتام سے ${places} درجے نیچے`,
    same: 'پچھلے راؤنڈ کے اختتام والی ہی رینک',
    newEntryAria: 'پچھلے راؤنڈ کے بعد لیڈر بورڈ میں نئی انٹری',
  },
  pcm: {
    newEntry: 'NEW',
    up: (places) => `Don move up ${places} position since last round finish`,
    down: (places) => `Don move down ${places} position since last round finish`,
    same: 'Rank still dey the same as last round finish',
    newEntryAria: 'New entry for leaderboard since last round',
  },
  arz: {
    newEntry: 'جديد',
    up: (places) => `طلع ${places} مراكز من وقت ما الجولة اللي فاتت خلصت`,
    down: (places) => `نزل ${places} مراكز من وقت ما الجولة اللي فاتت خلصت`,
    same: 'نفس الترتيب بتاع نهاية الجولة اللي فاتت',
    newEntryAria: 'دخول جديد للترتيب بعد الجولة اللي فاتت',
  },
  mr: {
    newEntry: 'नवीन',
    up: (places) => `मागील फेरी संपल्यापासून ${places} क्रमांक वर`,
    down: (places) => `मागील फेरी संपल्यापासून ${places} क्रमांक खाली`,
    same: 'मागील फेरीच्या शेवटाइतकीच क्रमवारी',
    newEntryAria: 'मागील फेरीनंतर लीडरबोर्डमध्ये नवीन प्रवेश',
  },
  te: {
    newEntry: 'కొత్త',
    up: (places) => `గత రౌండ్ ముగిసినప్పటి నుంచి ${places} స్థానాలు పైకి`,
    down: (places) => `గత రౌండ్ ముగిసినప్పటి నుంచి ${places} స్థానాలు కిందికి`,
    same: 'గత రౌండ్ ముగిసినప్పటి ర్యాంకే ఉంది',
    newEntryAria: 'గత రౌండ్ తర్వాత లీడర్‌బోర్డ్‌లో కొత్త ప్రవేశం',
  },
  sw: {
    newEntry: 'MPYA',
    up: (places) => `Imepanda nafasi ${places} tangu raundi iliyopita iishe`,
    down: (places) => `Imeshuka nafasi ${places} tangu raundi iliyopita iishe`,
    same: 'Nafasi ni ileile kama mwisho wa raundi iliyopita',
    newEntryAria: 'Imeingia upya kwenye ubao wa nafasi baada ya raundi iliyopita',
  },
  ha: {
    newEntry: 'SABO',
    up: (places) => `Ya haura matsayi ${places} tun bayan zagayen da ya gabata`,
    down: (places) => `Ya sauka matsayi ${places} tun bayan zagayen da ya gabata`,
    same: 'Matsayi bai canza daga ƙarshen zagayen da ya gabata ba',
    newEntryAria: 'Sabon shiga jerin jagorori bayan zagayen da ya gabata',
  },
  el: {
    newEntry: 'ΝΕΟ',
    up: (places) => `${places} θέσεις πάνω από το τέλος του προηγούμενου γύρου`,
    down: (places) => `${places} θέσεις κάτω από το τέλος του προηγούμενου γύρου`,
    same: 'Ίδια θέση με το τέλος του προηγούμενου γύρου',
    newEntryAria: 'Νέα είσοδος στον πίνακα κατάταξης μετά τον προηγούμενο γύρο',
  },
};

export function getLeaderboardMovementCopy(
  locale: Locale,
): LeaderboardMovementCopy {
  return COPY[locale] ?? COPY.en!;
}
