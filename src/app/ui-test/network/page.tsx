'use client';

import { AppNetwork } from '@/components/AppNetwork';

const PREVIEW_WALLET = '0x1111111111111111111111111111111111111111';

export default function NetworkPreviewPage() {
  return (
    <main className="previewShell">
      <div className="previewNote">
        <strong>Network UI Preview</strong>
        <span>Sample data · no wallet connection required</span>
      </div>

      <AppNetwork
        locale="ko"
        wallet={PREVIEW_WALLET}
        onConnect={() => {}}
        onInvite={() => {}}
        dataEndpoint="/api/network-preview"
      />

      <style jsx global>{`
        html, body { margin: 0; min-height: 100%; background: #090907; color: #f7f3e9; }
        body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        button, input, select { font-family: inherit; }
      `}</style>
      <style jsx>{`
        .previewShell {
          min-height: 100vh;
          box-sizing: border-box;
          padding: 18px 14px 54px;
          background:
            radial-gradient(circle at 50% -10%, rgba(212, 158, 38, .08), transparent 30%),
            #090907;
        }
        .previewNote {
          width: min(100%, 520px);
          margin: 0 auto 18px;
          padding: 10px 12px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid rgba(255, 205, 80, .10);
          border-radius: 14px;
          background: rgba(255,255,255,.025);
          color: #8f8879;
          font-size: 11px;
        }
        .previewNote strong { color: #d4b057; font-size: 11px; }
        @media (max-width: 420px) {
          .previewShell { padding: 14px 10px 42px; }
          .previewNote { align-items: flex-start; flex-direction: column; gap: 3px; }
        }
      `}</style>
    </main>
  );
}
