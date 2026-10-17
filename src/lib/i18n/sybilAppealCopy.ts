import type { SupportedLocale } from './locales';

export type SybilAppealCopy = {
  title: string;
  explanation: string;
  category: string;
  sharedDevice: string;
  identityLink: string;
  missingActivity: string;
  other: string;
  details: string;
  placeholder: string;
  submit: string;
  submitting: string;
  submitted: string;
  duplicate: string;
  failed: string;
  note: string;
};

const english: SybilAppealCopy = {
  title: 'Request another review',
  explanation: 'You may ask the team to examine your case again.',
  category: 'Reason for review',
  sharedDevice: 'Different people sharing a device',
  identityLink: 'Incorrect wallet association',
  missingActivity: 'Missing mission activity',
  other: 'Other concern',
  details: 'Additional context (25–600 characters)',
  placeholder: 'Explain what may have been misidentified. Include relevant public transaction details, not secrets.',
  submit: 'Submit review request',
  submitting: 'Submitting…',
  submitted: 'Your request was received for manual review.',
  duplicate: 'A request for this review version is already recorded.',
  failed: 'Unable to submit now. Please try again later.',
  note: 'A request never automatically removes restrictions or enables rewards. Do not share private keys, seed phrases, or sensitive personal information.',
};

const translations: Partial<Record<SupportedLocale, Partial<SybilAppealCopy>>> = {
  ko: {
    title: '재검토 요청',
    explanation: '현재 판정에 대해 운영팀의 추가 검토를 요청할 수 있습니다.',
    category: '재검토 사유',
    sharedDevice: '서로 다른 사람이 같은 기기 사용',
    identityLink: '지갑 연관 관계가 잘못 판단됨',
    missingActivity: '미션 활동 누락',
    other: '기타 사유',
    details: '추가 설명 (25~600자)',
    placeholder: '오판이라고 생각하는 이유를 설명하세요. 공개 거래 내역은 가능하지만 비밀 정보는 입력하지 마세요.',
    submit: '재검토 요청 보내기',
    submitting: '접수 중…',
    submitted: '재검토 요청이 접수되었습니다.',
    duplicate: '현재 판정에 대한 요청이 이미 접수되어 있습니다.',
    failed: '지금은 접수할 수 없습니다. 잠시 후 다시 시도하세요.',
    note: '접수만으로 제한이 해제되거나 보상이 지급되지는 않습니다. 개인키, 복구 문구, 민감한 개인정보를 입력하지 마세요.',
  },
  tr: {
    title: 'Yeniden inceleme talebi',
    explanation: 'Ekibimizden durumunuzu yeniden incelemesini isteyebilirsiniz.',
    category: 'İnceleme nedeni',
    sharedDevice: 'Farklı kişiler aynı cihazı kullandı',
    identityLink: 'Yanlış cüzdan bağlantısı',
    missingActivity: 'Eksik görev etkinliği',
    other: 'Diğer',
    details: 'Ek açıklama (25–600 karakter)',
    placeholder: 'Hangi bilginin yanlış değerlendirildiğini açıklayın. Gizli bilgilerinizi paylaşmayın.',
    submit: 'İnceleme iste',
    submitting: 'Gönderiliyor…',
    submitted: 'İnceleme talebiniz alındı.',
    duplicate: 'Bu karar için zaten bir talep mevcut.',
    failed: 'Talep şu anda gönderilemedi. Daha sonra deneyin.',
    note: 'Talep göndermek kısıtlamaları veya ödülleri otomatik olarak değiştirmez. Özel anahtar veya kurtarma ifadesi paylaşmayın.',
  },
  vi: {
    title: 'Yêu cầu xem xét lại',
    explanation: 'Bạn có thể yêu cầu nhóm xem xét lại trường hợp của mình.',
    category: 'Lý do xem xét',
    sharedDevice: 'Nhiều người dùng chung thiết bị',
    identityLink: 'Liên kết ví không chính xác',
    missingActivity: 'Thiếu hoạt động nhiệm vụ',
    other: 'Lý do khác',
    details: 'Giải thích thêm (25–600 ký tự)',
    placeholder: 'Hãy giải thích điều có thể bị xác định nhầm. Không gửi thông tin bí mật.',
    submit: 'Gửi yêu cầu',
    submitting: 'Đang gửi…',
    submitted: 'Yêu cầu xem xét đã được ghi nhận.',
    duplicate: 'Đã có yêu cầu cho quyết định này.',
    failed: 'Không thể gửi lúc này. Vui lòng thử lại sau.',
    note: 'Gửi yêu cầu không tự động gỡ hạn chế hoặc cấp thưởng. Không chia sẻ khóa riêng hay cụm từ khôi phục.',
  },
  es: {
    title: 'Solicitar otra revisión',
    explanation: 'Puedes pedir al equipo que vuelva a revisar tu caso.',
    category: 'Motivo de revisión',
    sharedDevice: 'Personas distintas que comparten dispositivo',
    identityLink: 'Asociación incorrecta de carteras',
    missingActivity: 'Actividad de misión no registrada',
    other: 'Otro motivo',
    details: 'Explicación (25–600 caracteres)',
    placeholder: 'Explica qué pudo identificarse mal. No compartas datos secretos.',
    submit: 'Enviar solicitud',
    submitting: 'Enviando…',
    submitted: 'Solicitud de revisión recibida.',
    duplicate: 'Ya existe una solicitud para esta decisión.',
    failed: 'No se pudo enviar. Inténtalo más tarde.',
    note: 'La solicitud no elimina restricciones ni concede premios automáticamente. No compartas claves privadas o frases de recuperación.',
  },
  fr: {
    title: 'Demander un nouvel examen',
    explanation: 'Vous pouvez demander une nouvelle vérification de votre dossier.',
    category: 'Motif de l’examen',
    sharedDevice: 'Appareil partagé entre plusieurs personnes',
    identityLink: 'Association de portefeuilles incorrecte',
    missingActivity: 'Activité de mission manquante',
    other: 'Autre raison',
    details: 'Explication (25 à 600 caractères)',
    placeholder: 'Expliquez les éléments potentiellement erronés. Ne partagez aucun secret.',
    submit: 'Envoyer la demande',
    submitting: 'Envoi…',
    submitted: 'Votre demande a été enregistrée.',
    duplicate: 'Une demande existe déjà pour cette décision.',
    failed: 'Envoi impossible. Réessayez plus tard.',
    note: 'Une demande ne lève aucune restriction et ne débloque aucune récompense automatiquement. Ne partagez aucune clé privée.',
  },
  zh: {
    title: '申请重新审核',
    explanation: '你可以申请工作人员重新审核此案例。',
    category: '审核原因',
    sharedDevice: '不同人员共用设备',
    identityLink: '钱包关联判断错误',
    missingActivity: '任务活动遗漏',
    other: '其他原因',
    details: '补充说明（25–600 字符）',
    placeholder: '说明可能被误判的情况，不要提供任何秘密信息。',
    submit: '提交审核申请',
    submitting: '正在提交…',
    submitted: '审核申请已收到。',
    duplicate: '当前判定已提交过申请。',
    failed: '暂时无法提交，请稍后重试。',
    note: '提交申请不会自动解除限制或发放奖励。请勿分享私钥或助记词。',
  },
  hi: {
    title: 'दोबारा समीक्षा का अनुरोध',
    explanation: 'आप टीम से अपने मामले की दोबारा जाँच का अनुरोध कर सकते हैं।',
    category: 'समीक्षा का कारण',
    sharedDevice: 'अलग लोगों द्वारा एक डिवाइस का उपयोग',
    identityLink: 'गलत वॉलेट संबंध',
    missingActivity: 'मिशन गतिविधि दर्ज नहीं हुई',
    other: 'अन्य कारण',
    details: 'अतिरिक्त जानकारी (25–600 अक्षर)',
    placeholder: 'बताएँ कि कौन सी बात गलत पहचानी गई। गुप्त जानकारी साझा न करें।',
    submit: 'समीक्षा अनुरोध भेजें',
    submitting: 'भेज रहे हैं…',
    submitted: 'आपका अनुरोध प्राप्त हुआ।',
    duplicate: 'इस निर्णय के लिए अनुरोध पहले से मौजूद है।',
    failed: 'अभी अनुरोध नहीं भेजा जा सकता। बाद में कोशिश करें।',
    note: 'अनुरोध से प्रतिबंध नहीं हटते या इनाम अपने आप नहीं मिलते। निजी कुंजी या रिकवरी वाक्यांश साझा न करें।',
  },
};

export function sybilAppealCopy(locale: SupportedLocale): SybilAppealCopy {
  // Explicit English fallback avoids blank/security-incomplete strings in
  // lower-volume locales until reviewed translations become available.
  return { ...english, ...(translations[locale] ?? {}) };
}
