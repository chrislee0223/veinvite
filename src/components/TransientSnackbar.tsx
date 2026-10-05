'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type TransientFeedbackKind = 'success' | 'info' | 'error';

type StandardTransientFeedback = {
  id: number;
  kind: TransientFeedbackKind;
  text: string;
};

export type RewardPaidTransientFeedback = {
  id: number;
  kind: 'reward';
  title: string;
  text: string;
  amountB3tr: string;
  shareLabel: string;
  confirmLabel: string;
  onShare: () => void;
  onConfirm: () => void | Promise<void>;
};

export type TransientFeedback =
  | StandardTransientFeedback
  | RewardPaidTransientFeedback;

const AUTO_DISMISS_MS = 4_000;
const EXIT_MS = 140;

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
  const exitTimerRef = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);

  const finishDismiss = useCallback(() => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setClosing(false);
    onDismiss();
  }, [onDismiss]);

  const requestDismiss = useCallback(() => {
    if (!feedback || closing) return;
    const reducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (reducedMotion) {
      finishDismiss();
      return;
    }
    setClosing(true);
    exitTimerRef.current = window.setTimeout(finishDismiss, EXIT_MS + 40);
  }, [closing, feedback, finishDismiss]);

  const confirmReward = useCallback(() => {
    if (!feedback || feedback.kind !== 'reward') return;
    void feedback.onConfirm();
    requestDismiss();
  }, [feedback, requestDismiss]);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    clearTimer();

    if (
      !feedback ||
      feedback.kind === 'error' ||
      feedback.kind === 'reward'
    ) {
      return clearTimer;
    }

    const schedule = () => {
      clearTimer();
      if (document.visibilityState !== 'visible') return;
      timerRef.current = window.setTimeout(requestDismiss, AUTO_DISMISS_MS);
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
  }, [feedback?.id, feedback?.kind, requestDismiss]);

  useEffect(() => {
    setClosing(false);
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, [feedback?.id]);

  useEffect(() => () => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
    }
  }, []);

  if (!feedback) return null;

  const reward = feedback.kind === 'reward';

  return (
    <aside
      className={`transientSnackbar ${feedback.kind}${closing ? ' closing' : ''}`}
      role={feedback.kind === 'error' ? 'alert' : 'status'}
      aria-live={feedback.kind === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <span className="feedbackIcon" aria-hidden="true">
        {reward
          ? '✓'
          : feedback.kind === 'error'
            ? '!'
            : feedback.kind === 'info'
              ? 'i'
              : '✓'}
      </span>

      {reward ? (
        <div className="rewardFeedbackBody">
          <strong>{feedback.title}</strong>
          <div className="rewardFeedbackAmount">
            +{feedback.amountB3tr} <span>B3TR</span>
          </div>
          <p>{feedback.text}</p>
        </div>
      ) : (
        <span className="feedbackText">{feedback.text}</span>
      )}

      <button
        type="button"
        className="feedbackClose"
        aria-label={closeLabel}
        onClick={reward ? confirmReward : requestDismiss}
      >
        ×
      </button>

      {reward ? (
        <div className="rewardFeedbackActions">
          <button
            type="button"
            className="rewardShareButton"
            onClick={feedback.onShare}
          >
            {feedback.shareLabel}
          </button>
          <button
            type="button"
            className="rewardConfirmButton"
            onClick={confirmReward}
          >
            {feedback.confirmLabel}
          </button>
        </div>
      ) : null}

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
          padding-block: 8px;
          padding-inline: 12px 6px;
          direction: inherit;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 17px;
          background: rgba(24,26,30,.97);
          color: #f7f7f3;
          box-shadow: 0 18px 55px rgba(0,0,0,.46);
          backdrop-filter: blur(16px);
          animation: snackbar-in 180ms ease-out both;
        }
        .transientSnackbar.closing {
          animation: snackbar-out 140ms ease-in both;
          pointer-events: none;
        }
        .transientSnackbar.success { border-color: rgba(76,220,155,.24); background: rgba(18,34,29,.98); }
        .transientSnackbar.info { border-color: rgba(255,205,80,.24); background: rgba(37,32,20,.98); }
        .transientSnackbar.error { border-color: rgba(255,100,106,.3); background: rgba(42,22,25,.985); }
        .transientSnackbar.reward {
          align-items: start;
          padding-block: 14px;
          border-color: rgba(255,205,80,.28);
          background: linear-gradient(145deg, rgba(35,29,16,.99), rgba(20,20,18,.99));
        }
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
        .reward .feedbackIcon { background: rgba(244,183,40,.17); color: #ffd66e; }
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
        .feedbackClose:focus-visible,
        .rewardShareButton:focus-visible,
        .rewardConfirmButton:focus-visible {
          outline: 2px solid rgba(255,205,80,.76);
          outline-offset: 2px;
        }
        .rewardFeedbackBody {
          min-width: 0;
          text-align: start;
        }
        .rewardFeedbackBody > strong {
          display: block;
          color: #fff6d0;
          font-size: .88rem;
          line-height: 1.35;
        }
        .rewardFeedbackAmount {
          margin-top: 6px;
          color: #ffd04a;
          font-size: 1.2rem;
          font-weight: 950;
          line-height: 1.1;
          font-variant-numeric: tabular-nums;
        }
        .rewardFeedbackAmount span {
          font-size: .68rem;
          letter-spacing: .02em;
        }
        .rewardFeedbackBody p {
          margin: 7px 0 0;
          color: #b8b1a7;
          font-size: .72rem;
          font-weight: 700;
          line-height: 1.45;
          word-break: keep-all;
          overflow-wrap: break-word;
        }
        .rewardFeedbackActions {
          grid-column: 1 / -1;
          display: grid;
          gap: 7px;
          margin-top: 2px;
          padding: 0 6px 2px 42px;
        }
        .rewardShareButton,
        .rewardConfirmButton {
          width: 100%;
          min-height: 42px;
          border-radius: 12px;
          font: inherit;
          font-size: .72rem;
          font-weight: 950;
          cursor: pointer;
        }
        .rewardShareButton {
          border: 1px solid rgba(255,255,255,.16);
          background: #f7f7f5;
          color: #0b0b0a;
        }
        .rewardConfirmButton {
          border: 1px solid rgba(255,205,80,.2);
          background: rgba(244,183,40,.08);
          color: #f1cf65;
        }
        @keyframes snackbar-in {
          from { opacity: 0; transform: translate(-50%, 7px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes snackbar-out {
          from { opacity: 1; transform: translate(-50%, 0); }
          to { opacity: 0; transform: translate(-50%, 4px); }
        }
        @media (max-width: 360px) {
          .transientSnackbar { width: calc(100vw - 20px); grid-template-columns: 30px minmax(0,1fr) 42px; gap: 8px; padding-inline: 10px 5px; }
          .feedbackText { font-size: .75rem; }
          .feedbackClose { width: 42px; height: 42px; }
          .rewardFeedbackActions { padding-inline-start: 38px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .transientSnackbar { animation: none; }
        }
      `}</style>
    </aside>
  );
}
