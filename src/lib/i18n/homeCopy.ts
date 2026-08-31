import type { Locale } from './locales';

type HomeCopy = {
  language: string;
  languageAria: string;
  walletAria: string;
  shareText: string;
  inviteAvailable: string;
  inviteMission: string;
  emptyTitle: string;
  emptyDescription: string;
  createInvite: string;
  createNextInvite: string;
  creating: string;
  connectStart: string;
  connecting: string;
  rewardLabel: string;
  rewardLocked: string;
  rewardUnlocked: string;
  locked: string;
  unlocked: string;
  inviteReadyBadge: string;
  inviteReadyTitle: string;
  inviteReadyDescription: string;
  friendJoinedBadge: string;
  friendJoinedTitle: string;
  friendJoinedDescription: string;
  reviewBadge: string;
  reviewTitle: string;
  reviewDescription: string;
  completeBadge: string;
  completeTitle: string;
  completeDescription: string;
  shareInvite: string;
  copyLink: string;
  copied: string;
  cancelInvite: string;
  cancelTitleWaiting: string;
  cancelDescriptionWaiting: string;
  keepInvite: string;
  confirmCancel: string;
  cancelled: string;
  noActive: string;
  createLink: string;
  linkCreated: string;
  waitingForFriendStep: string;
  friendJoins: string;
  activation: string;
  waiting: string;
  inProgress: string;
  checking: string;
  completed: string;
  codeLabel: string;
  rewardTitle: string;
  rewardPending: string;
  rewardDescription: string;
  rewardClaimReady: string;
  rewardClaimDescription: string;
  claimReward: string;
  claimingReward: string;
  rewardClaimed: string;
  rewardClaimedDescription: string;
  rewardAssigned: string;
  rewardAssignedDescription: string;
  rewardPaid: string;
  rewardPaidDescription: string;
  rewardForfeited: string;
  rewardForfeitedDescription: string;
  claimSuccess: string;
  claimError: string;
  privacy: string;
  terms: string;
  genericError: string;
  loadError: string;
  createError: string;
  cancelError: string;
  dappTitle: string;
  dappDescription: string;
};

