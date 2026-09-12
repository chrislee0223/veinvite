'use client';

import { useEffect, useRef, useState } from 'react';

import { QaNetworkFinalProductionPreviewV49 } from './QaNetworkFinalProductionPreviewV49';

type CheckState = 'checking' | 'ready' | 'failed' | 'hidden';

function percent(text: string | null | undefined) {
  const parsed = Number.parseFloat((text ?? '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

export function QaNetworkFinalInteractivePreviewV50() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [check, setCheck] = useState<CheckState>('checking');

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let cancelled = false;
    let hideTimer = 0;
    let verifyTimer = 0;

    const run = () => {
      if (cancelled) return;
      const zoomValue = root.querySelector<HTMLButtonElement>('.zoomValue');
      const plusButton = Array.from(root.querySelectorAll<HTMLButtonElement>('.navActions button'))
        .find((button) => button.textContent?.trim() === '+');

      if (!zoomValue || !plusButton) {
        setCheck('failed');
        return;
      }

      const before = percent(zoomValue.textContent);
      plusButton.click();

      verifyTimer = window.setTimeout(() => {
        if (cancelled) return;
        const after = percent(zoomValue.textContent);
        const interactive = before !== null && after !== null && after > before;

        if (!interactive) {
          setCheck('failed');
          return;
        }

        // Return the preview to the exact default camera after the interaction probe.
        zoomValue.click();
        setCheck('ready');
        hideTimer = window.setTimeout(() => {
          if (!cancelled) setCheck('hidden');
        }, 1800);
      }, 180);
    };

    const startTimer = window.setTimeout(run, 700);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(verifyTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  return (
    <div ref={rootRef} className="v50InteractivePreview">
      <QaNetworkFinalProductionPreviewV49 />

      {check !== 'hidden' ? (
        <div className={`v50BootCheck ${check}`} role="status" aria-live="polite">
          {check === 'checking' ? 'Checking interactions…' : null}
          {check === 'ready' ? 'Interactive preview ready' : null}
          {check === 'failed' ? 'Preview failed to initialize — refresh once' : null}
        </div>
      ) : null}

      <style jsx global>{`
        .v50BootCheck{
          position:fixed;z-index:9999;right:14px;bottom:max(14px,env(safe-area-inset-bottom));
          min-height:30px;padding:0 11px;border-radius:999px;display:flex;align-items:center;
          border:1px solid rgba(255,255,255,.09);background:rgba(14,14,12,.96);color:#928b7f;
          box-shadow:0 10px 28px rgba(0,0,0,.3);font:600 .48rem/1 ui-sans-serif,system-ui,-apple-system,sans-serif;
          pointer-events:none;backdrop-filter:blur(10px)
        }
        .v50BootCheck.ready{border-color:rgba(244,183,40,.34);color:#ddb958}
        .v50BootCheck.failed{border-color:rgba(225,115,83,.45);color:#df967f}
        @media(max-width:640px){.v50BootCheck{right:10px;bottom:max(10px,env(safe-area-inset-bottom));font-size:.45rem}}
      `}</style>
    </div>
  );
}
