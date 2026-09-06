'use client';

import { PermanentReferralClient } from '@/components/PermanentReferralClient';
import { isLocale, type SupportedLocale } from '@/lib/i18n/locales';
import { getQaDirectStateRenderer } from './directStateCoverage';
import { QA_KNOWN_STATES } from './stateRegistry';

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

  return null;
}
