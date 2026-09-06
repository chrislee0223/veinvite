'use client';

import { PermanentReferralClient } from '@/components/PermanentReferralClient';
import { WalletSessionGate } from '@/components/WalletSessionGate';
import { LegalConsentGate } from '@/components/LegalConsentGate';
import { isLocale, type SupportedLocale } from '@/lib/i18n/locales';
import { getQaDirectStateRenderer } from './directStateCoverage';
import { QaInviteLandingStateHarness } from './QaInviteLandingStateHarness';
import { QaHomeStateHarness } from './QaHomeStateHarness';
import { QaHomeFeedbackHarness } from './QaHomeFeedbackHarness';
import { QaNotificationStateHarness } from './QaNotificationStateHarness';
import { QaSettingsStateHarness } from './QaSettingsStateHarness';
import { QaLeaderboardStateHarness } from './QaLeaderboardStateHarness';
import { QA_KNOWN_STATES } from './stateRegistry';

const QA_WALLET = '0x0000000000000000000000000000000000000a11';

export function QaKnownStateRenderer({
  stateId,
  localeOverride,
}: {
  stateId: string;
  localeOverride?: string | null;
}) {
  const state = QA_KNOWN_STATES.find((item) => item.id === stateId) ?? null;
  const renderer = getQaDirectStateRenderer(stateId);

  if (!state || !renderer) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#080807',
          color: '#f8f6ef',
          textAlign: 'center',
        }}
      >
        <div>
          <strong>아직 직접 재현할 수 없는 상태예요.</strong>
          <p style={{ color: '#8f8a80' }}>
            상태 목록에는 남겨 두고 실제 Production 컴포넌트 연결을 계속 추가합니다.
          </p>
        </div>
      </main>
    );
  }

  const locale: SupportedLocale = isLocale(localeOverride)
    ? localeOverride
    : renderer.defaultLocale;

  if (renderer.renderer === 'permanent-referral') {
    return (
      <PermanentReferralClient
        referralKey="QA_STATE_PREVIEW"
        qaPreview={{
          state: renderer.permanentReferralState,
          locale,
        }}
      />
    );
  }

  if (renderer.renderer === 'invite-landing') {
    return (
      <QaInviteLandingStateHarness
        stateId={renderer.inviteLandingStateId}
        locale={locale}
      />
    );
  }

  if (renderer.renderer === 'wallet-session') {
    return (
      <WalletSessionGate
        qaPreview={{
          state: renderer.walletSessionState,
          locale,
        }}
      >
        <span />
      </WalletSessionGate>
    );
  }

  if (renderer.renderer === 'legal-consent') {
    return (
      <LegalConsentGate
        walletAddress={QA_WALLET}
        locale={locale}
        onDisconnect={async () => {}}
        isDisconnecting={false}
        qaPreview={{
          state: renderer.legalConsentState,
          locale,
        }}
      >
        <span />
      </LegalConsentGate>
    );
  }

  if (stateId === 'REWARD-CLAIM-QUEUED') {
    return (
      <QaHomeFeedbackHarness
        stateId="REWARD-CLAIM-QUEUED"
        locale={locale}
      />
    );
  }

  if (renderer.renderer === 'home') {
    return (
      <QaHomeStateHarness
        stateId={renderer.homeStateId}
        locale={locale}
      />
    );
  }

  if (renderer.renderer === 'home-feedback') {
    return (
      <QaHomeFeedbackHarness
        stateId={renderer.homeFeedbackStateId}
        locale={locale}
      />
    );
  }

  if (renderer.renderer === 'notification') {
    return (
      <QaNotificationStateHarness
        stateId={renderer.notificationStateId}
        locale={locale}
      />
    );
  }

  if (renderer.renderer === 'settings') {
    return (
      <QaSettingsStateHarness
        stateId={renderer.settingsStateId}
        locale={locale}
      />
    );
  }

  if (renderer.renderer === 'leaderboard') {
    return (
      <QaLeaderboardStateHarness
        stateId={renderer.leaderboardStateId}
        locale={locale}
      />
    );
  }

  return null;
}
