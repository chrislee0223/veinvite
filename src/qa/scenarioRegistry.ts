import type { QaScenario, QaViewport } from './types';

export const QA_VIEWPORTS: QaViewport[] = [
  { id: 'compact', label: '작은 폰', width: 320, height: 568, note: '320 × 568' },
  { id: 'iphone', label: 'iPhone', width: 390, height: 844, note: '390 × 844' },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024, note: '768 × 1024' },
  { id: 'desktop', label: 'Desktop', width: 1180, height: 820, note: '1180 × 820' },
];

const landingActions = [
  {
    id: 'beginner-start' as const,
    label: '시작하기',
    expected: '초보 사용자 시작 액션이 1회 발생한다.',
  },
  {
    id: 'existing-wallet' as const,
    label: '기존 지갑',
    expected: '기존 VeWorld 지갑 액션이 1회 발생한다.',
  },
  {
    id: 'change-locale' as const,
    label: '언어 변경',
    expected: '실제 InviteLandingV2의 언어 선택 UI가 즉시 갱신된다.',
  },
];

export const QA_SCENARIOS: QaScenario[] = [
  {
    id: 'invite-landing-ko-mobile',
    caseId: 'INV-01',
    title: '초대 안내 · 기본 모바일',
    description: '신규 초대 사용자가 처음 보는 실제 InviteLandingV2 화면.',
    context: {
      actor: '신규 초대 사용자',
      trigger: '초대 링크로 처음 들어옴',
      state: '지갑 연결 전 · 정상 진입',
      outcome: '시작하기 또는 기존 지갑 경로로 이동',
    },
    group: '초대',
    screen: 'invite-landing',
    risk: 'critical',
    core: true,
    tags: ['invite', 'mobile', 'golden'],
    locale: 'ko',
    viewport: 'iphone',
    localeControl: true,
    demoOutcome: 'success',
    expected: [
      '실제 VeInvite 브랜드·3단계 안내·시작 버튼이 표시된다.',
      '시작하기와 기존 지갑 액션이 모두 클릭 가능하다.',
      '가로 스크롤 없이 모바일 폭 안에 들어온다.',
    ],
    actions: landingActions,
  },
  {
    id: 'invite-landing-en-desktop',
    caseId: 'INV-02',
    title: '초대 안내 · 영문 PC',
    description: '동일한 실제 화면을 데스크톱 폭과 영어로 확인한다.',
    context: {
      actor: '영어 사용 초대 사용자',
      trigger: 'PC에서 초대 링크로 진입',
      state: '지갑 연결 전 · 영문/데스크톱',
      outcome: '영문 상태로 다음 온보딩 분기로 이동',
    },
    group: '초대',
    screen: 'invite-landing',
    risk: 'high',
    core: true,
    tags: ['invite', 'desktop', 'i18n'],
    locale: 'en',
    viewport: 'desktop',
    localeControl: true,
    demoOutcome: 'success',
    expected: [
      '영문 카피가 실제 컴포넌트에서 렌더링된다.',
      '모바일 전용처럼 과도하게 늘어나지 않고 중앙 레이아웃을 유지한다.',
    ],
    actions: landingActions,
  },
  {
    id: 'invite-landing-disabled',
    caseId: 'INV-03',
    title: '초대 안내 · 액션 잠김',
    description: '검증/전환 중 중복 액션을 막아야 하는 상태를 확인한다.',
    context: {
      actor: '초대 링크로 들어온 사용자',
      trigger: '이미 검증 또는 화면 전환이 진행 중',
      state: '버튼 잠김 · 중복 클릭 방지',
      outcome: '현재 처리 완료 전 추가 동작을 막음',
    },
    group: '초대',
    screen: 'invite-landing',
    risk: 'high',
    core: true,
    tags: ['invite', 'disabled', 'race'],
    locale: 'ko',
    viewport: 'iphone',
    localeControl: true,
    disabled: true,
    demoOutcome: 'success',
    expected: [
      '시작하기와 기존 지갑 버튼이 모두 disabled 상태다.',
      '잠긴 상태에서도 레이아웃이 흔들리지 않는다.',
    ],
    actions: landingActions,
  },
  {
    id: 'invite-demo-review',
    caseId: 'INV-04',
    title: '초대 안내 · 검토 결과 시뮬레이션',
    description: '실제 demo hook을 사용해 수동 검토 분기를 확인한다.',
    context: {
      actor: '자동 판정만으로 확정하기 어려운 사용자',
      trigger: '자격 판정이 수동 검토 분기로 들어감',
      state: '검토 필요 결과 시뮬레이션',
      outcome: '검토 결과별 화면 변화를 비교',
    },
    group: '초대',
    screen: 'invite-landing',
    risk: 'normal',
    core: false,
    tags: ['invite', 'review', 'simulation'],
    locale: 'ko',
    viewport: 'iphone',
    localeControl: true,
    demoMode: true,
    demoOutcome: 'review',
    expected: [
      '실제 InviteLandingV2의 demo selector가 표시된다.',
      '결과 선택 변경이 액션 기록에 남는다.',
    ],
    actions: [
      ...landingActions,
      {
        id: 'demo-outcome' as const,
        label: '검토 결과 변경',
        expected: '선택한 demo outcome이 즉시 반영되고 액션 기록에 남는다.',
      },
    ],
  },
  {
    id: 'mission-reward-preview',
    caseId: 'MR-01',
    title: '미션 · 보상 상태 모음',
    description: '기존 미션 진행·완료·보상 상태 프리뷰를 독립 화면으로 확인한다.',
    context: {
      actor: '초대 참여를 시작한 사용자',
      trigger: '미션을 진행하거나 완료한 뒤 앱으로 돌아옴',
      state: '미션 진행·완료·보상 상태 모음',
      outcome: '현재 진행률과 다음 행동 또는 보상 상태 확인',
    },
    group: '미션·보상',
    screen: 'mission-preview',
    risk: 'critical',
    core: true,
    tags: ['mission', 'reward', 'progress', 'completed'],
    locale: 'ko',
    viewport: 'iphone',
    localeControl: false,
    expected: [
      '미션 진행·완료·보상 관련 상태가 Production 데이터 없이 표시된다.',
      '상태별 카드와 버튼이 모바일 폭에서 깨지지 않는다.',
    ],
    actions: [],
  },
  {
    id: 'notification-preview',
    caseId: 'NOTI-01',
    title: '알림 · 읽음/미확인 상태',
    description: '미션·보상 알림 프리뷰를 독립 화면으로 확인한다.',
    context: {
      actor: '알림 이력이 있는 사용자',
      trigger: '미션 또는 보상 관련 알림을 열어봄',
      state: '새 알림·읽은 알림·빈 상태 비교',
      outcome: '새 소식과 과거 이력을 명확히 구분',
    },
    group: '알림',
    screen: 'notification-preview',
    risk: 'high',
    core: true,
    tags: ['notification', 'unread', 'read', 'history'],
    locale: 'ko',
    viewport: 'iphone',
    localeControl: false,
    expected: [
      '읽지 않은 알림과 확인한 알림의 시각적 차이가 분명하다.',
      '알림 목록과 빈 상태가 좁은 화면에서 깨지지 않는다.',
    ],
    actions: [],
  },
  {
    id: 'eligibility-preview',
    caseId: 'ELG-01',
    title: '자격 확인 · 참여 불가',
    description: '기존 활성 사용자 등 참여 불가 프리뷰를 독립 화면으로 확인한다.',
    context: {
      actor: '참여 자격이 맞지 않는 사용자',
      trigger: '지갑 연결 후 자격 확인에서 제외됨',
      state: '참여 불가 · 거절 사유 안내',
      outcome: '이유를 이해하고 잘못된 미션 진입을 막음',
    },
    group: '자격 확인',
    screen: 'eligibility-preview',
    risk: 'critical',
    core: true,
    tags: ['eligibility', 'rejection', 'existing-user'],
    locale: 'ko',
    viewport: 'iphone',
    localeControl: false,
    expected: [
      '참여 불가 이유와 다음 행동 안내가 명확하게 보인다.',
      '거절 상태에서도 레이아웃과 내비게이션이 깨지지 않는다.',
    ],
    actions: [],
  },
  {
    id: 'network-preview',
    caseId: 'NET-01',
    title: '추천 네트워크 · 캔버스',
    description: '향후 2-slot/네트워크 화면을 Production 데이터 없이 확인한다.',
    context: {
      actor: '추천 관계가 쌓인 참여자',
      trigger: '자신의 추천 네트워크 구조를 열어봄',
      state: '2-slot/연결 관계 캔버스 프리뷰',
      outcome: '누가 누구를 통해 연결됐는지 구조를 파악',
    },
    group: '추천 네트워크',
    screen: 'network-preview',
    risk: 'normal',
    core: false,
    tags: ['network', 'canvas', 'referral'],
    locale: 'ko',
    viewport: 'desktop',
    localeControl: false,
    expected: [
      '캔버스 프리뷰가 넓은 화면에서 잘리지 않는다.',
      '노드와 연결 관계가 Production 쓰기 없이 표시된다.',
    ],
    actions: [],
  },
  {
    id: 'existing-preview-hub',
    caseId: 'APP-01',
    title: '기존 앱 상태 모음',
    description: '홈·가이드·리더보드·설정·참여자 상태를 기존 UiTestHub에서 계속 확인한다.',
    context: {
      actor: '일반 앱 화면을 폭넓게 확인하는 운영자',
      trigger: '특정 단일 시나리오보다 전체 UI를 둘러봄',
      state: '홈·가이드·리더보드·설정·참여자 화면 모음',
      outcome: '아직 독립 시나리오로 분리되지 않은 화면까지 확인',
    },
    group: '전체 앱',
    screen: 'legacy-ui-hub',
    risk: 'critical',
    core: true,
    tags: ['existing', 'leaderboard', 'settings', 'coverage', 'migration'],
    locale: 'ko',
    viewport: 'desktop',
    localeControl: false,
    expected: [
      '기존 UI preview 기능이 새 QA Studio 도입으로 사라지지 않는다.',
      'Production 데이터와 연결되지 않은 기존 preview 흐름을 그대로 사용할 수 있다.',
    ],
    actions: [],
  },
];

