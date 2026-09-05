'use client';

import { useEffect, useMemo, useState } from 'react';

import { InfiniteReferralCanvasPreview } from '@/components/InfiniteReferralCanvasPreview';
import { InviteLandingV2 } from '@/components/InviteLandingV2';
import { InviteRejectionPreview } from '@/components/InviteRejectionPreview';
import { NotificationUiPreview } from '@/components/NotificationUiPreview';
import { UiTestHub } from '@/components/UiTestHub';
import { UiTestLab } from '@/components/UiTestLab';
import { isLocale, type Locale } from '@/lib/i18n/locales';

import { getQaScenario } from './scenarioRegistry';

type QaScenarioRendererProps = {
  scenarioId: string;
  localeOverride?: string | null;
};

function emit(action: string, result: string) {
  window.parent.postMessage(
    {
      source: 'veinvite-qa-studio',
      type: 'qa-action',
      action,
      result,
      at: new Date().toISOString(),
    },
    window.location.origin,
  );
}

export function QaScenarioRenderer({
  scenarioId,
  localeOverride,
}: QaScenarioRendererProps) {
  const scenario = useMemo(() => getQaScenario(scenarioId), [scenarioId]);
  const normalizedLocale = localeOverride ?? null;
  const initialLocale: Locale = isLocale(normalizedLocale)
    ? normalizedLocale
    : scenario.locale;
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [demoOutcome, setDemoOutcome] = useState(
    scenario.demoOutcome ?? 'success',
  );

  useEffect(() => {
    setLocale(initialLocale);
    setDemoOutcome(scenario.demoOutcome ?? 'success');
    document.documentElement.lang = initialLocale;
  }, [initialLocale, scenario.demoOutcome, scenario.id]);

  if (scenario.screen === 'legacy-ui-hub') return <UiTestHub />;
  if (scenario.screen === 'mission-preview') return <UiTestLab />;
  if (scenario.screen === 'notification-preview') return <NotificationUiPreview />;
  if (scenario.screen === 'eligibility-preview') return <InviteRejectionPreview />;
  if (scenario.screen === 'network-preview') return <InfiniteReferralCanvasPreview />;

  return (
    <InviteLandingV2
      locale={locale}
      disabled={scenario.disabled}
      demoMode={scenario.demoMode}
      demoOutcome={demoOutcome}
      onLocaleChange={(nextLocale) => {
        setLocale(nextLocale);
        document.documentElement.lang = nextLocale;
        emit('change-locale', `locale → ${nextLocale}`);
      }}
      onBeginnerStart={() => {
        emit('beginner-start', '시작하기 액션 발생 · 실제 네트워크 요청은 차단됨');
      }}
      onExistingWallet={() => {
        emit('existing-wallet', '기존 지갑 액션 발생 · 실제 지갑 연결은 실행하지 않음');
      }}
      onDemoOutcomeChange={(outcome) => {
        setDemoOutcome(outcome);
        emit('demo-outcome', `demo outcome → ${outcome}`);
      }}
    />
  );
}
