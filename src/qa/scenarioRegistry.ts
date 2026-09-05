import type { QaScenario, QaViewport } from './types';

export const QA_VIEWPORTS: QaViewport[] = [
  { id: 'compact', label: '320px', width: 320, note: 'small-phone stress' },
  { id: 'iphone', label: 'iPhone', width: 390, note: 'primary mobile' },
  { id: 'tablet', label: 'Tablet', width: 768, note: 'tablet layout' },
  { id: 'desktop', label: 'Desktop', width: 1180, note: 'desktop layout' },
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
    group: '초대 진입',
    screen: 'invite-landing',
    risk: 'critical',
    tags: ['invite', 'mobile', 'golden'],
    locale: 'ko',
    viewport: 'iphone',
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
    group: '초대 진입',
    screen: 'invite-landing',
    risk: 'high',
    tags: ['invite', 'desktop', 'i18n'],
    locale: 'en',
    viewport: 'desktop',
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
    group: '초대 진입',
    screen: 'invite-landing',
    risk: 'high',
    tags: ['invite', 'disabled', 'race'],
    locale: 'ko',
    viewport: 'iphone',
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
    description: '기존 실제 demo hook을 사용해 수동 검토 분기를 확인한다.',
    group: '초대 진입',
    screen: 'invite-landing',
    risk: 'normal',
    tags: ['invite', 'review', 'simulation'],
    locale: 'ko',
    viewport: 'iphone',
    demoMode: true,
    demoOutcome: 'review',
    expected: [
      '실제 InviteLandingV2의 demo selector가 표시된다.',
      '결과 선택 변경이 Action Inspector에 기록된다.',
    ],
    actions: landingActions,
  },
  {
    id: 'existing-preview-hub',
    title: '기존 앱 상태 모음',
    description: '기존 UiTestHub를 QA Studio 안에서 보존해 현재 홈·가이드·리더보드·설정·참여자 상태를 계속 확인한다.',
    group: '전체 앱',
    screen: 'legacy-ui-hub',
    risk: 'critical',
    tags: ['existing', 'coverage', 'migration'],
    locale: 'ko',
    viewport: 'desktop',
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

  for (const scenario of QA_SCENARIOS) {
    if (seen.has(scenario.id)) errors.push(`duplicate scenario id: ${scenario.id}`);
    seen.add(scenario.id);
    if (!scenario.expected.length) errors.push(`missing expected results: ${scenario.id}`);
    if (!scenario.title.trim()) errors.push(`missing title: ${scenario.id}`);
    if (!scenario.group.trim()) errors.push(`missing group: ${scenario.id}`);
  }

  return errors;
}
