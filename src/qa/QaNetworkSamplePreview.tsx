'use client';

import { useEffect, useState } from 'react';

import { AppNetwork } from '@/components/AppNetwork';
import { QaWalletLauncherOverrideProvider } from '@/components/WalletControl';
import type { Locale } from '@/lib/i18n/locales';

const SAMPLE_ROOT_WALLET = '0x0000000000000000000000000000000000000001';

export function QaNetworkSamplePreview({ locale }: { locale: Locale }) {
  const [mockRouteReady, setMockRouteReady] = useState(false);

  useEffect(() => {
    const originalFetch = window.fetch;
    const boundFetch = originalFetch.bind(window);

    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string') {
        const target = new URL(input, window.location.origin);
        if (target.origin === window.location.origin && target.pathname === '/api/network') {
          target.pathname = '/qa/network-sample/data';
          return boundFetch(target.toString(), init);
        }
      }

      return boundFetch(input, init);
    }) as typeof window.fetch;

    setMockRouteReady(true);

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <main className="qaNetworkSample">
      <header className="sampleNotice">
        <div>
          <strong>SAMPLE NETWORK</strong>
          <span>실제 초대·보상·Production 데이터와 완전히 분리된 QA 샘플입니다.</span>
        </div>
        <div className="sampleTips" aria-label="QA sample controls">
          <span>노드 선택</span>
          <span>+N 펼치기</span>
          <span>드래그 · 확대/축소</span>
        </div>
      </header>

      {mockRouteReady ? (
        <QaWalletLauncherOverrideProvider value={{ wallet: SAMPLE_ROOT_WALLET }}>
          <AppNetwork locale={locale} />
        </QaWalletLauncherOverrideProvider>
      ) : (
        <div className="sampleLoading">Sample Network 준비 중…</div>
      )}

      <style jsx>{`
        .qaNetworkSample{min-height:100svh;padding:14px 0 34px;background:#0b0b09;color:#e9e4da}.sampleNotice{width:min(calc(100% - 28px),1120px);box-sizing:border-box;margin:0 auto 8px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid rgba(255,205,80,.13);border-radius:13px;background:rgba(244,183,40,.045)}.sampleNotice>div:first-child{min-width:0;display:flex;align-items:baseline;gap:9px}.sampleNotice strong{flex:0 0 auto;color:#d9ae43;font-size:.58rem;letter-spacing:.08em}.sampleNotice span{color:#817b70;font-size:.58rem;line-height:1.4}.sampleTips{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.sampleTips span{padding:4px 7px;border-radius:999px;background:rgba(255,255,255,.035);color:#756f66;font-size:.52rem;white-space:nowrap}.sampleLoading{height:420px;display:grid;place-items:center;color:#80796f;font-size:.7rem}@media(max-width:700px){.qaNetworkSample{padding-top:8px}.sampleNotice{width:calc(100% - 20px);margin-bottom:2px;align-items:flex-start;flex-direction:column;gap:7px}.sampleNotice>div:first-child{display:grid;gap:3px}.sampleTips{justify-content:flex-start}}
      `}</style>
    </main>
  );
}
