'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { AppGuide, InviteGuideContent } from '@/components/AppGuide';
import { InviteLandingV2 } from '@/components/InviteLandingV2';
import {
  getLocaleDirection,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { getQaScenario } from '@/qa/scenarioRegistry';

type QAScenarioRendererProps = {
  scenarioId: string;
  initialLocale: SupportedLocale;
};

type QaMessage = {
  source: 'veinvite-qa';
  type: 'action';
  scenarioId: string;
  action: string;
  detail?: string;
  timestamp: string;
};

export function QAScenarioRenderer({
  scenarioId,
  initialLocale,
}: QAScenarioRendererProps) {
  const scenario = getQaScenario(scenarioId);
  const [locale, setLocale] = useState<SupportedLocale>(initialLocale);

  const emitAction = (action: string, detail?: string) => {
    const message: QaMessage = {
      source: 'veinvite-qa',
      type: 'action',
      scenarioId: scenario.id,
      action,
      detail,
      timestamp: new Date().toISOString(),
    };

    // The renderer is same-origin and Preview/dev-only. It deliberately does
    // not call VeInvite APIs, analytics, wallet providers, or Production data.
    if (window.parent !== window) {
      window.parent.postMessage(message, window.location.origin);
    }
  };

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = getLocaleDirection(locale);
    emitAction('scenario.rendered', `${scenario.renderer} · ${locale}`);
    // A scenario or locale change remounts this renderer through the iframe URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario.id, locale]);

  const changeLocale = (nextLocale: SupportedLocale) => {
    setLocale(nextLocale);
    emitAction('locale.changed', nextLocale);
  };

  if (scenario.renderer === 'invite-landing') {
    return (
      <InviteLandingV2
        locale={locale}
        disabled={scenario.fixture.disabled ?? false}
        demoMode={false}
        demoOutcome="success"
        onLocaleChange={changeLocale}
        onBeginnerStart={() => emitAction('invite.beginner-start', 'next: wallet')}
        onExistingWallet={() => emitAction('invite.existing-wallet', 'next: wallet/claim')}
        onDemoOutcomeChange={() => undefined}
      />
    );
  }

  if (scenario.renderer === 'invite-guide') {
    return (
      <ProductionPageShell>
        <InviteGuideContent locale={locale} />
      </ProductionPageShell>
    );
  }

  return (
    <ProductionPageShell>
      <AppGuide locale={locale} />
    </ProductionPageShell>
  );
}

function ProductionPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="qaProductionPageShell">
      {children}
      <style jsx>{`
        .qaProductionPageShell {
          min-height:100svh;
          box-sizing:border-box;
          padding:24px 16px 40px;
          color:#fff;
          background:#080807;
        }
        @media (max-width:560px) {
          .qaProductionPageShell { padding:20px 14px 36px; }
        }
      `}</style>
    </main>
  );
}