export function getQaScenario(id: string): QaScenario {
  return QA_SCENARIOS.find((scenario) => scenario.id === id) ?? QA_SCENARIOS[0];
}

export function validateQaScenarioRegistry(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const seenCaseIds = new Set<string>();
  const viewportIds = new Set(QA_VIEWPORTS.map((item) => item.id));

  for (const scenario of QA_SCENARIOS) {
    if (seen.has(scenario.id)) errors.push(`duplicate scenario id: ${scenario.id}`);
    seen.add(scenario.id);
    if (seenCaseIds.has(scenario.caseId)) errors.push(`duplicate case id: ${scenario.caseId}`);
    seenCaseIds.add(scenario.caseId);
    if (!scenario.caseId.trim()) errors.push(`missing case id: ${scenario.id}`);
    if (!scenario.context.actor.trim()) errors.push(`missing case actor: ${scenario.id}`);
    if (!scenario.context.trigger.trim()) errors.push(`missing case trigger: ${scenario.id}`);
    if (!scenario.context.state.trim()) errors.push(`missing case state: ${scenario.id}`);
    if (!scenario.context.outcome.trim()) errors.push(`missing case outcome: ${scenario.id}`);
    if (!scenario.expected.length) errors.push(`missing expected results: ${scenario.id}`);
    if (!scenario.title.trim()) errors.push(`missing title: ${scenario.id}`);
    if (!scenario.group.trim()) errors.push(`missing group: ${scenario.id}`);
    if (!viewportIds.has(scenario.viewport)) errors.push(`unknown viewport: ${scenario.id}`);
  }

  return errors;
}