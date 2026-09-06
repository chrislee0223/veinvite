export type QaStateArea =
  | '영구 초대'
  | '기존 초대'
  | '홈'
  | '미션'
  | '보상'
  | '알림'
  | '지갑·세션'
  | '약관'
  | '설정'
  | '리더보드'
  | '추천 네트워크'
  | '외부 UI';

export type QaStateLifecycle = 'production' | 'legacy' | 'future' | 'external';
export type QaStateCoverage = 'direct' | 'partial' | 'missing' | 'external';
export type QaStateKind = 'screen' | 'overlay' | 'feedback' | 'transition';
export type QaStatePriority = 'critical' | 'high' | 'normal';

export type QaKnownState = {
  id: string;
  label: string;
  area: QaStateArea;
  lifecycle: QaStateLifecycle;
  coverage: QaStateCoverage;
  kind: QaStateKind;
  priority: QaStatePriority;
  userVisible: boolean;
  sourcePaths: string[];
  scenarioIds: string[];
  note?: string;
};

const permanentInvite = 'src/components/PermanentReferralClient.tsx';
const legacyInvite = 'src/components/InviteeClient.tsx';
const inviteLanding = 'src/components/InviteLandingV2.tsx';
const home = 'src/components/HomeClient.tsx';
const notifications = 'src/components/InAppInviteNotifications.tsx';
const notificationHistory = 'src/components/InviteNotificationHistoryCenter.tsx';
const notificationSurface = 'src/components/InviteNotificationSurfaceV2.tsx';
const walletSession = 'src/components/WalletSessionGate.tsx';
const legalConsent = 'src/components/LegalConsentGate.tsx';
const settings = 'src/components/AppSettings.tsx';
const leaderboard = 'src/components/PublicLeaderboard.tsx';

function knownState(state: QaKnownState): QaKnownState {
  return state;
}

