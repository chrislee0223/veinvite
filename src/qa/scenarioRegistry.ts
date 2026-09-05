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
    title: '초대 안내 · 기본 모바일',
    description: '신규 초대 사용자가 처음 보는 실제 InviteLandingV2 화면.',
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
    title: '초대 안내 · 영문 PC',
    description: '동일한 실제 화면을 데스크톱 폭과 영어로 확인한다.',
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
    title: '초대 안내 · 액션 잠김',
    description: '검증/전환 중 중복 액션을 막아야 하는 상태를 확인한다.',
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
    title: '초대 안내 · 검토 결과 시뮬레이션',
    description: '실제 demo hook을 사용해 수동 검토 분기를 확인한다.',
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
    title: '미션 · 보상 상태 모음',
    description: '기존 미션 진행·완료·보상 상태 프리뷰를 독립 화면으로 확인한다.',
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
    title: '알림 · 읽음/미확인 상태',
    description: '미션·보상 알림 프리뷰를 독립 화면으로 확인한다.',
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
    title: '자격 확인 · 참여 불가',
    description: '기존 활성 사용자 등 참여 불가 프리뷰를 독립 화면으로 확인한다.',
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
    title: '추천 네트워크 · 캔버스',
    description: '향후 2-slot/네트워크 화면을 Production 데이터 없이 확인한다.',
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
    title: '기존 앱 상태 모음',
    description: '홈·가이드·리더보드·설정·참여자 상태를 기존 UiTestHub에서 계속 확인한다.',
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
  const viewportIds = new Set(QA_VIEWPORTS.map((item) => item.id));

  for (const scenario of QA_SCENARIOS) {
    if (seen.has(scenario.id)) errors.push(`duplicate scenario id: ${scenario.id}`);
    seen.add(scenario.id);
    if (!scenario.expected.length) errors.push(`missing expected results: ${scenario.id}`);
    if (!scenario.title.trim()) errors.push(`missing title: ${scenario.id}`);
    if (!scenario.group.trim()) errors.push(`missing group: ${scenario.id}`);
    if (!viewportIds.has(scenario.viewport)) errors.push(`unknown viewport: ${scenario.id}`);
  }

  return errors;
}
