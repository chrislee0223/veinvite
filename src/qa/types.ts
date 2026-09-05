import type { Locale } from '@/lib/i18n/locales';

export type QaViewportId = 'compact' | 'iphone' | 'tablet' | 'desktop';
export type QaScenarioRisk = 'critical' | 'high' | 'normal';
export type QaScreenId = 'invite-landing' | 'legacy-ui-hub';

export type QaScenarioActionId =
  | 'beginner-start'
  | 'existing-wallet'
  | 'change-locale'
  | 'reset';

export type QaScenarioAction = {
  id: QaScenarioActionId;
  label: string;
  expected: string;
};

export type QaScenario = {
  id: string;
  title: string;
  description: string;
  group: string;
  screen: QaScreenId;
  risk: QaScenarioRisk;
  tags: string[];
  locale: Locale;
  viewport: QaViewportId;
  disabled?: boolean;
  demoMode?: boolean;
  demoOutcome?: 'success' | 'existing' | 'other' | 'review';
  expected: string[];
  actions: QaScenarioAction[];
};

export type QaActionLogEntry = {
  id: number;
  at: string;
  action: string;
  result: string;
};

export type QaViewport = {
  id: QaViewportId;
  label: string;
  width: number;
  note: string;
};
