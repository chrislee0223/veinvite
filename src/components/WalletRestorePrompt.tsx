'use client';

import { Brand } from './Brand';
import type { Locale } from '@/lib/i18n/locales';

/**
 * This is a recovery *action*, not an authenticated Home surface.
 * A server cookie or persisted account must never authorize app content.
 */
export function WalletRestorePrompt({
  locale,
  onReconnect,
}: {
  locale: Locale;
  onReconnect: () => void;
}) {
  const ko = locale === 'ko';
  return (
    <div
      data-veinvite-wallet-session-gate="interactive"
      data-veinvite-cold-wallet-restore="stalled"
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        background: '#080807',
        color: '#fff',
        textAlign: 'center',
      }}
    >
      <div style={{
        width: 'min(420px, 100%)',
        padding: '28px 24px',
        display: 'grid',
        gap: '18px',
        justifyItems: 'center',
        border: '1px solid rgba(255,205,80,0.20)',
        borderRadius: '24px',
        background: 'rgba(18,20,33,0.94)',
      }}>
        <Brand compact />
        <strong style={{ fontSize: '1.2rem' }}>
          {ko ? '지갑 연결을 다시 확인해 주세요' : 'Reconnect your wallet'}
        </strong>
        <p style={{ opacity: 0.8, lineHeight: 1.6, margin: 0 }}>
          {ko
            ? '기존 로그인 정보를 유지하고 있어요. 지갑 연결 복원이 지연되어 다시 연결해야 합니다.'
            : 'Your existing login session is preserved. The wallet connection did not finish restoring.'}
        </p>
        <button
          type="button"
          onClick={onReconnect}
          style={{
            width: '100%',
            minHeight: '48px',
            border: 0,
            borderRadius: '14px',
            background: 'linear-gradient(135deg,#ffd24d,#efa718)',
            fontWeight: 800,
            font: 'inherit',
            cursor: 'pointer',
            color: '#17120a',
          }}
        >
          {ko ? '지갑 다시 연결' : 'Reconnect wallet'}
        </button>
      </div>
    </div>
  );
}
