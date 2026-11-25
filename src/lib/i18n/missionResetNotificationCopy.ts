import type { SupportedLocale } from './locales';

/**
 * Existing bell notification content for a durably committed auto-reset.
 * Display only after a successful exactly-once reset transaction. Never use
 * this copy to imply that an invitation, friend slot or fixed reward expired.
 */
export type MissionResetNoticeCopy = { title: string; body: string };
export const MISSION_RESET_NOTIFICATION_COPY = {
  en: { title: "Mission progress reset", body: "The mission deadline expired, so progress was reset to 0/3. Please complete the missions again." },
  ko: { title: "미션 진행도 초기화", body: "미션 완료 기한이 만료되어 진행도가 0/3으로 초기화되었습니다. 다시 미션을 진행해 주세요." },
  zh: { title: "任务进度已重置", body: "任务完成期限已到，进度已重置为 0/3。请重新完成任务。" },
  hi: { title: "मिशन प्रगति रीसेट", body: "मिशन पूरा करने की समय सीमा समाप्त हो गई, इसलिए प्रगति 0/3 पर रीसेट कर दी गई है। कृपया मिशन फिर से पूरा करें।" },
  es: { title: "Progreso de misiones reiniciado", body: "Venció el plazo para completar las misiones y el progreso volvió a 0/3. Completa las misiones otra vez." },
  ja: { title: "ミッション進捗のリセット", body: "ミッションの完了期限が切れたため、進捗を0/3にリセットしました。もう一度ミッションを進めてください。" },
  it: { title: "Progressi delle missioni azzerati", body: "Il termine per completare le missioni è scaduto e i progressi sono tornati a 0/3. Completa di nuovo le missioni." },
  tr: { title: "Görev ilerlemesi sıfırlandı", body: "Görevleri tamamlama süresi dolduğu için ilerlemen 0/3 olarak sıfırlandı. Görevleri yeniden tamamla." },
  nl: { title: "Missievoortgang gereset", body: "De termijn voor de missies is verstreken. Je voortgang is teruggezet naar 0/3. Voltooi de missies opnieuw." },
  de: { title: "Missionsfortschritt zurückgesetzt", body: "Die Frist für die Missionen ist abgelaufen. Dein Fortschritt wurde auf 0/3 zurückgesetzt. Schließe die Missionen erneut ab." },
  fr: { title: "Progression des missions réinitialisée", body: "Le délai pour terminer les missions a expiré. Votre progression est revenue à 0/3. Recommencez les missions." },
  ar: { title: "إعادة تعيين تقدم المهام", body: "انتهت مهلة إكمال المهام، لذا أُعيد تقدمك إلى 0/3. يُرجى إكمال المهام مجددًا." },
  bn: { title: "মিশনের অগ্রগতি রিসেট", body: "মিশন শেষ করার সময়সীমা পেরিয়ে গেছে, তাই অগ্রগতি ০/৩-এ রিসেট হয়েছে। আবার মিশনগুলো সম্পন্ন করুন।" },
  pt: { title: "Progresso das missões reiniciado", body: "O prazo para concluir as missões expirou e o progresso voltou a 0/3. Conclua as missões novamente." },
  ru: { title: "Прогресс заданий сброшен", body: "Срок выполнения заданий истёк, поэтому прогресс сброшен до 0/3. Выполните задания заново." },
  id: { title: "Progres misi diatur ulang", body: "Batas waktu menyelesaikan misi telah habis, sehingga progres kembali ke 0/3. Selesaikan misinya lagi." },
  vi: { title: "Đã đặt lại tiến độ nhiệm vụ", body: "Thời hạn hoàn thành nhiệm vụ đã hết nên tiến độ được đặt lại về 0/3. Hãy làm lại các nhiệm vụ." },
  'zh-tw': { title: "任務進度已重設", body: "任務完成期限已到，進度已重設為 0/3。請重新完成任務。" },
  sv: { title: "Uppdragsframsteg återställda", body: "Tiden för att slutföra uppdragen har gått ut. Dina framsteg har återställts till 0/3. Gör uppdragen igen." },
  ro: { title: "Progresul misiunilor a fost resetat", body: "Termenul de finalizare a misiunilor a expirat, iar progresul a fost resetat la 0/3. Parcurge din nou misiunile." },
  ur: { title: "مشن کی پیش رفت ری سیٹ", body: "مشن مکمل کرنے کی مدت ختم ہو گئی ہے، اس لیے پیش رفت 0/3 پر ری سیٹ ہو گئی ہے۔ براہِ کرم مشن دوبارہ مکمل کریں۔" },
  pcm: { title: "Mission progress don reset", body: "Time wey dem give you to finish di missions don pass, so your progress don go back to 0/3. Abeg do di missions again." },
  arz: { title: "تصفير تقدّم المهام", body: "مدة إكمال المهام خلصت، وعشان كده التقدّم رجع لـ 0/3. من فضلك كمّل المهام من الأول." },
  mr: { title: "मिशन प्रगती रीसेट", body: "मिशन पूर्ण करण्याची मुदत संपल्यामुळे प्रगती 0/3 वर रीसेट झाली आहे. कृपया मिशन पुन्हा पूर्ण करा." },
  te: { title: "మిషన్ పురోగతి రీసెట్", body: "మిషన్లు పూర్తి చేయాల్సిన గడువు ముగియడంతో పురోగతి 0/3కి రీసెట్ అయింది. దయచేసి మిషన్లను మళ్లీ పూర్తి చేయండి." },
  sw: { title: "Maendeleo ya misheni yamewekwa upya", body: "Muda wa kukamilisha misheni umeisha, hivyo maendeleo yamerudishwa kuwa 0/3. Tafadhali kamilisha misheni tena." },
  ha: { title: "An sake saita ci gaban ayyuka", body: "Lokacin kammala ayyukan ya ƙare, don haka an mayar da ci gabanka zuwa 0/3. Ka sake kammala ayyukan." },
  el: { title: "Μηδενισμός προόδου αποστολών", body: "Η προθεσμία ολοκλήρωσης των αποστολών έληξε και η πρόοδός σου επανήλθε στο 0/3. Ολοκλήρωσε ξανά τις αποστολές." },
  cs: { title: "Postup v misích byl resetován", body: "Lhůta pro dokončení misí vypršela a postup byl resetován na 0/3. Dokončete mise znovu." },
} as const satisfies Record<SupportedLocale, MissionResetNoticeCopy>;

export function missionResetNotificationCopy(locale: SupportedLocale): MissionResetNoticeCopy {
  return MISSION_RESET_NOTIFICATION_COPY[locale];
}