export const QA_KNOWN_STATES: QaKnownState[] = [
  // Permanent referral (/r/[key])
  knownState({ id: 'PRI-LANGUAGE-SETUP', label: '첫 방문 언어 선택', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [permanentInvite, 'src/components/LanguageSelectV2.tsx'], scenarioIds: [] }),
  knownState({ id: 'PRI-BOOT-BRAND', label: '초기 언어 준비 로고', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'normal', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: [] }),
  knownState({ id: 'PRI-LINK-CHECKING', label: '초대 링크 확인 중', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: [] }),
  knownState({ id: 'PRI-LANDING', label: '정상 초대 안내', area: '영구 초대', lifecycle: 'production', coverage: 'direct', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [permanentInvite, inviteLanding], scenarioIds: ['invite-landing-ko-mobile', 'invite-landing-en-desktop'] }),
  knownState({ id: 'PRI-LANDING-DISABLED', label: '초대 안내 버튼 잠김', area: '영구 초대', lifecycle: 'production', coverage: 'direct', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [inviteLanding], scenarioIds: ['invite-landing-disabled'] }),
  knownState({ id: 'PRI-WALLET-REQUIRED', label: '지갑 연결 필요', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: [] }),
  knownState({ id: 'PRI-WALLET-CONNECTED', label: '지갑 연결 완료 후 계속', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: [] }),
  knownState({ id: 'PRI-ELIGIBILITY-CHECKING', label: '자격 확인 중', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: [] }),
  knownState({ id: 'PRI-SUCCESS-NEW', label: '신규 사용자 참여 성공', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: [] }),
  knownState({ id: 'PRI-SUCCESS-RETURNING', label: '복귀 사용자 참여 성공', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: [] }),
  knownState({ id: 'PRI-ERROR-INVALID', label: '잘못되거나 만료된 링크', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: [] }),
  knownState({ id: 'PRI-ERROR-SLOTS-FULL', label: '초대 슬롯 가득 참', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: [] }),
  knownState({ id: 'PRI-ERROR-EXISTING', label: '기존 활성 사용자 참여 불가', area: '영구 초대', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: ['eligibility-preview'] }),
  knownState({ id: 'PRI-ERROR-SELF', label: '자기 초대 차단', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: [] }),
  knownState({ id: 'PRI-ERROR-ALREADY-REFERRED', label: '이미 다른 초대에 연결됨', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: [] }),
  knownState({ id: 'PRI-ERROR-ELIGIBILITY', label: '일시적 자격 확인 오류', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [permanentInvite], scenarioIds: [] }),
  knownState({ id: 'PRI-ALREADY-CLAIMED-REDIRECT', label: '기존 참여 링크로 이어가기', area: '영구 초대', lifecycle: 'production', coverage: 'missing', kind: 'transition', priority: 'high', userVisible: false, sourcePaths: [permanentInvite], scenarioIds: [], note: '화면보다 리다이렉트 전환 검증 대상.' }),

  // Legacy invite (/i/[code]) — still reachable for already-created invites.
  knownState({ id: 'LEG-LANGUAGE-SETUP', label: '기존 초대 첫 방문 언어 선택', area: '기존 초대', lifecycle: 'legacy', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite, 'src/components/LanguageSelectV2.tsx'], scenarioIds: [] }),
  knownState({ id: 'LEG-LANDING', label: '기존 초대 안내', area: '기존 초대', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite, inviteLanding], scenarioIds: ['invite-landing-ko-mobile'] }),
  knownState({ id: 'LEG-WALLET-REQUIRED', label: '기존 초대 지갑 연결 필요', area: '기존 초대', lifecycle: 'legacy', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: [] }),
  knownState({ id: 'LEG-ELIGIBILITY-CHECKING', label: '기존 초대 자격 확인 중', area: '기존 초대', lifecycle: 'legacy', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: [] }),
  knownState({ id: 'LEG-UNDER-REVIEW', label: '수동/최종 검토 중', area: '기존 초대', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: ['invite-demo-review'] }),
  knownState({ id: 'LEG-SUCCESS-NEW', label: '기존 초대 신규 사용자 성공', area: '기존 초대', lifecycle: 'legacy', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: [] }),
  knownState({ id: 'LEG-SUCCESS-RETURNING', label: '기존 초대 복귀 사용자 성공', area: '기존 초대', lifecycle: 'legacy', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: [] }),
  knownState({ id: 'LEG-MISSION-0-3', label: 'dApp 0/3 시작 상태', area: '미션', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'LEG-MISSION-1-3', label: 'dApp 1/3 진행 상태', area: '미션', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'LEG-MISSION-2-3', label: 'dApp 2/3 진행 상태', area: '미션', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'LEG-MISSION-3-3', label: 'dApp 3/3 완료 상태', area: '미션', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'LEG-VOT3-LOCKED', label: 'VOT3 단계 잠김', area: '미션', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'normal', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'LEG-VOT3-READY', label: 'VOT3 전환 가능', area: '미션', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'LEG-VOT3-DONE', label: 'VOT3 전환 완료', area: '미션', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'LEG-VOTE-LOCKED', label: '거버넌스 투표 잠김', area: '미션', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'normal', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'LEG-VOTE-READY', label: '거버넌스 투표 가능', area: '미션', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'LEG-ALL-MISSIONS-DONE', label: '모든 미션 완료', area: '미션', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'LEG-COMPLETED-INCOMPLETE', label: '과거 완료 기록과 미션 불일치', area: '미션', lifecycle: 'legacy', coverage: 'missing', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: [] }),
  knownState({ id: 'LEG-ERROR-INVALID', label: '기존 초대 링크 없음/만료', area: '기존 초대', lifecycle: 'legacy', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: [] }),
  knownState({ id: 'LEG-ERROR-USED', label: '이미 사용된 기존 초대', area: '기존 초대', lifecycle: 'legacy', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: [] }),
  knownState({ id: 'LEG-ERROR-EXISTING', label: '기존 활성 사용자 거절', area: '기존 초대', lifecycle: 'legacy', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: ['eligibility-preview'] }),
  knownState({ id: 'LEG-ERROR-SELF', label: '기존 초대 자기 초대 거절', area: '기존 초대', lifecycle: 'legacy', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: [] }),
  knownState({ id: 'LEG-ERROR-ALREADY-REFERRED', label: '기존 초대 중복 추천 거절', area: '기존 초대', lifecycle: 'legacy', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: [] }),
  knownState({ id: 'LEG-ERROR-ELIGIBILITY', label: '기존 초대 자격 확인 오류', area: '기존 초대', lifecycle: 'legacy', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: [] }),
  knownState({ id: 'LEG-ERROR-COMPLETE', label: '기존 미션 완료 처리 오류', area: '기존 초대', lifecycle: 'legacy', coverage: 'missing', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [legacyInvite], scenarioIds: [] }),

  // Home / inviter lifecycle.
  knownState({ id: 'HOME-NO-WALLET', label: '지갑 미연결 홈', area: '홈', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [home], scenarioIds: ['existing-preview-hub'] }),
  knownState({ id: 'HOME-WALLET-MODAL-PENDING', label: '지갑 연결창 여는 중', area: '홈', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [home], scenarioIds: [] }),
  knownState({ id: 'HOME-STARTUP-LOADING', label: '홈 데이터 초기 로딩', area: '홈', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [home], scenarioIds: [] }),
  knownState({ id: 'HOME-LINK-SKELETON', label: '영구 초대 링크 로딩', area: '홈', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'normal', userVisible: true, sourcePaths: [home], scenarioIds: [] }),
  knownState({ id: 'HOME-LINK-ERROR', label: '영구 초대 링크 조회 오류', area: '홈', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [home], scenarioIds: [] }),
  knownState({ id: 'HOME-SLOTS-SKELETON', label: '초대 슬롯 로딩', area: '홈', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'normal', userVisible: true, sourcePaths: [home], scenarioIds: [] }),
  knownState({ id: 'HOME-SLOTS-EMPTY', label: '초대 슬롯 0/2', area: '홈', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [home], scenarioIds: ['mission-reward-preview', 'existing-preview-hub'] }),
  knownState({ id: 'HOME-SLOT-PENDING', label: '친구 참여 대기 슬롯', area: '홈', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [home], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'HOME-SLOT-ACTIVATING', label: '친구 미션 진행 중 슬롯', area: '홈', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [home], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'HOME-SLOT-REVIEW', label: '친구 최종 검토 중 슬롯', area: '홈', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [home], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'HOME-SLOT-COMPLETED', label: '활성화 완료 슬롯', area: '홈', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [home], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'HOME-SLOTS-FULL', label: '초대 슬롯 2/2 사용 중', area: '홈', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [home], scenarioIds: [] }),
  knownState({ id: 'HOME-CANCEL-CONFIRM', label: '기존 초대 취소 확인 팝업', area: '홈', lifecycle: 'production', coverage: 'missing', kind: 'overlay', priority: 'high', userVisible: true, sourcePaths: [home], scenarioIds: [] }),
  knownState({ id: 'HOME-COPY-SUCCESS', label: '초대 링크 복사 성공 안내', area: '홈', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'normal', userVisible: true, sourcePaths: [home, 'src/components/TransientSnackbar.tsx'], scenarioIds: [] }),
  knownState({ id: 'HOME-COPY-ERROR', label: '초대 링크 복사 실패 안내', area: '홈', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [home, 'src/components/TransientSnackbar.tsx'], scenarioIds: [] }),
  knownState({ id: 'HOME-SHARE-CANCEL', label: '공유창 사용자 취소 복귀', area: '홈', lifecycle: 'production', coverage: 'missing', kind: 'transition', priority: 'normal', userVisible: false, sourcePaths: [home], scenarioIds: [], note: '브라우저/OS 공유창 자체는 외부 UI이고 VeInvite는 취소 후 기존 화면을 유지한다.' }),
  knownState({ id: 'HOME-LOAD-ERROR', label: '초대 목록 조회 오류 안내', area: '홈', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [home], scenarioIds: [] }),

  // Reward claim states exposed on Home.
  knownState({ id: 'REWARD-AWAITING-CLAIM', label: '보상 수령 가능', area: '보상', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [home], scenarioIds: ['mission-reward-preview'] }),
  knownState({ id: 'REWARD-CLAIM-PENDING', label: '보상 수령 처리 중', area: '보상', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'critical', userVisible: true, sourcePaths: [home], scenarioIds: [] }),
  knownState({ id: 'REWARD-CLAIM-QUEUED', label: '보상 수령 요청 완료 안내', area: '보상', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'critical', userVisible: true, sourcePaths: [home, 'src/components/TransientSnackbar.tsx'], scenarioIds: [] }),
  knownState({ id: 'REWARD-CLAIM-ERROR', label: '보상 수령 실패 안내', area: '보상', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'critical', userVisible: true, sourcePaths: [home, 'src/components/TransientSnackbar.tsx'], scenarioIds: [] }),

  // Notification bell, history, and event surfaces.
  knownState({ id: 'NOTI-BELL-EMPTY', label: '알림 없음', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'high', userVisible: true, sourcePaths: [notifications, notificationHistory], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-BELL-UNREAD', label: '읽지 않은 알림 배지', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [notifications, notificationHistory], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-HISTORY-OPEN', label: '과거 알림 이력 열림', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'critical', userVisible: true, sourcePaths: [notifications, notificationHistory], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-HISTORY-LOADING', label: '알림 이력 로딩', area: '알림', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'normal', userVisible: true, sourcePaths: [notifications, notificationHistory], scenarioIds: [] }),
  knownState({ id: 'NOTI-HISTORY-ERROR', label: '알림 이력 조회/처리 오류', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [notifications, notificationHistory], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-HISTORY-READ', label: '읽은 과거 알림', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'normal', userVisible: true, sourcePaths: [notificationHistory], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-HISTORY-UNREAD', label: '읽지 않은 과거 알림', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'normal', userVisible: true, sourcePaths: [notificationHistory], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-HISTORY-MORE', label: '과거 알림 더 불러오기', area: '알림', lifecycle: 'production', coverage: 'missing', kind: 'transition', priority: 'normal', userVisible: true, sourcePaths: [notifications, notificationHistory], scenarioIds: [] }),
  knownState({ id: 'NOTI-INVITE-ACCEPTED', label: '친구 초대 수락 알림', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'high', userVisible: true, sourcePaths: [notifications, notificationSurface], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-DAPP-1', label: 'dApp 1/3 알림', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'normal', userVisible: true, sourcePaths: [notifications, notificationSurface], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-DAPP-2', label: 'dApp 2/3 알림', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'normal', userVisible: true, sourcePaths: [notifications, notificationSurface], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-DAPP-3', label: 'dApp 3/3 알림', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'high', userVisible: true, sourcePaths: [notifications, notificationSurface], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-VOT3', label: 'VOT3 전환 완료 알림', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'high', userVisible: true, sourcePaths: [notifications, notificationSurface], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-COLLAPSED-PROGRESS', label: '여러 단계 동시 진행 알림', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'high', userVisible: true, sourcePaths: [notifications, notificationSurface], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-REWARD-READY', label: '보상 예약 완료 강조 알림', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'critical', userVisible: true, sourcePaths: [notifications, notificationSurface], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-REWARD-PAID', label: '보상 지급 완료 강조 알림', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'critical', userVisible: true, sourcePaths: [notifications, notificationSurface], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-INELIGIBLE', label: '친구 참여 조건 미충족 알림', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'critical', userVisible: true, sourcePaths: [notifications, notificationSurface], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-ACK-BUSY', label: '알림 확인 처리 중', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [notifications, notificationSurface], scenarioIds: ['notification-preview'] }),
  knownState({ id: 'NOTI-ACK-ERROR', label: '알림 확인 실패', area: '알림', lifecycle: 'production', coverage: 'partial', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [notifications, notificationSurface], scenarioIds: ['notification-preview'] }),

  // Wallet session / authentication gate.
  knownState({ id: 'SESSION-IDLE-BRAND', label: '지갑 세션 초기 준비', area: '지갑·세션', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [walletSession], scenarioIds: [] }),
  knownState({ id: 'SESSION-CHECKING-DELAY', label: '지갑 소유권 확인 초기 로고', area: '지갑·세션', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [walletSession], scenarioIds: [] }),
  knownState({ id: 'SESSION-CHECKING', label: '지갑 소유권 확인 중', area: '지갑·세션', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [walletSession], scenarioIds: [] }),
  knownState({ id: 'SESSION-ERROR', label: '지갑 세션 확인 실패', area: '지갑·세션', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [walletSession], scenarioIds: [] }),
  knownState({ id: 'SESSION-WALLET-MISMATCH', label: '연결 지갑과 세션 지갑 불일치', area: '지갑·세션', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [walletSession], scenarioIds: [] }),
  knownState({ id: 'SESSION-DISCONNECTING', label: '세션/지갑 연결 해제 중', area: '지갑·세션', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [walletSession], scenarioIds: [] }),
  knownState({ id: 'SESSION-PASSIVE-DISCONNECT-RECOVERY', label: 'VeWorld 외부 연결 해제 후 복구', area: '지갑·세션', lifecycle: 'production', coverage: 'missing', kind: 'transition', priority: 'critical', userVisible: false, sourcePaths: [walletSession], scenarioIds: [] }),

  // Legal consent gate.
  knownState({ id: 'LEGAL-CHECKING', label: '약관 동의 여부 확인 중', area: '약관', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [legalConsent], scenarioIds: [] }),
  knownState({ id: 'LEGAL-REQUIRED', label: '약관/개인정보 동의 필요', area: '약관', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [legalConsent], scenarioIds: [] }),
  knownState({ id: 'LEGAL-ACCEPTING', label: '약관 동의 저장 중', area: '약관', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [legalConsent], scenarioIds: [] }),
  knownState({ id: 'LEGAL-ERROR', label: '약관 동의 확인/저장 오류', area: '약관', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [legalConsent], scenarioIds: [] }),

  // Settings.
  knownState({ id: 'SETTINGS-WALLET-DISCONNECTED', label: '설정 · 지갑 미연결', area: '설정', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [settings], scenarioIds: ['existing-preview-hub'] }),
  knownState({ id: 'SETTINGS-WALLET-CONNECTED', label: '설정 · 지갑 연결됨', area: '설정', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [settings], scenarioIds: ['existing-preview-hub'] }),
  knownState({ id: 'SETTINGS-SWITCH-CONFIRM', label: '다른 지갑 연결 확인 팝업', area: '설정', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'high', userVisible: true, sourcePaths: [settings], scenarioIds: ['existing-preview-hub'] }),
  knownState({ id: 'SETTINGS-DISCONNECT-CONFIRM', label: '지갑 연결 해제 확인 팝업', area: '설정', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'high', userVisible: true, sourcePaths: [settings], scenarioIds: ['existing-preview-hub'] }),
  knownState({ id: 'SETTINGS-WALLET-PENDING', label: '지갑 설정 동작 처리 중', area: '설정', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'normal', userVisible: true, sourcePaths: [settings], scenarioIds: [] }),
  knownState({ id: 'SETTINGS-ACTION-ERROR', label: '지갑 설정 동작 오류 안내', area: '설정', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [settings, 'src/components/TransientSnackbar.tsx'], scenarioIds: [] }),
  knownState({ id: 'SETTINGS-LANGUAGE-OPEN', label: '언어 선택 모달', area: '설정', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'high', userVisible: true, sourcePaths: [settings], scenarioIds: ['existing-preview-hub'] }),
  knownState({ id: 'SETTINGS-LANGUAGE-SEARCH', label: '언어 검색 결과 상태', area: '설정', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'normal', userVisible: true, sourcePaths: [settings], scenarioIds: ['existing-preview-hub'] }),

  // Leaderboard.
  knownState({ id: 'LEADERBOARD-LOADING', label: '리더보드 로딩', area: '리더보드', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [leaderboard], scenarioIds: [] }),
  knownState({ id: 'LEADERBOARD-ERROR', label: '리더보드 조회 오류', area: '리더보드', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [leaderboard], scenarioIds: [] }),
  knownState({ id: 'LEADERBOARD-LIST', label: '리더보드 정상 목록', area: '리더보드', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'critical', userVisible: true, sourcePaths: [leaderboard], scenarioIds: ['existing-preview-hub'] }),
  knownState({ id: 'LEADERBOARD-PLACEHOLDERS', label: '순위 빈 자리 표시', area: '리더보드', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'normal', userVisible: true, sourcePaths: [leaderboard], scenarioIds: ['existing-preview-hub'] }),
  knownState({ id: 'LEADERBOARD-CURRENT-IN-LIST', label: '내 지갑이 Top 100 안에 있음', area: '리더보드', lifecycle: 'production', coverage: 'partial', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [leaderboard], scenarioIds: ['existing-preview-hub'] }),
  knownState({ id: 'LEADERBOARD-CURRENT-TRAILING', label: '내 지갑이 순위권 밖', area: '리더보드', lifecycle: 'production', coverage: 'missing', kind: 'screen', priority: 'high', userVisible: true, sourcePaths: [leaderboard], scenarioIds: [] }),
  knownState({ id: 'LEADERBOARD-MOVE-UP', label: '순위 상승 표시', area: '리더보드', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [leaderboard], scenarioIds: [] }),
  knownState({ id: 'LEADERBOARD-MOVE-DOWN', label: '순위 하락 표시', area: '리더보드', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'high', userVisible: true, sourcePaths: [leaderboard], scenarioIds: [] }),
  knownState({ id: 'LEADERBOARD-MOVE-NEW', label: '신규 순위 진입 표시', area: '리더보드', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'normal', userVisible: true, sourcePaths: [leaderboard], scenarioIds: [] }),
  knownState({ id: 'LEADERBOARD-MOVE-SAME', label: '순위 변동 없음 표시', area: '리더보드', lifecycle: 'production', coverage: 'missing', kind: 'feedback', priority: 'normal', userVisible: true, sourcePaths: [leaderboard], scenarioIds: [] }),
  knownState({ id: 'LEADERBOARD-WALLET-DETAIL', label: '지갑 상세 팝업', area: '리더보드', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'high', userVisible: true, sourcePaths: [leaderboard], scenarioIds: ['existing-preview-hub'] }),
  knownState({ id: 'LEADERBOARD-IMPACT-DETAIL', label: '신규/복귀 영향 상세 팝업', area: '리더보드', lifecycle: 'production', coverage: 'partial', kind: 'overlay', priority: 'high', userVisible: true, sourcePaths: [leaderboard], scenarioIds: ['existing-preview-hub'] }),

  // Future feature kept separate from current Production denominator.
  knownState({ id: 'NETWORK-CANVAS', label: '2-slot 추천 네트워크 캔버스', area: '추천 네트워크', lifecycle: 'future', coverage: 'direct', kind: 'screen', priority: 'normal', userVisible: true, sourcePaths: ['src/components/InfiniteReferralCanvasPreview.tsx'], scenarioIds: ['network-preview'] }),

  // External UI: visible to the user, but pixels are owned by VeWorld / browser / OS.
  knownState({ id: 'EXT-VEWORLD-CONNECT', label: 'VeWorld 지갑 연결창', area: '외부 UI', lifecycle: 'external', coverage: 'external', kind: 'overlay', priority: 'critical', userVisible: true, sourcePaths: ['src/components/WalletControl.tsx', permanentInvite, legacyInvite], scenarioIds: [], note: 'VeInvite가 결과를 받기 전의 외부 UI. 성공/취소/실패 이후 VeInvite 상태는 별도 검증한다.' }),
  knownState({ id: 'EXT-NATIVE-SHARE', label: '브라우저/OS 공유창', area: '외부 UI', lifecycle: 'external', coverage: 'external', kind: 'overlay', priority: 'normal', userVisible: true, sourcePaths: [home], scenarioIds: [], note: 'navigator.share가 제공하는 외부 UI.' }),
];

export function validateQaKnownStateRegistry(knownScenarioIds: Set<string>): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const state of QA_KNOWN_STATES) {
    if (seen.has(state.id)) errors.push(`duplicate QA state id: ${state.id}`);
    seen.add(state.id);
    if (!state.id.trim()) errors.push('missing QA state id');
    if (!state.label.trim()) errors.push(`missing QA state label: ${state.id}`);
    if (!state.sourcePaths.length) errors.push(`missing QA state source path: ${state.id}`);

    if (state.coverage === 'external' && state.lifecycle !== 'external') {
      errors.push(`external QA coverage must use external lifecycle: ${state.id}`);
    }
    if (state.lifecycle === 'external' && state.coverage !== 'external') {
      errors.push(`external QA lifecycle must use external coverage: ${state.id}`);
    }
    if ((state.coverage === 'direct' || state.coverage === 'partial') && !state.scenarioIds.length) {
      errors.push(`covered QA state must reference a scenario: ${state.id}`);
    }
    for (const scenarioId of state.scenarioIds) {
      if (!knownScenarioIds.has(scenarioId)) {
        errors.push(`unknown scenario ${scenarioId} in QA state ${state.id}`);
      }
    }
  }

  return errors;
}

export function getQaStateCoverageSummary() {
  const currentUi = QA_KNOWN_STATES.filter(
    (state) => state.lifecycle === 'production' && state.userVisible,
  );
  const legacyUi = QA_KNOWN_STATES.filter(
    (state) => state.lifecycle === 'legacy' && state.userVisible,
  );
  const externalUi = QA_KNOWN_STATES.filter(
    (state) => state.lifecycle === 'external' && state.userVisible,
  );

  const countCoverage = (states: QaKnownState[], coverage: QaStateCoverage) =>
    states.filter((state) => state.coverage === coverage).length;

  return {
    production: {
      total: currentUi.length,
      direct: countCoverage(currentUi, 'direct'),
      partial: countCoverage(currentUi, 'partial'),
      missing: countCoverage(currentUi, 'missing'),
    },
    legacy: {
      total: legacyUi.length,
      direct: countCoverage(legacyUi, 'direct'),
      partial: countCoverage(legacyUi, 'partial'),
      missing: countCoverage(legacyUi, 'missing'),
    },
    external: externalUi.length,
    future: QA_KNOWN_STATES.filter((state) => state.lifecycle === 'future').length,
    totalInventory: QA_KNOWN_STATES.length,
  };
}
