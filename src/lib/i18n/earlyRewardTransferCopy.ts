import type { SupportedLocale } from '@/lib/i18n/locales';

// Deliberately distinct from the finalized PAID receipt wording.
export const EARLY_REWARD_TRANSFER_COPY: Record<SupportedLocale, {
  title: string;
  body: string;
}> = {
  "en": { title: "B3TR transfer confirmed", body: "Your transfer is on-chain. Network finality is still pending; the +10 B3TR X reward offer opens after final verification." },
  "ko": { title: "B3TR 전송이 확인됐어요", body: "온체인 전송이 확인됐습니다. 블록체인 최종 확정 중이며, X 추가 보상 기회는 최종 확인 후 열립니다." },
  "zh": { title: "B3TR 转账已确认", body: "链上转账已确认，正在等待最终确认。+10 B3TR 的 X 奖励机会将在最终确认后开放。" },
  "hi": { title: "B3TR ट्रांसफ़र की पुष्टि हुई", body: "ऑन-चेन ट्रांसफ़र की पुष्टि हुई है। अंतिम सत्यापन जारी है; +10 B3TR X ऑफ़र उसके बाद खुलेगा।" },
  "es": { title: "Transferencia B3TR confirmada", body: "La transferencia está confirmada en cadena. Falta la finalidad; la oferta X de +10 B3TR se abrirá después." },
  "ja": { title: "B3TRの送金を確認しました", body: "オンチェーン送金を確認しました。最終確定は処理中です。Xの追加10 B3TR特典は確定後に開始します。" },
  "it": { title: "Trasferimento B3TR confermato", body: "Trasferimento verificato sulla blockchain. In attesa della finalità; l'offerta X da +10 B3TR si aprirà dopo." },
  "tr": { title: "B3TR transferi onaylandı", body: "Zincir üstü transfer doğrulandı. Kesinleşme bekleniyor; +10 B3TR X fırsatı son onaydan sonra açılacak." },
  "nl": { title: "B3TR-overdracht bevestigd", body: "De transactie is bevestigd op de blockchain. De definitieve bevestiging loopt nog; de +10 B3TR X-actie opent daarna." },
  "de": { title: "B3TR-Übertragung bestätigt", body: "Die Übertragung ist auf der Blockchain bestätigt. Die Finalisierung läuft noch; das X-Angebot über +10 B3TR öffnet danach." },
  "fr": { title: "Transfert B3TR confirmé", body: "Le transfert est confirmé sur la blockchain. La finalisation est en cours ; l'offre X de +10 B3TR ouvrira ensuite." },
  "ar": { title: "تم تأكيد تحويل B3TR", body: "تم التحقق من التحويل على السلسلة. التأكيد النهائي جارٍ؛ ستُفتح فرصة X للحصول على 10 B3TR إضافية بعد ذلك." },
  "bn": { title: "B3TR ট্রান্সফার নিশ্চিত হয়েছে", body: "অন-চেইন ট্রান্সফার নিশ্চিত। চূড়ান্ত যাচাই চলছে; এর পরে X-এ অতিরিক্ত 10 B3TR অফার খুলবে।" },
  "pt": { title: "Transferência B3TR confirmada", body: "Transferência confirmada na blockchain. A finalização está pendente; a oferta X de +10 B3TR abrirá depois." },
  "ru": { title: "Перевод B3TR подтверждён", body: "Перевод подтверждён в блокчейне. Ожидается финализация; предложение X на +10 B3TR откроется после неё." },
  "id": { title: "Transfer B3TR terkonfirmasi", body: "Transfer telah dikonfirmasi di blockchain. Finalisasi masih berlangsung; penawaran X +10 B3TR dibuka sesudahnya." },
  "vi": { title: "Đã xác nhận chuyển B3TR", body: "Giao dịch đã được xác nhận trên chuỗi. Đang chờ xác nhận cuối cùng; ưu đãi X +10 B3TR sẽ mở sau đó." },
  "zh-tw": { title: "B3TR 轉帳已確認", body: "鏈上轉帳已確認，正在等待最終確認。額外 +10 B3TR 的 X 獎勵將於最終確認後開放。" },
  "sv": { title: "B3TR-överföring bekräftad", body: "Överföringen är bekräftad på kedjan. Slutlig bekräftelse väntar; X-erbjudandet på +10 B3TR öppnas därefter." },
  "ro": { title: "Transfer B3TR confirmat", body: "Transferul este confirmat pe blockchain. Se așteaptă finalizarea; oferta X de +10 B3TR se deschide după aceea." },
  "ur": { title: "B3TR منتقلی کی تصدیق ہوگئی", body: "بلاک چین پر منتقلی کی تصدیق ہوگئی ہے۔ حتمی تصدیق جاری ہے؛ X پر اضافی 10 B3TR کی پیشکش بعد میں کھلے گی۔" },
  "pcm": { title: "B3TR transfer don confirm", body: "Dem don confirm di transfer for blockchain. Final checking still dey; X bonus +10 B3TR go open after am." },
  "arz": { title: "تم تأكيد تحويل B3TR", body: "التحويل اتأكد على البلوكشين. التأكيد النهائي لسه شغال؛ عرض X بمكافأة 10 B3TR إضافية هيفتح بعده." },
  "mr": { title: "B3TR ट्रान्सफरची पुष्टी झाली", body: "ऑन-चेन ट्रान्सफरची पुष्टी झाली. अंतिम पुष्टी सुरू आहे; X वरील अतिरिक्त 10 B3TR संधी नंतर सुरू होईल." },
  "te": { title: "B3TR బదిలీ నిర్ధారించబడింది", body: "ఆన్‌చైన్ బదిలీ నిర్ధారించబడింది. తుది నిర్ధారణ కొనసాగుతోంది; అదనపు 10 B3TR X అవకాశం ఆ తర్వాత తెరవబడుతుంది." },
  "sw": { title: "Uhamisho wa B3TR umethibitishwa", body: "Uhamisho umethibitishwa kwenye blockchain. Uthibitisho wa mwisho unaendelea; nafasi ya X ya +10 B3TR itafunguka baadaye." },
  "ha": { title: "An tabbatar da tura B3TR", body: "An tabbatar da turawa a blockchain. Ana jiran tabbatarwa ta ƙarshe; damar X ta ƙarin 10 B3TR za ta buɗe bayan haka." },
  "el": { title: "Επιβεβαιώθηκε η μεταφορά B3TR", body: "Η μεταφορά επιβεβαιώθηκε στην αλυσίδα. Εκκρεμεί η οριστικοποίηση· η προσφορά X για +10 B3TR θα ανοίξει μετά." },
  "cs": { title: "Převod B3TR potvrzen", body: "Převod je potvrzen na blockchainu. Čeká se na finalizaci; nabídka X za +10 B3TR se otevře potom." },
};
