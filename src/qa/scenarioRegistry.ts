import type { SupportedLocale } from '../lib/i18n/locales';

export const QA_SCENARIO_CONTRACT_VERSION = 1 as const;

export type QaRisk = 'critical' | 'high' | 'normal';
export type QaScenarioCategory = 'entry' | 'guide' | 'network';
export type QaRenderer = 'invite-landing' | 'invite-guide' | 'network-coming-soon';
export type QaViewportId = 'small-phone' | 'iphone' | 'android' | 'tablet' | 'desktop';

export type QaScenario = {
  id: string;
  title: string;
  description: string;
  category: QaScenarioCategory;
  renderer: QaRenderer;
  contractVersion: typeof QA_SCENARIO_CONTRACT_VERSION;
  risk: QaRisk;
  defaultLocale: SupportedLocale;
  defaultViewport: QaViewportId;
  tags: readonly string[];
  expected: readonly string[];
  fixture: {
    disabled?: boolean;
  };
};

export type QaViewport = {
  id: QaViewportId;
  label: string;
  width: number;
  height: number;
  note: string;
};

export const QA_VIEWPORTS: readonly QaViewport[] = [
  {
    id: 'small-phone',
    label: 'Small phone',
    width: 320,
    height: 700,
    note: '좁은 화면·긴 번역 스트레스 확인',
  },
  {
    id: 'iphone',
    label: 'iPhone',
    width: 393,
    height: 852,
    note: '주요 모바일 기준',
  },
  {
    id: 'android',
    label: 'Android',
    width: 412,
    height: 915,
    note: '일반 Android 세로 화면',
  },
  {
    id: 'tablet',
    label: 'Tablet',
    width: 768,
    height: 1024,
    note: '태블릿/중간 폭 레이아웃',
  },
  {
    id: 'desktop',
    label: 'Desktop',
    width: 1280,
    height: 900,
    note: 'PC 웹브라우저 기준',
  },
];

export const QA_SCENARIOS: readonly QaScenario[] = [
  {
    id: 'invite.landing.ready',
    title: '초대 안내 · 시작 가능',
    description: '영구 추천 링크 검증 후 사용자가 처음 마주치는 실제 초대 안내 컴포넌트.',
    category: 'entry',
    renderer: 'invite-landing',
    contractVersion: QA_SCENARIO_CONTRACT_VERSION,
    risk: 'critical',
    defaultLocale: 'ko',
    defaultViewport: 'iphone',
    tags: ['invite', 'landing', 'cta', 'new-user', 'returning-user'],
    expected: [
      '실제 InviteLandingV2가 렌더링된다.',
      '시작하기와 기존 VeWorld 지갑 액션이 모두 활성화된다.',
      '언어 변경 시 같은 실제 컴포넌트의 번역이 즉시 바뀐다.',
    ],
    fixture: { disabled: false },
  },
  {
    id: 'invite.landing.pending',
    title: '초대 안내 · 액션 잠김',
    description: '검증/전환 중 중복 액션을 막는 실제 disabled 상태.',
    category: 'entry',
    renderer: 'invite-landing',
    contractVersion: QA_SCENARIO_CONTRACT_VERSION,
    risk: 'high',
    defaultLocale: 'ko',
    defaultViewport: 'iphone',
    tags: ['invite', 'landing', 'pending', 'disabled', 'double-click'],
    expected: [
      '실제 InviteLandingV2가 렌더링된다.',
      '시작하기와 기존 지갑 액션이 모두 비활성화된다.',
      '비활성 상태에서도 레이아웃과 번역이 깨지지 않는다.',
    ],
    fixture: { disabled: true },
  },
  {
    id: 'guide.invite.overview',
    title: '초대 가이드',
    description: '홈에서 문맥적으로 노출되는 실제 InviteGuideContent.',
    category: 'guide',
    renderer: 'invite-guide',
    contractVersion: QA_SCENARIO_CONTRACT_VERSION,
    risk: 'normal',
    defaultLocale: 'ko',
    defaultViewport: 'iphone',
    tags: ['guide', 'eligibility', 'mission', 'reward', 'localization'],
    expected: [
      '실제 InviteGuideContent가 렌더링된다.',
      '초대·미션·보상 단계와 신규/복귀 설명이 모두 표시된다.',
    ],
    fixture: {},
  },
  {
    id: 'network.coming-soon',
    title: '네트워크 · 준비 중',
    description: '현재 Network 탭이 사용하는 실제 AppGuide/AppNetworkComingSoon 상태.',
    category: 'network',
    renderer: 'network-coming-soon',
    contractVersion: QA_SCENARIO_CONTRACT_VERSION,
    risk: 'normal',
    defaultLocale: 'ko',
    defaultViewport: 'iphone',
    tags: ['network', 'placeholder', 'future'],
    expected: [
      '현재 Production과 동일한 Network 준비 중 컴포넌트가 렌더링된다.',
      '언어 변경 시 현재 번역 자산을 그대로 사용한다.',
    ],
    fixture: {},
  },
];

export type QaSurfaceCoverage = {
  id: string;
  label: string;
  status: 'covered' | 'planned';
  scenarioIds: readonly string[];
};

// This catalog is intentionally explicit. A new user-facing domain should be
// added here at the same time as the feature so missing QA coverage stays
// visible instead of silently disappearing from the test plan.
export const QA_SURFACE_COVERAGE: readonly QaSurfaceCoverage[] = [
  { id: 'invite-entry', label: '초대 진입', status: 'covered', scenarioIds: ['invite.landing.ready', 'invite.landing.pending'] },
  { id: 'invite-guide', label: '초대 가이드', status: 'covered', scenarioIds: ['guide.invite.overview'] },
  { id: 'network', label: '네트워크', status: 'covered', scenarioIds: ['network.coming-soon'] },
  { id: 'wallet', label: '지갑 연결·서명', status: 'planned', scenarioIds: [] },
  { id: 'eligibility', label: '자격 판정', status: 'planned', scenarioIds: [] },
  { id: 'mission', label: '미션 진행', status: 'planned', scenarioIds: [] },
  { id: 'rewards', label: '보상', status: 'planned', scenarioIds: [] },
  { id: 'notifications', label: '알림', status: 'planned', scenarioIds: [] },
  { id: 'leaderboard', label: '리더보드', status: 'planned', scenarioIds: [] },
  { id: 'settings', label: '설정', status: 'planned', scenarioIds: [] },
  { id: 'referral-network', label: '추천 네트워크', status: 'planned', scenarioIds: [] },
];

export function getQaScenario(id: string | null | undefined): QaScenario {
  return QA_SCENARIOS.find((scenario) => scenario.id === id) ?? QA_SCENARIOS[0];
}

export function getQaViewport(id: string | null | undefined): QaViewport {
  return QA_VIEWPORTS.find((viewport) => viewport.id === id) ?? QA_VIEWPORTS[1];
}
