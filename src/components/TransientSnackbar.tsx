'use client';

import { useEffect, useRef } from 'react';

export type TransientFeedbackKind = 'success' | 'info' | 'error';

export type TransientFeedback = {
  id: number;
  kind: TransientFeedbackKind;
  text: string;
};

const AUTO_DISMISS_MS = 4_000;

export function TransientSnackbar({
  feedback,
  closeLabel,
  onDismiss,
}: {
  feedback: TransientFeedback | null;
  closeLabel: string;
  onDismiss: () => void;
}) {
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    clearTimer();

    if (!feedback || feedback.kind === 'error') {
      return clearTimer;
    }

    const schedule = () => {
      clearTimer();
      if (document.visibilityState !== 'visible') return;
      timerRef.current = window.setTimeout(onDismiss, AUTO_DISMISS_MS);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') schedule();
      else clearTimer();
    };

    schedule();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [feedback?.id, feedback?.kind, onDismiss]);

  if (!feedback) return null;

  return (
    <aside
      className={`transientSnackbar ${feedback.kind}`}
      role={feedback.kind === 'error' ? 'alert' : 'status'}
      aria-live={feedback.kind === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <span className="feedbackIcon" aria-hidden="true">
        {feedback.kind === 'error' ? '!' : feedback.kind === 'info' ? 'i' : '✓'}
      </span>
      <span className="feedbackText">{feedback.text}</span>
      <button type="button" className="feedbackClose" aria-label={closeLabel} onClick={onDismiss}>
        ×
      </button>

      <style jsx>{`
        .transientSnackbar {
          position: fixed;
          z-index: 92;
          left: 50%;
          bottom: calc(92px + env(safe-area-inset-bottom));
          width: min(calc(100vw - 28px), 520px);
          min-height: 54px;
          box-sizing: border-box;
          transform: translateX(-50%);
          display: grid;
          grid-template-columns: 32px minmax(0, 1fr) 44px;
          align-items: center;
          gap: 10px;
          padding: 8px 6px 8px 12px;
          direction: inherit;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 17px;
          background: rgba(24,26,30,.97);
          color: #f7f7f3;
          box-shadow: 0 18px 55px rgba(0,0,0,.46);
          backdrop-filter: blur(16px);
          animation: snackbar-in 180ms ease-out both;
        }
        .transientSnackbar.success { border-color: rgba(76,220,155,.24); background: rgba(18,34,29,.98); }
        .transientSnackbar.info { border-color: rgba(255,205,80,.24); background: rgba(37,32,20,.98); }
        .transientSnackbar.error { border-color: rgba(255,100,106,.3); background: rgba(42,22,25,.985); }
        .feedbackIcon {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: rgba(255,255,255,.08);
          color: #e7e7e2;
          font-size: .78rem;
          font-weight: 950;
        }
        .success .feedbackIcon { background: rgba(54,207,130,.18); color: #7cefc0; }
        .info .feedbackIcon { background: rgba(244,183,40,.17); color: #ffd66e; }
        .error .feedbackIcon { background: rgba(255,100,106,.17); color: #ff9ca0; }
        .feedbackText {
          min-width: 0;
          font-size: .8rem;
          font-weight: 800;
          line-height: 1.4;
          text-align: start;
          word-break: keep-all;
          overflow-wrap: break-word;
        }
        .feedbackClose {
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: rgba(255,255,255,.72);
          font: inherit;
          font-size: 1.35rem;
          line-height: 1;
          cursor: pointer;
        }
        .feedbackClose:hover { background: rgba(255,255,255,.07); color: #fff; }
        .feedbackClose:focus-visible { outline: 2px solid rgba(255,205,80,.76); outline-offset: -2px; }
        @keyframes snackbar-in {
          from { opacity: 0; transform: translate(-50%, 7px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @media (max-width: 360px) {
          .transientSnackbar { width: calc(100vw - 20px); grid-template-columns: 30px minmax(0,1fr) 42px; gap: 8px; padding-inline-start: 10px; }
          .feedbackText { font-size: .75rem; }
          .feedbackClose { width: 42px; height: 42px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .transientSnackbar { animation: none; }
        }
      `}</style>
    </aside>
  );
}
