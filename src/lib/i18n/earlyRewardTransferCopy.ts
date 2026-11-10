import type { SupportedLocale } from '@/lib/i18n/locales';

// Deliberately distinct from the finalized PAID receipt wording.
export const EARLY_REWARD_TRANSFER_COPY: Record<SupportedLocale, {
  title: string;
  body: string;
}> = {
  "en": { title: "B3TR transfer confirmed", body: "B3TR is confirmed on-chain. Finality is still pending. If your X bonus offer is open, you can participate now." },
  "ko": { title: "B3TR 전송이 확인됐어요", body: "B3TR 온체인 송금을 확인했어요. 최종 확정은 진행 중이지만, X 추가 보상 기회가 열렸다면 지금 바로 참여할 수 있어요." },
  "zh": { title: "B3TR 转账已确认", body: "B3TR 链上转账已确认，最终确认仍在进行中。如果 X 奖励活动已开放，现在就可以参与。" },
  "hi": { title: "B3TR ट्रांसफ़र की पुष्टि हुई", body: "B3TR का ऑन-चेन ट्रांसफ़र पुष्टि हो चुका है। अंतिम पुष्टि जारी है। X बोनस ऑफ़र खुला हो तो अभी भाग ले सकते हैं।" },
  "es": { title: "Transferencia B3TR confirmada", body: "Transferencia B3TR confirmada en cadena. Falta la confirmación final, pero puedes participar si tu oferta X está abierta." },
  "ja": { title: "B3TRの送金を確認しました", body: "B3TRのオンチェーン送金を確認しました。最終確定の待機中でも、X追加特典が公開されていれば今すぐ参加できます。" },
  "it": { title: "Trasferimento B3TR confermato", body: "Trasferimento B3TR confermato on-chain. La finalizzazione è in corso; puoi partecipare al bonus X se l'offerta è aperta." },
  "tr": { title: "B3TR transferi onaylandı", body: "B3TR zincir üstü transferi onaylandı. Kesinleşme sürerken X bonus teklifin açıksa hemen katılabilirsin." },
  "nl": { title: "B3TR-overdracht bevestigd", body: "De B3TR-overdracht is on-chain bevestigd. De definitieve bevestiging loopt nog; een open X-bonus kun je nu al gebruiken." },
  "de": { title: "B3TR-Übertragung bestätigt", body: "B3TR wurde on-chain übertragen. Die endgültige Bestätigung steht noch aus; ein offenes X-Bonusangebot kannst du bereits nutzen." },
  "fr": { title: "Transfert B3TR confirmé", body: "Transfert B3TR confirmé sur la blockchain. La finalisation est en cours, mais tu peux profiter du bonus X si l'offre est ouverte." },
  "ar": { title: "تم تأكيد تحويل B3TR", body: "تم تأكيد تحويل B3TR على السلسلة. التأكيد النهائي لا يزال جاريًا، ويمكنك المشاركة في مكافأة X الآن إذا كانت الفرصة مفتوحة." },
  "bn": { title: "B3TR ট্রান্সফার নিশ্চিত হয়েছে", body: "B3TR অন-চেইন ট্রান্সফার নিশ্চিত হয়েছে। চূড়ান্ত নিশ্চিতকরণ চলছে। X বোনাস অফার চালু থাকলে এখনই অংশ নিতে পারেন।" },
  "pt": { title: "Transferência B3TR confirmada", body: "Transferência B3TR confirmada na blockchain. A finalização continua; se a oferta do bônus X estiver aberta, você já pode participar." },
  "ru": { title: "Перевод B3TR подтверждён", body: "Перевод B3TR подтверждён в блокчейне. Финализация ещё идёт, но при открытом X-бонусе можно участвовать уже сейчас." },
  "id": { title: "Transfer B3TR terkonfirmasi", body: "Transfer B3TR telah dikonfirmasi on-chain. Finalisasi masih berjalan; jika bonus X tersedia, Anda bisa ikut sekarang." },
  "vi": { title: "Đã xác nhận chuyển B3TR", body: "Giao dịch B3TR đã được xác nhận trên chuỗi. Trong khi chờ xác nhận cuối cùng, bạn có thể tham gia thưởng X ngay nếu ưu đãi đã mở." },
  "zh-tw": { title: "B3TR 轉帳已確認", body: "B3TR 鏈上轉帳已確認，最終確認仍在進行中。如果 X 額外獎勵已開放，現在就可以參與。" },
  "sv": { title: "B3TR-överföring bekräftad", body: "B3TR-överföringen är bekräftad på kedjan. Slutlig bekräftelse pågår, men ett öppet X-bonuserbjudande går att använda nu." },
  "ro": { title: "Transfer B3TR confirmat", body: "Transferul B3TR este confirmat pe blockchain. Confirmarea finală continuă, dar poți participa acum dacă oferta bonus X este deschisă." },
  "ur": { title: "B3TR منتقلی کی تصدیق ہوگئی", body: "B3TR کی آن چین منتقلی کی تصدیق ہوگئی ہے۔ حتمی تصدیق جاری ہے؛ X بونس کی پیشکش کھلی ہو تو ابھی حصہ لے سکتے ہیں۔" },
  "pcm": { title: "B3TR transfer don confirm", body: "Dem don confirm your B3TR transfer for blockchain. Final check still dey go on. If your X bonus offer don open, you fit join now." },
  "arz": { title: "تم تأكيد تحويل B3TR", body: "تحويل B3TR اتأكد على البلوكشين. التأكيد النهائي لسه شغال، ولو عرض مكافأة X مفتوح تقدر تشارك دلوقتي." },
  "mr": { title: "B3TR ट्रान्सफरची पुष्टी झाली", body: "B3TR चे ऑन-चेन हस्तांतरण पुष्टी झाले आहे. अंतिम खात्री सुरू आहे; X बोनसची संधी खुली असेल तर आता सहभागी होऊ शकता." },
  "te": { title: "B3TR బదిలీ నిర్ధారించబడింది", body: "B3TR ఆన్‌చైన్ బదిలీ నిర్ధారించబడింది. తుది నిర్ధారణ కొనసాగుతోంది. X బోనస్ ఆఫర్ తెరిచి ఉంటే ఇప్పుడే పాల్గొనవచ్చు." },
  "sw": { title: "Uhamisho wa B3TR umethibitishwa", body: "Uhamisho wa B3TR umethibitishwa kwenye blockchain. Uthibitisho wa mwisho unaendelea; unaweza kushiriki kwenye bonasi ya X ikiwa imefunguliwa." },
  "ha": { title: "An tabbatar da tura B3TR", body: "An tabbatar da tura B3TR a blockchain. Ana jiran tabbatarwa ta ƙarshe; idan damar bonus na X ta buɗe, za ka iya shiga yanzu." },
  "el": { title: "Επιβεβαιώθηκε η μεταφορά B3TR", body: "Η μεταφορά B3TR επιβεβαιώθηκε στην αλυσίδα. Η οριστικοποίηση συνεχίζεται, αλλά μπορείς να συμμετάσχεις στο μπόνους X αν είναι ανοιχτό." },
  "cs": { title: "Převod B3TR potvrzen", body: "Převod B3TR je potvrzený na blockchainu. Finalizace ještě probíhá, ale do bonusu X se můžeš zapojit už teď, pokud je nabídka otevřená." },
};