export const HOME_COPY: Record<Locale, HomeCopy> = {
  en: {
    language: 'English', languageAria: 'Language', walletAria: 'Open wallet account',
    shareText: 'Join a VeBetterDAO mission with VeInvite.',
    inviteAvailable: '1 INVITE SLOT READY', inviteMission: 'QUEST 01',
    emptyTitle: 'Invite Your First Friend',
    emptyDescription: 'Create one invite and help a new or returning user complete a VeInvite onboarding mission.',
    createInvite: 'Create Invite', createNextInvite: 'Invite another friend', creating: 'Creating…',
    connectStart: 'Connect Wallet & Start', connecting: 'Opening wallet…',
    rewardLabel: 'ONBOARDING STATUS', rewardLocked: 'Complete the mission to finish onboarding', rewardUnlocked: 'Onboarding complete',
    locked: 'LOCKED', unlocked: 'UNLOCKED',
    inviteReadyBadge: 'INVITE READY', inviteReadyTitle: 'Your invite is ready',
    inviteReadyDescription: 'Send the link to one friend. The next step starts when they join.',
    friendJoinedBadge: 'FRIEND JOINED', friendJoinedTitle: 'Your friend joined', friendJoinedDescription: 'Your friend is completing their VeInvite missions now.',
    reviewBadge: 'ACTIVATION CHECK', reviewTitle: 'Checking the final step', reviewDescription: 'Hang tight. This step must be verified before completion.',
    completeBadge: 'MISSION COMPLETE', completeTitle: 'Invite completed', completeDescription: 'Your friend completed the mission. Onboarding is verified.',
    shareInvite: 'Share Invite', copyLink: 'Copy Link', copied: 'Invite link copied.',
    cancelInvite: 'Cancel invite', cancelTitleWaiting: 'Cancel this invite link?',
    cancelDescriptionWaiting: 'This link will stop working and your invite slot will be restored.',
    keepInvite: 'Keep Invite', confirmCancel: 'Cancel Invite', cancelled: 'Invite cancelled. You can create a new one.',
    noActive: 'No active invite', createLink: 'Invite', linkCreated: 'Link ready', waitingForFriendStep: 'Waiting for friend', friendJoins: 'Friend joined', activation: 'Final verification',
    waiting: 'Waiting for friend', inProgress: 'In progress', checking: 'Checking', completed: 'Completed', codeLabel: 'Invite code',
    rewardTitle: 'Referral status', rewardPending: 'Onboarding verified', rewardDescription: 'The final reward and anti-abuse checks are still in progress.',
    rewardClaimReady: 'Your reward is ready to claim', rewardClaimDescription: 'Your referral passed the final checks. Request the reward now and it will be included in the next funded reward round.',
    claimReward: 'Claim reward', claimingReward: 'Claiming…', rewardClaimed: 'Reward queued automatically',
    rewardClaimedDescription: 'Your verified referral was automatically added to the next funded reward round. No action is needed.',
    rewardAssigned: 'Reward payout is being prepared', rewardAssignedDescription: 'Your amount has been reserved in a payout round and is awaiting finalized distribution.',
    rewardPaid: 'Reward paid', rewardPaidDescription: 'The B3TR reward was verified on-chain and recorded in your reward history.',
    rewardForfeited: 'Reward not approved', rewardForfeitedDescription: 'This referral did not pass the final reward checks. Your invite slot is ready for another friend.',
    claimSuccess: 'Reward requested. It will be included in the next funded reward round.', claimError: 'Could not request the reward.',
    privacy: 'Privacy', terms: 'Terms', genericError: 'Something went wrong.', loadError: 'Could not load invitation data.', createError: 'Could not create an invitation.', cancelError: 'Could not cancel the invitation.',
    dappTitle: 'Built for the VeBetterDAO ecosystem',
    dappDescription: 'VeInvite helps new users get started and gives returning users a clear path back. Support for dApp-specific referral campaigns is planned for a future update.',
  },
  ko: {
    language: '한국어', languageAria: '언어', walletAria: '지갑 계정 열기',
    shareText: 'VeInvite와 함께 VeBetterDAO 미션에 참여해 보세요.',
    inviteAvailable: '초대 슬롯 1개 준비', inviteMission: '퀘스트 01', emptyTitle: '첫 친구를 초대하세요',
    emptyDescription: '초대 링크를 만들고 신규 또는 복귀 사용자의 VeBetterDAO 참여를 도와주세요.',
    createInvite: '초대 만들기', createNextInvite: '다음 친구 초대하기', creating: '만드는 중…', connectStart: '지갑 연결하고 시작하기', connecting: '지갑 여는 중…',
    rewardLabel: '온보딩 상태', rewardLocked: '친구가 미션을 완료하면 온보딩이 확인돼요', rewardUnlocked: '온보딩 완료', locked: '잠김', unlocked: '해제',
    inviteReadyBadge: '초대 준비 완료', inviteReadyTitle: '초대가 준비됐어요', inviteReadyDescription: '친구 한 명에게 링크를 보내세요. 친구가 참여하면 다음 단계가 시작돼요.',
    friendJoinedBadge: '친구 참여', friendJoinedTitle: '친구가 참여했어요', friendJoinedDescription: '친구가 VeInvite 미션을 진행하고 있어요.',
    reviewBadge: '최종 확인 중', reviewTitle: '마지막 단계를 확인하고 있어요', reviewDescription: '잠시만 기다려 주세요. 완료 전 마지막 확인이 필요해요.',
    completeBadge: '미션 완료', completeTitle: '초대가 완료됐어요', completeDescription: '친구가 미션을 완료했고 온보딩이 확인됐어요.',
    shareInvite: '초대 공유하기', copyLink: '링크 복사', copied: '초대 링크를 복사했어요.', cancelInvite: '초대 취소', cancelTitleWaiting: '이 초대 링크를 취소할까요?',
    cancelDescriptionWaiting: '이 링크는 더 이상 사용할 수 없고, 다시 친구 한 명을 초대할 수 있어요.', keepInvite: '초대 유지', confirmCancel: '초대 취소', cancelled: '초대가 취소됐어요. 새 초대를 만들 수 있어요.',
    noActive: '진행 중인 초대 없음', createLink: '초대', linkCreated: '링크 준비 완료', waitingForFriendStep: '친구 대기', friendJoins: '친구 참여 완료', activation: '최종 확인',
    waiting: '친구 대기 중', inProgress: '진행 중', checking: '확인 중', completed: '완료', codeLabel: '초대 코드',
    rewardTitle: '초대 보상 상태', rewardPending: '온보딩 확인 완료', rewardDescription: '현재 최종 보상 자격과 부정 활동 여부를 확인하고 있어요.',
    rewardClaimReady: '보상을 수령할 수 있어요', rewardClaimDescription: '추천 활동이 최종 검증을 통과했어요. 지금 수령 요청하면 다음 보상 라운드에 자동 반영됩니다.',
    claimReward: '보상 수령 요청', claimingReward: '요청하는 중…', rewardClaimed: '보상 대기열 자동 등록', rewardClaimedDescription: '최종 검증을 통과해 다음 보상 라운드 지급 대기열에 자동으로 등록됐어요. 따로 신청할 필요가 없습니다.',
    rewardAssigned: '보상 지급 준비 중', rewardAssignedDescription: '받을 금액이 지급 라운드에 배정됐으며 최종 전송을 준비하고 있어요.', rewardPaid: '보상 지급 완료', rewardPaidDescription: 'B3TR 지급이 온체인에서 확인되고 보상 내역에 기록됐어요.',
    rewardForfeited: '보상 지급 대상이 아니에요', rewardForfeitedDescription: '이번 초대는 최종 보상 검토를 통과하지 못했어요. 다른 친구를 새로 초대할 수 있어요.', claimSuccess: '보상 수령을 요청했어요. 다음 보상 라운드에 자동 반영됩니다.', claimError: '보상 수령을 요청하지 못했습니다.',
    privacy: '개인정보처리방침', terms: '이용약관', genericError: '오류가 발생했습니다.', loadError: '초대 정보를 불러오지 못했습니다.', createError: '초대 링크를 만들지 못했습니다.', cancelError: '초대를 취소하지 못했습니다.',
    dappTitle: 'VeBetterDAO 생태계를 위한 VeInvite', dappDescription: 'VeInvite는 신규 사용자가 생태계를 처음 경험하고, 쉬었던 사용자가 다시 돌아오도록 돕는 초대 앱이에요. dApp별 추천 캠페인 기능도 차차 지원할 예정이에요.',
  },
  zh: {
    language: '简体中文', languageAria: '语言', walletAria: '打开钱包账户', shareText: '通过 VeInvite 一起完成 VeBetterDAO 任务吧。',
    inviteAvailable: '1 个邀请名额可用', inviteMission: '任务 01', emptyTitle: '邀请你的第一位好友', emptyDescription: '创建一个邀请，帮助新用户或回归用户完成 VeInvite 引导任务。',
    createInvite: '创建邀请', createNextInvite: '邀请下一位好友', creating: '正在创建…', connectStart: '连接钱包并开始', connecting: '正在打开钱包…',
    rewardLabel: '引导状态', rewardLocked: '好友完成任务后即可完成引导', rewardUnlocked: '引导已完成', locked: '未解锁', unlocked: '已解锁',
    inviteReadyBadge: '邀请已就绪', inviteReadyTitle: '邀请链接准备好了', inviteReadyDescription: '把链接发给一位好友。好友加入后会进入下一步。',
    friendJoinedBadge: '好友已加入', friendJoinedTitle: '好友已加入', friendJoinedDescription: '好友正在完成 VeInvite 任务。',
    reviewBadge: '最终检查', reviewTitle: '正在确认最后一步', reviewDescription: '请稍等。通过最终验证后才能完成这次邀请。',
    completeBadge: '任务完成', completeTitle: '邀请已完成', completeDescription: '好友已完成任务，引导状态也已验证。',
    shareInvite: '分享邀请', copyLink: '复制链接', copied: '邀请链接已复制。', cancelInvite: '取消邀请', cancelTitleWaiting: '要取消这个邀请链接吗？', cancelDescriptionWaiting: '取消后此链接将失效，你的邀请名额会恢复。', keepInvite: '保留邀请', confirmCancel: '确认取消', cancelled: '邀请已取消，你可以创建新的邀请。',
    noActive: '没有进行中的邀请', createLink: '创建邀请', linkCreated: '链接已就绪', waitingForFriendStep: '等待好友', friendJoins: '好友已加入', activation: '最终验证', waiting: '等待好友', inProgress: '进行中', checking: '检查中', completed: '已完成', codeLabel: '邀请码',
    rewardTitle: '推荐状态', rewardPending: '引导已验证', rewardDescription: '正在进行最终奖励资格和防滥用检查。', rewardClaimReady: '奖励可以领取了', rewardClaimDescription: '这次推荐已通过最终检查。现在提交领取请求后，会自动进入下一次有资金的奖励轮次。', claimReward: '申请领取奖励', claimingReward: '正在提交…', rewardClaimed: '奖励已自动加入队列', rewardClaimedDescription: '推荐通过最终验证后，奖励已自动加入下一次有资金的奖励轮次，无需额外操作。', rewardAssigned: '正在准备奖励发放', rewardAssignedDescription: '你的奖励金额已分配到发放轮次，等待最终链上发放。', rewardPaid: '奖励已发放', rewardPaidDescription: 'B3TR 奖励已在链上验证，并记录到你的奖励历史中。', rewardForfeited: '未通过奖励审核', rewardForfeitedDescription: '这次推荐没有通过最终奖励检查。你的邀请名额已经可以用于下一位好友。', claimSuccess: '奖励申请已提交，将进入下一次有资金的奖励轮次。', claimError: '无法提交奖励申请。',
    privacy: '隐私政策', terms: '使用条款', genericError: '出现了问题。', loadError: '无法加载邀请信息。', createError: '无法创建邀请。', cancelError: '无法取消邀请。', dappTitle: '为 VeBetterDAO 生态打造', dappDescription: 'VeInvite 帮助新用户顺利开始，也为回归用户提供清晰的重新参与路径。面向特定 dApp 的推荐活动将在后续版本中逐步支持。',
  },
  hi: {
    language: 'हिन्दी', languageAria: 'भाषा', walletAria: 'वॉलेट अकाउंट खोलें', shareText: 'VeInvite के साथ VeBetterDAO मिशन में शामिल हों।',
    inviteAvailable: '1 आमंत्रण स्लॉट तैयार', inviteMission: 'क्वेस्ट 01', emptyTitle: 'अपने पहले दोस्त को आमंत्रित करें', emptyDescription: 'एक आमंत्रण बनाएँ और किसी नए या वापस लौटे उपयोगकर्ता को VeInvite ऑनबोर्डिंग मिशन पूरा करने में मदद करें।',
    createInvite: 'आमंत्रण बनाएँ', createNextInvite: 'अगले दोस्त को आमंत्रित करें', creating: 'बन रहा है…', connectStart: 'वॉलेट कनेक्ट करके शुरू करें', connecting: 'वॉलेट खुल रहा है…',
    rewardLabel: 'ऑनबोर्डिंग स्थिति', rewardLocked: 'ऑनबोर्डिंग पूरा करने के लिए मिशन पूरा होना ज़रूरी है', rewardUnlocked: 'ऑनबोर्डिंग पूरा', locked: 'लॉक', unlocked: 'अनलॉक',
    inviteReadyBadge: 'आमंत्रण तैयार', inviteReadyTitle: 'आपका आमंत्रण तैयार है', inviteReadyDescription: 'लिंक एक दोस्त को भेजें। उसके जुड़ते ही अगला चरण शुरू होगा।',
    friendJoinedBadge: 'दोस्त जुड़ गया', friendJoinedTitle: 'आपका दोस्त जुड़ गया', friendJoinedDescription: 'आपका दोस्त अभी VeInvite मिशन पूरा कर रहा है।',
    reviewBadge: 'अंतिम जाँच', reviewTitle: 'अंतिम चरण की जाँच हो रही है', reviewDescription: 'थोड़ा इंतज़ार करें। पूरा होने से पहले इस चरण का सत्यापन ज़रूरी है।',
    completeBadge: 'मिशन पूरा', completeTitle: 'आमंत्रण पूरा हुआ', completeDescription: 'आपके दोस्त ने मिशन पूरा कर लिया और ऑनबोर्डिंग सत्यापित हो गया।',
    shareInvite: 'आमंत्रण शेयर करें', copyLink: 'लिंक कॉपी करें', copied: 'आमंत्रण लिंक कॉपी हो गया।', cancelInvite: 'आमंत्रण रद्द करें', cancelTitleWaiting: 'यह आमंत्रण लिंक रद्द करें?', cancelDescriptionWaiting: 'यह लिंक काम करना बंद कर देगा और आपका आमंत्रण स्लॉट वापस मिल जाएगा।', keepInvite: 'आमंत्रण रखें', confirmCancel: 'रद्द करें', cancelled: 'आमंत्रण रद्द हो गया। अब नया आमंत्रण बना सकते हैं।',
    noActive: 'कोई सक्रिय आमंत्रण नहीं', createLink: 'आमंत्रण', linkCreated: 'लिंक तैयार', waitingForFriendStep: 'दोस्त का इंतज़ार', friendJoins: 'दोस्त जुड़ा', activation: 'अंतिम सत्यापन', waiting: 'दोस्त का इंतज़ार', inProgress: 'जारी', checking: 'जाँच हो रही है', completed: 'पूरा', codeLabel: 'आमंत्रण कोड',
    rewardTitle: 'रेफ़रल स्थिति', rewardPending: 'ऑनबोर्डिंग सत्यापित', rewardDescription: 'अंतिम इनाम पात्रता और दुरुपयोग-रोधी जाँच अभी चल रही है।', rewardClaimReady: 'आपका इनाम क्लेम करने के लिए तैयार है', rewardClaimDescription: 'रेफ़रल ने अंतिम जाँच पास कर ली है। अभी अनुरोध करने पर इसे अगली फंडेड रिवार्ड राउंड में शामिल किया जाएगा।', claimReward: 'इनाम का अनुरोध करें', claimingReward: 'अनुरोध हो रहा है…', rewardClaimed: 'इनाम अपने-आप कतार में जुड़ गया', rewardClaimedDescription: 'अंतिम सत्यापन पूरा होने के बाद आपका इनाम अगली फंडेड रिवार्ड राउंड की कतार में अपने-आप जोड़ दिया गया है। आपको कुछ और करने की ज़रूरत नहीं है।', rewardAssigned: 'इनाम भुगतान तैयार हो रहा है', rewardAssignedDescription: 'आपकी राशि एक भुगतान राउंड में आरक्षित है और अंतिम वितरण का इंतज़ार कर रही है।', rewardPaid: 'इनाम मिल गया', rewardPaidDescription: 'B3TR इनाम ऑन-चेन सत्यापित होकर आपके इनाम इतिहास में दर्ज हो गया।', rewardForfeited: 'इनाम स्वीकृत नहीं हुआ', rewardForfeitedDescription: 'यह रेफ़रल अंतिम इनाम जाँच पास नहीं कर सका। अब आप किसी और दोस्त को आमंत्रित कर सकते हैं।', claimSuccess: 'इनाम अनुरोध भेज दिया गया। इसे अगली फंडेड रिवार्ड राउंड में शामिल किया जाएगा।', claimError: 'इनाम का अनुरोध नहीं किया जा सका।',
    privacy: 'गोपनीयता', terms: 'शर्तें', genericError: 'कुछ गड़बड़ हो गई।', loadError: 'आमंत्रण डेटा लोड नहीं हो सका।', createError: 'आमंत्रण नहीं बन सका।', cancelError: 'आमंत्रण रद्द नहीं हो सका।', dappTitle: 'VeBetterDAO इकोसिस्टम के लिए बनाया गया', dappDescription: 'VeInvite नए उपयोगकर्ताओं को शुरुआत करने और वापसी करने वाले उपयोगकर्ताओं को आसानी से दोबारा जुड़ने में मदद करता है। dApp-विशिष्ट रेफ़रल कैंपेन का समर्थन आगे जोड़ा जाएगा।',
  },
  es: {
    language: 'Español', languageAria: 'Idioma', walletAria: 'Abrir cuenta de cartera', shareText: 'Únete a una misión de VeBetterDAO con VeInvite.',
    inviteAvailable: '1 INVITACIÓN DISPONIBLE', inviteMission: 'MISIÓN 01', emptyTitle: 'Invita a tu primer amigo', emptyDescription: 'Crea una invitación y ayuda a un usuario nuevo o que regresa a completar su incorporación con VeInvite.',
    createInvite: 'Crear invitación', createNextInvite: 'Invitar a otro amigo', creating: 'Creando…', connectStart: 'Conectar cartera y empezar', connecting: 'Abriendo cartera…',
    rewardLabel: 'ESTADO DE INCORPORACIÓN', rewardLocked: 'Completa la misión para terminar la incorporación', rewardUnlocked: 'Incorporación completada', locked: 'BLOQUEADO', unlocked: 'DESBLOQUEADO',
    inviteReadyBadge: 'INVITACIÓN LISTA', inviteReadyTitle: 'Tu invitación está lista', inviteReadyDescription: 'Envía el enlace a un amigo. El siguiente paso empieza cuando se una.',
    friendJoinedBadge: 'AMIGO SE UNIÓ', friendJoinedTitle: 'Tu amigo ya se unió', friendJoinedDescription: 'Tu amigo está completando ahora las misiones de VeInvite.',
    reviewBadge: 'COMPROBACIÓN FINAL', reviewTitle: 'Revisando el último paso', reviewDescription: 'Espera un momento. Este paso debe verificarse antes de completar la invitación.',
    completeBadge: 'MISIÓN COMPLETADA', completeTitle: 'Invitación completada', completeDescription: 'Tu amigo completó la misión y la incorporación quedó verificada.',
    shareInvite: 'Compartir invitación', copyLink: 'Copiar enlace', copied: 'Enlace de invitación copiado.', cancelInvite: 'Cancelar invitación', cancelTitleWaiting: '¿Cancelar este enlace de invitación?', cancelDescriptionWaiting: 'El enlace dejará de funcionar y recuperarás tu espacio de invitación.', keepInvite: 'Mantener invitación', confirmCancel: 'Cancelar invitación', cancelled: 'Invitación cancelada. Ya puedes crear otra.',
    noActive: 'No hay invitación activa', createLink: 'Invitar', linkCreated: 'Enlace listo', waitingForFriendStep: 'Esperando al amigo', friendJoins: 'Amigo se unió', activation: 'Verificación final', waiting: 'Esperando al amigo', inProgress: 'En curso', checking: 'Comprobando', completed: 'Completado', codeLabel: 'Código de invitación',
    rewardTitle: 'Estado de la recomendación', rewardPending: 'Incorporación verificada', rewardDescription: 'Las comprobaciones finales de recompensa y prevención de abuso siguen en curso.', rewardClaimReady: 'Tu recompensa está lista para solicitar', rewardClaimDescription: 'La recomendación superó las comprobaciones finales. Solicítala ahora y se incluirá en la próxima ronda de recompensas con fondos.', claimReward: 'Solicitar recompensa', claimingReward: 'Solicitando…', rewardClaimed: 'Recompensa añadida automáticamente', rewardClaimedDescription: 'Tras superar la verificación final, tu recompensa se añadió automáticamente a la próxima ronda con fondos. No tienes que hacer nada más.', rewardAssigned: 'Preparando el pago', rewardAssignedDescription: 'Tu importe está reservado en una ronda de pago y espera la distribución final.', rewardPaid: 'Recompensa pagada', rewardPaidDescription: 'La recompensa en B3TR se verificó en cadena y se registró en tu historial.', rewardForfeited: 'Recompensa no aprobada', rewardForfeitedDescription: 'Esta recomendación no superó las comprobaciones finales. Tu espacio de invitación está disponible para otro amigo.', claimSuccess: 'Recompensa solicitada. Se incluirá en la próxima ronda con fondos.', claimError: 'No se pudo solicitar la recompensa.',
    privacy: 'Privacidad', terms: 'Términos', genericError: 'Ha ocurrido un error.', loadError: 'No se pudieron cargar los datos de la invitación.', createError: 'No se pudo crear la invitación.', cancelError: 'No se pudo cancelar la invitación.', dappTitle: 'Creado para el ecosistema VeBetterDAO', dappDescription: 'VeInvite ayuda a los usuarios nuevos a empezar y ofrece a quienes regresan una ruta clara para volver. Las campañas de recomendación específicas por dApp se añadirán en una futura actualización.',
  },
  ja: {
    language: '日本語', languageAria: '言語', walletAria: 'ウォレットアカウントを開く', shareText: 'VeInviteでVeBetterDAOのミッションに参加しよう。',
    inviteAvailable: '招待枠 1件利用可能', inviteMission: 'クエスト 01', emptyTitle: '最初の友だちを招待しよう', emptyDescription: '招待リンクを作成して、新規または復帰ユーザーのVeInviteオンボーディングを手伝いましょう。',
    createInvite: '招待を作成', createNextInvite: '次の友だちを招待', creating: '作成中…', connectStart: 'ウォレットを接続して開始', connecting: 'ウォレットを開いています…',
    rewardLabel: 'オンボーディング状況', rewardLocked: 'ミッション完了でオンボーディングが完了します', rewardUnlocked: 'オンボーディング完了', locked: '未解除', unlocked: '解除済み',
    inviteReadyBadge: '招待準備完了', inviteReadyTitle: '招待リンクができました', inviteReadyDescription: '友だち1人にリンクを送りましょう。参加すると次のステップが始まります。', friendJoinedBadge: '友だちが参加', friendJoinedTitle: '友だちが参加しました', friendJoinedDescription: '友だちは現在VeInviteのミッションを進めています。',
    reviewBadge: '最終確認中', reviewTitle: '最後のステップを確認しています', reviewDescription: 'もう少しお待ちください。完了前にこのステップの確認が必要です。', completeBadge: 'ミッション完了', completeTitle: '招待が完了しました', completeDescription: '友だちがミッションを完了し、オンボーディングも確認されました。',
    shareInvite: '招待を共有', copyLink: 'リンクをコピー', copied: '招待リンクをコピーしました。', cancelInvite: '招待をキャンセル', cancelTitleWaiting: 'この招待リンクをキャンセルしますか？', cancelDescriptionWaiting: 'このリンクは使えなくなり、招待枠が戻ります。', keepInvite: '招待を残す', confirmCancel: 'キャンセルする', cancelled: '招待をキャンセルしました。新しい招待を作成できます。',
    noActive: '進行中の招待なし', createLink: '招待', linkCreated: 'リンク準備完了', waitingForFriendStep: '友だち待ち', friendJoins: '友だちが参加', activation: '最終確認', waiting: '友だち待ち', inProgress: '進行中', checking: '確認中', completed: '完了', codeLabel: '招待コード',
    rewardTitle: '招待報酬の状況', rewardPending: 'オンボーディング確認済み', rewardDescription: '最終的な報酬資格と不正利用チェックを行っています。', rewardClaimReady: '報酬を申請できます', rewardClaimDescription: '招待は最終確認を通過しました。今申請すると、次回の資金がある報酬ラウンドに自動で入ります。', claimReward: '報酬を申請', claimingReward: '申請中…', rewardClaimed: '報酬は自動で待機列に登録済み', rewardClaimedDescription: '最終確認を通過したため、次回の資金がある報酬ラウンドに自動で登録されました。追加の操作は不要です。', rewardAssigned: '報酬支払いを準備中', rewardAssignedDescription: '支払いラウンドで金額が確保され、最終送金を待っています。', rewardPaid: '報酬支払い完了', rewardPaidDescription: 'B3TR報酬の支払いがオンチェーンで確認され、履歴に記録されました。', rewardForfeited: '報酬対象外', rewardForfeitedDescription: 'この招待は最終報酬チェックを通過しませんでした。次の友だちを招待できます。', claimSuccess: '報酬を申請しました。次回の資金がある報酬ラウンドに入ります。', claimError: '報酬を申請できませんでした。',
    privacy: 'プライバシー', terms: '利用規約', genericError: 'エラーが発生しました。', loadError: '招待情報を読み込めませんでした。', createError: '招待を作成できませんでした。', cancelError: '招待をキャンセルできませんでした。', dappTitle: 'VeBetterDAOエコシステムのためのVeInvite', dappDescription: 'VeInviteは新規ユーザーのスタートを支え、復帰ユーザーには戻りやすい道筋を用意します。dAppごとの紹介キャンペーンは今後のアップデートで対応予定です。',
  },
  it: {
    language: 'Italiano', languageAria: 'Lingua', walletAria: 'Apri account wallet', shareText: 'Partecipa a una missione VeBetterDAO con VeInvite.',
    inviteAvailable: '1 INVITO DISPONIBILE', inviteMission: 'MISSIONE 01', emptyTitle: 'Invita il tuo primo amico', emptyDescription: 'Crea un invito e aiuta un nuovo utente, o uno che torna, a completare l’onboarding VeInvite.',
    createInvite: 'Crea invito', createNextInvite: 'Invita un altro amico', creating: 'Creazione…', connectStart: 'Collega il wallet e inizia', connecting: 'Apertura wallet…', rewardLabel: 'STATO ONBOARDING', rewardLocked: 'Completa la missione per terminare l’onboarding', rewardUnlocked: 'Onboarding completato', locked: 'BLOCCATO', unlocked: 'SBLOCCATO',
    inviteReadyBadge: 'INVITO PRONTO', inviteReadyTitle: 'Il tuo invito è pronto', inviteReadyDescription: 'Invia il link a un amico. Il passaggio successivo inizia quando si unisce.', friendJoinedBadge: 'AMICO SI È UNITO', friendJoinedTitle: 'Il tuo amico si è unito', friendJoinedDescription: 'Il tuo amico sta completando le missioni VeInvite.', reviewBadge: 'CONTROLLO FINALE', reviewTitle: 'Stiamo verificando l’ultimo passaggio', reviewDescription: 'Attendi un momento. Questo passaggio deve essere verificato prima della conclusione.', completeBadge: 'MISSIONE COMPLETATA', completeTitle: 'Invito completato', completeDescription: 'Il tuo amico ha completato la missione e l’onboarding è stato verificato.',
    shareInvite: 'Condividi invito', copyLink: 'Copia link', copied: 'Link di invito copiato.', cancelInvite: 'Annulla invito', cancelTitleWaiting: 'Annullare questo link di invito?', cancelDescriptionWaiting: 'Il link smetterà di funzionare e il tuo slot di invito tornerà disponibile.', keepInvite: 'Mantieni invito', confirmCancel: 'Annulla invito', cancelled: 'Invito annullato. Puoi crearne uno nuovo.', noActive: 'Nessun invito attivo', createLink: 'Invita', linkCreated: 'Link pronto', waitingForFriendStep: 'In attesa dell’amico', friendJoins: 'Amico si è unito', activation: 'Verifica finale', waiting: 'In attesa', inProgress: 'In corso', checking: 'Verifica in corso', completed: 'Completato', codeLabel: 'Codice invito',
    rewardTitle: 'Stato referral', rewardPending: 'Onboarding verificato', rewardDescription: 'Sono ancora in corso i controlli finali sulla ricompensa e contro gli abusi.', rewardClaimReady: 'La ricompensa è pronta da richiedere', rewardClaimDescription: 'Il referral ha superato i controlli finali. Richiedi ora la ricompensa e verrà inserita nella prossima tornata finanziata.', claimReward: 'Richiedi ricompensa', claimingReward: 'Richiesta in corso…', rewardClaimed: 'Ricompensa inserita automaticamente', rewardClaimedDescription: 'Dopo la verifica finale, la ricompensa è stata inserita automaticamente nella prossima tornata finanziata. Non devi fare altro.', rewardAssigned: 'Pagamento in preparazione', rewardAssignedDescription: 'L’importo è stato riservato in una tornata di pagamento ed è in attesa della distribuzione finale.', rewardPaid: 'Ricompensa pagata', rewardPaidDescription: 'La ricompensa B3TR è stata verificata on-chain e registrata nella cronologia.', rewardForfeited: 'Ricompensa non approvata', rewardForfeitedDescription: 'Questo referral non ha superato i controlli finali. Lo slot di invito è di nuovo disponibile.', claimSuccess: 'Ricompensa richiesta. Verrà inclusa nella prossima tornata finanziata.', claimError: 'Impossibile richiedere la ricompensa.',
    privacy: 'Privacy', terms: 'Termini', genericError: 'Si è verificato un errore.', loadError: 'Impossibile caricare i dati dell’invito.', createError: 'Impossibile creare l’invito.', cancelError: 'Impossibile annullare l’invito.', dappTitle: 'Creato per l’ecosistema VeBetterDAO', dappDescription: 'VeInvite aiuta i nuovi utenti a iniziare e offre a chi torna un percorso chiaro per rientrare. Le campagne referral dedicate a singole dApp arriveranno in un futuro aggiornamento.',
  },
  tr: {
    language: 'Türkçe', languageAria: 'Dil', walletAria: 'Cüzdan hesabını aç', shareText: 'VeInvite ile bir VeBetterDAO görevine katıl.',
    inviteAvailable: '1 DAVET HAKKI HAZIR', inviteMission: 'GÖREV 01', emptyTitle: 'İlk arkadaşını davet et', emptyDescription: 'Bir davet oluştur ve yeni veya geri dönen bir kullanıcının VeInvite başlangıç görevini tamamlamasına yardımcı ol.', createInvite: 'Davet oluştur', createNextInvite: 'Başka bir arkadaşını davet et', creating: 'Oluşturuluyor…', connectStart: 'Cüzdanı bağla ve başla', connecting: 'Cüzdan açılıyor…', rewardLabel: 'BAŞLANGIÇ DURUMU', rewardLocked: 'Başlangıcı tamamlamak için görev bitmeli', rewardUnlocked: 'Başlangıç tamamlandı', locked: 'KİLİTLİ', unlocked: 'KİLİT AÇILDI',
    inviteReadyBadge: 'DAVET HAZIR', inviteReadyTitle: 'Davetin hazır', inviteReadyDescription: 'Bağlantıyı bir arkadaşına gönder. Katıldığında sonraki adım başlar.', friendJoinedBadge: 'ARKADAŞ KATILDI', friendJoinedTitle: 'Arkadaşın katıldı', friendJoinedDescription: 'Arkadaşın şu anda VeInvite görevlerini tamamlıyor.', reviewBadge: 'SON KONTROL', reviewTitle: 'Son adım kontrol ediliyor', reviewDescription: 'Biraz bekle. Tamamlanmadan önce bu adım doğrulanmalı.', completeBadge: 'GÖREV TAMAMLANDI', completeTitle: 'Davet tamamlandı', completeDescription: 'Arkadaşın görevi tamamladı ve başlangıç doğrulandı.', shareInvite: 'Daveti paylaş', copyLink: 'Bağlantıyı kopyala', copied: 'Davet bağlantısı kopyalandı.', cancelInvite: 'Daveti iptal et', cancelTitleWaiting: 'Bu davet bağlantısı iptal edilsin mi?', cancelDescriptionWaiting: 'Bağlantı artık çalışmaz ve davet hakkın geri gelir.', keepInvite: 'Daveti koru', confirmCancel: 'Daveti iptal et', cancelled: 'Davet iptal edildi. Yeni bir davet oluşturabilirsin.', noActive: 'Aktif davet yok', createLink: 'Davet', linkCreated: 'Bağlantı hazır', waitingForFriendStep: 'Arkadaş bekleniyor', friendJoins: 'Arkadaş katıldı', activation: 'Son doğrulama', waiting: 'Arkadaş bekleniyor', inProgress: 'Devam ediyor', checking: 'Kontrol ediliyor', completed: 'Tamamlandı', codeLabel: 'Davet kodu',
    rewardTitle: 'Davet ödülü durumu', rewardPending: 'Başlangıç doğrulandı', rewardDescription: 'Son ödül uygunluğu ve kötüye kullanım kontrolleri devam ediyor.', rewardClaimReady: 'Ödülünü talep edebilirsin', rewardClaimDescription: 'Davet son kontrolleri geçti. Şimdi talep edersen bir sonraki fonlanmış ödül turuna eklenir.', claimReward: 'Ödülü talep et', claimingReward: 'Talep ediliyor…', rewardClaimed: 'Ödül otomatik olarak sıraya alındı', rewardClaimedDescription: 'Son doğrulamanın ardından ödülün bir sonraki fonlanmış ödül turuna otomatik olarak eklendi. Başka bir işlem yapman gerekmiyor.', rewardAssigned: 'Ödül ödemesi hazırlanıyor', rewardAssignedDescription: 'Tutarın ödeme turunda ayrıldı ve kesin dağıtımı bekliyor.', rewardPaid: 'Ödül ödendi', rewardPaidDescription: 'B3TR ödülü zincir üzerinde doğrulandı ve ödül geçmişine kaydedildi.', rewardForfeited: 'Ödül onaylanmadı', rewardForfeitedDescription: 'Bu davet son ödül kontrollerini geçemedi. Davet hakkını başka bir arkadaşın için kullanabilirsin.', claimSuccess: 'Ödül talep edildi. Bir sonraki fonlanmış tura eklenecek.', claimError: 'Ödül talep edilemedi.', privacy: 'Gizlilik', terms: 'Koşullar', genericError: 'Bir hata oluştu.', loadError: 'Davet bilgileri yüklenemedi.', createError: 'Davet oluşturulamadı.', cancelError: 'Davet iptal edilemedi.', dappTitle: 'VeBetterDAO ekosistemi için geliştirildi', dappDescription: 'VeInvite yeni kullanıcıların başlamasını, geri dönenlerin ise kolayca yeniden katılmasını sağlar. dApp’e özel davet kampanyaları ileride desteklenecek.',
  },
  nl: {
    language: 'Nederlands', languageAria: 'Taal', walletAria: 'Walletaccount openen', shareText: 'Doe mee aan een VeBetterDAO-missie met VeInvite.',
    inviteAvailable: '1 UITNODIGING BESCHIKBAAR', inviteMission: 'MISSIE 01', emptyTitle: 'Nodig je eerste vriend uit', emptyDescription: 'Maak één uitnodiging en help een nieuwe of terugkerende gebruiker de VeInvite-onboarding af te ronden.', createInvite: 'Uitnodiging maken', createNextInvite: 'Nog een vriend uitnodigen', creating: 'Wordt gemaakt…', connectStart: 'Wallet verbinden en starten', connecting: 'Wallet openen…', rewardLabel: 'ONBOARDINGSTATUS', rewardLocked: 'Rond de missie af om de onboarding te voltooien', rewardUnlocked: 'Onboarding voltooid', locked: 'VERGRENDELD', unlocked: 'ONTGRENDELD', inviteReadyBadge: 'UITNODIGING KLAAR', inviteReadyTitle: 'Je uitnodiging is klaar', inviteReadyDescription: 'Stuur de link naar één vriend. De volgende stap begint zodra die meedoet.', friendJoinedBadge: 'VRIEND DOET MEE', friendJoinedTitle: 'Je vriend doet mee', friendJoinedDescription: 'Je vriend werkt nu aan de VeInvite-missies.', reviewBadge: 'LAATSTE CONTROLE', reviewTitle: 'De laatste stap wordt gecontroleerd', reviewDescription: 'Even geduld. Deze stap moet worden bevestigd voordat de uitnodiging klaar is.', completeBadge: 'MISSIE VOLTOOID', completeTitle: 'Uitnodiging voltooid', completeDescription: 'Je vriend heeft de missie afgerond en de onboarding is geverifieerd.', shareInvite: 'Uitnodiging delen', copyLink: 'Link kopiëren', copied: 'Uitnodigingslink gekopieerd.', cancelInvite: 'Uitnodiging annuleren', cancelTitleWaiting: 'Deze uitnodigingslink annuleren?', cancelDescriptionWaiting: 'De link werkt daarna niet meer en je uitnodigingsplek komt weer vrij.', keepInvite: 'Uitnodiging behouden', confirmCancel: 'Uitnodiging annuleren', cancelled: 'Uitnodiging geannuleerd. Je kunt een nieuwe maken.', noActive: 'Geen actieve uitnodiging', createLink: 'Uitnodigen', linkCreated: 'Link klaar', waitingForFriendStep: 'Wachten op vriend', friendJoins: 'Vriend doet mee', activation: 'Laatste controle', waiting: 'Wachten op vriend', inProgress: 'Bezig', checking: 'Controleren', completed: 'Voltooid', codeLabel: 'Uitnodigingscode', rewardTitle: 'Status van beloning', rewardPending: 'Onboarding geverifieerd', rewardDescription: 'De laatste belonings- en anti-misbruikcontroles lopen nog.', rewardClaimReady: 'Je beloning kan worden aangevraagd', rewardClaimDescription: 'De uitnodiging heeft de laatste controles doorstaan. Vraag de beloning nu aan; dan gaat die mee in de volgende gefinancierde ronde.', claimReward: 'Beloning aanvragen', claimingReward: 'Aanvragen…', rewardClaimed: 'Beloning automatisch in de wachtrij', rewardClaimedDescription: 'Na de laatste verificatie is je beloning automatisch toegevoegd aan de volgende gefinancierde ronde. Je hoeft niets meer te doen.', rewardAssigned: 'Uitbetaling wordt voorbereid', rewardAssignedDescription: 'Je bedrag is gereserveerd in een uitbetalingsronde en wacht op de definitieve distributie.', rewardPaid: 'Beloning uitbetaald', rewardPaidDescription: 'De B3TR-beloning is on-chain geverifieerd en in je beloningsgeschiedenis vastgelegd.', rewardForfeited: 'Beloning niet goedgekeurd', rewardForfeitedDescription: 'Deze uitnodiging heeft de laatste controles niet doorstaan. Je kunt weer iemand anders uitnodigen.', claimSuccess: 'Beloning aangevraagd. Deze gaat mee in de volgende gefinancierde ronde.', claimError: 'De beloning kon niet worden aangevraagd.', privacy: 'Privacy', terms: 'Voorwaarden', genericError: 'Er ging iets mis.', loadError: 'Uitnodigingsgegevens konden niet worden geladen.', createError: 'De uitnodiging kon niet worden gemaakt.', cancelError: 'De uitnodiging kon niet worden geannuleerd.', dappTitle: 'Gebouwd voor het VeBetterDAO-ecosysteem', dappDescription: 'VeInvite helpt nieuwe gebruikers op weg en geeft terugkerende gebruikers een duidelijke route terug. dApp-specifieke referralcampagnes volgen in een toekomstige update.',
  },
  de: {
    language: 'Deutsch', languageAria: 'Sprache', walletAria: 'Wallet öffnen', shareText: 'Mach mit VeInvite bei einer VeBetterDAO-Mission mit.',
    inviteAvailable: '1 EINLADUNG VERFÜGBAR', inviteMission: 'MISSION 01', emptyTitle: 'Lade deinen ersten Freund ein', emptyDescription: 'Erstelle eine Einladung und hilf einem neuen oder zurückkehrenden Nutzer beim VeInvite-Onboarding.', createInvite: 'Einladung erstellen', createNextInvite: 'Nächsten Freund einladen', creating: 'Wird erstellt…', connectStart: 'Wallet verbinden und starten', connecting: 'Wallet wird geöffnet…', rewardLabel: 'ONBOARDING-STATUS', rewardLocked: 'Mission abschließen, um das Onboarding zu beenden', rewardUnlocked: 'Onboarding abgeschlossen', locked: 'GESPERRT', unlocked: 'FREIGESCHALTET', inviteReadyBadge: 'EINLADUNG BEREIT', inviteReadyTitle: 'Deine Einladung ist bereit', inviteReadyDescription: 'Schick den Link an einen Freund. Sobald er teilnimmt, beginnt der nächste Schritt.', friendJoinedBadge: 'FREUND IST DABEI', friendJoinedTitle: 'Dein Freund ist dabei', friendJoinedDescription: 'Dein Freund erledigt gerade die VeInvite-Missionen.', reviewBadge: 'ABSCHLUSSPRÜFUNG', reviewTitle: 'Der letzte Schritt wird geprüft', reviewDescription: 'Einen Moment bitte. Dieser Schritt muss vor dem Abschluss bestätigt werden.', completeBadge: 'MISSION ABGESCHLOSSEN', completeTitle: 'Einladung abgeschlossen', completeDescription: 'Dein Freund hat die Mission abgeschlossen und das Onboarding wurde bestätigt.', shareInvite: 'Einladung teilen', copyLink: 'Link kopieren', copied: 'Einladungslink kopiert.', cancelInvite: 'Einladung abbrechen', cancelTitleWaiting: 'Diesen Einladungslink abbrechen?', cancelDescriptionWaiting: 'Der Link funktioniert danach nicht mehr und dein Einladungsplatz wird wieder frei.', keepInvite: 'Einladung behalten', confirmCancel: 'Einladung abbrechen', cancelled: 'Einladung abgebrochen. Du kannst eine neue erstellen.', noActive: 'Keine aktive Einladung', createLink: 'Einladen', linkCreated: 'Link bereit', waitingForFriendStep: 'Warten auf Freund', friendJoins: 'Freund ist dabei', activation: 'Abschlussprüfung', waiting: 'Warten auf Freund', inProgress: 'In Bearbeitung', checking: 'Wird geprüft', completed: 'Abgeschlossen', codeLabel: 'Einladungscode', rewardTitle: 'Belohnungsstatus', rewardPending: 'Onboarding bestätigt', rewardDescription: 'Die abschließenden Belohnungs- und Missbrauchsprüfungen laufen noch.', rewardClaimReady: 'Deine Belohnung kann angefordert werden', rewardClaimDescription: 'Die Einladung hat alle abschließenden Prüfungen bestanden. Fordere die Belohnung jetzt an; sie wird in die nächste finanzierte Runde aufgenommen.', claimReward: 'Belohnung anfordern', claimingReward: 'Wird angefordert…', rewardClaimed: 'Belohnung automatisch eingeplant', rewardClaimedDescription: 'Nach der abschließenden Prüfung wurde deine Belohnung automatisch für die nächste finanzierte Runde eingeplant. Du musst nichts weiter tun.', rewardAssigned: 'Auszahlung wird vorbereitet', rewardAssignedDescription: 'Dein Betrag ist in einer Auszahlungsrunde reserviert und wartet auf die endgültige Verteilung.', rewardPaid: 'Belohnung ausgezahlt', rewardPaidDescription: 'Die B3TR-Belohnung wurde on-chain bestätigt und in deinem Belohnungsverlauf gespeichert.', rewardForfeited: 'Belohnung nicht genehmigt', rewardForfeitedDescription: 'Diese Einladung hat die abschließenden Prüfungen nicht bestanden. Dein Einladungsplatz ist wieder frei.', claimSuccess: 'Belohnung angefordert. Sie wird in die nächste finanzierte Runde aufgenommen.', claimError: 'Die Belohnung konnte nicht angefordert werden.', privacy: 'Datenschutz', terms: 'Bedingungen', genericError: 'Etwas ist schiefgelaufen.', loadError: 'Einladungsdaten konnten nicht geladen werden.', createError: 'Die Einladung konnte nicht erstellt werden.', cancelError: 'Die Einladung konnte nicht abgebrochen werden.', dappTitle: 'Für das VeBetterDAO-Ökosystem entwickelt', dappDescription: 'VeInvite erleichtert neuen Nutzern den Einstieg und bietet Rückkehrern einen klaren Weg zurück. dApp-spezifische Empfehlungsaktionen sind für ein späteres Update geplant.',
  },
  fr: {
    language: 'Français', languageAria: 'Langue', walletAria: 'Ouvrir le compte wallet', shareText: 'Participez à une mission VeBetterDAO avec VeInvite.',
    inviteAvailable: '1 INVITATION DISPONIBLE', inviteMission: 'MISSION 01', emptyTitle: 'Invitez votre premier ami', emptyDescription: 'Créez une invitation et aidez un nouvel utilisateur ou un utilisateur qui revient à terminer son onboarding VeInvite.', createInvite: 'Créer une invitation', createNextInvite: 'Inviter un autre ami', creating: 'Création…', connectStart: 'Connecter le wallet et commencer', connecting: 'Ouverture du wallet…', rewardLabel: 'STATUT DE L’ONBOARDING', rewardLocked: 'Terminez la mission pour finaliser l’onboarding', rewardUnlocked: 'Onboarding terminé', locked: 'VERROUILLÉ', unlocked: 'DÉVERROUILLÉ', inviteReadyBadge: 'INVITATION PRÊTE', inviteReadyTitle: 'Votre invitation est prête', inviteReadyDescription: 'Envoyez le lien à un ami. L’étape suivante commence lorsqu’il rejoint VeInvite.', friendJoinedBadge: 'AMI INSCRIT', friendJoinedTitle: 'Votre ami a rejoint VeInvite', friendJoinedDescription: 'Votre ami est en train de terminer ses missions VeInvite.', reviewBadge: 'VÉRIFICATION FINALE', reviewTitle: 'Vérification de la dernière étape', reviewDescription: 'Encore un instant. Cette étape doit être validée avant la fin.', completeBadge: 'MISSION TERMINÉE', completeTitle: 'Invitation terminée', completeDescription: 'Votre ami a terminé la mission et l’onboarding a été vérifié.', shareInvite: 'Partager l’invitation', copyLink: 'Copier le lien', copied: 'Lien d’invitation copié.', cancelInvite: 'Annuler l’invitation', cancelTitleWaiting: 'Annuler ce lien d’invitation ?', cancelDescriptionWaiting: 'Le lien cessera de fonctionner et votre place d’invitation sera libérée.', keepInvite: 'Garder l’invitation', confirmCancel: 'Annuler l’invitation', cancelled: 'Invitation annulée. Vous pouvez en créer une nouvelle.', noActive: 'Aucune invitation active', createLink: 'Inviter', linkCreated: 'Lien prêt', waitingForFriendStep: 'En attente de l’ami', friendJoins: 'Ami inscrit', activation: 'Vérification finale', waiting: 'En attente', inProgress: 'En cours', checking: 'Vérification', completed: 'Terminé', codeLabel: 'Code d’invitation', rewardTitle: 'Statut de la récompense', rewardPending: 'Onboarding vérifié', rewardDescription: 'Les contrôles finaux d’éligibilité à la récompense et de prévention des abus sont toujours en cours.', rewardClaimReady: 'Votre récompense peut être demandée', rewardClaimDescription: 'Votre invitation a passé les contrôles finaux. Demandez la récompense maintenant : elle sera ajoutée à la prochaine manche financée.', claimReward: 'Demander la récompense', claimingReward: 'Demande en cours…', rewardClaimed: 'Récompense ajoutée automatiquement', rewardClaimedDescription: 'Après la vérification finale, votre récompense a été ajoutée automatiquement à la prochaine manche financée. Aucune autre action n’est nécessaire.', rewardAssigned: 'Paiement en préparation', rewardAssignedDescription: 'Votre montant a été réservé dans une manche de paiement et attend la distribution finale.', rewardPaid: 'Récompense versée', rewardPaidDescription: 'La récompense B3TR a été vérifiée on-chain et enregistrée dans votre historique.', rewardForfeited: 'Récompense non approuvée', rewardForfeitedDescription: 'Cette invitation n’a pas passé les contrôles finaux. Votre place d’invitation est disponible pour un autre ami.', claimSuccess: 'Récompense demandée. Elle sera incluse dans la prochaine manche financée.', claimError: 'Impossible de demander la récompense.', privacy: 'Confidentialité', terms: 'Conditions', genericError: 'Un problème est survenu.', loadError: 'Impossible de charger les données de l’invitation.', createError: 'Impossible de créer l’invitation.', cancelError: 'Impossible d’annuler l’invitation.', dappTitle: 'Conçu pour l’écosystème VeBetterDAO', dappDescription: 'VeInvite aide les nouveaux utilisateurs à démarrer et offre aux utilisateurs qui reviennent un chemin clair pour reprendre. Les campagnes de parrainage propres à chaque dApp sont prévues dans une future mise à jour.',
  },
};
