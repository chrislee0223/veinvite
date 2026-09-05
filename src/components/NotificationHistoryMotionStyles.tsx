'use client';

export function NotificationHistoryMotionStyles() {
  return (
    <style jsx global>{`
      @keyframes notificationHistoryBackdropIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes notificationHistoryPanelIn {
        from {
          opacity: 0;
          transform: translate3d(
            0,
            var(--notification-history-enter-y, -7px),
            0
          ) scale(.985);
        }
        to {
          opacity: 1;
          transform: translate3d(0, 0, 0) scale(1);
        }
      }

      .notificationHistoryBackdrop {
        animation: notificationHistoryBackdropIn 180ms ease-out both;
      }

      .notificationHistoryPanel {
        --notification-history-enter-y: -7px;
        transform-origin: top center;
        animation: notificationHistoryPanelIn 210ms cubic-bezier(.16, 1, .3, 1) both;
        will-change: opacity, transform;
      }

      @media (max-width: 560px) {
        .notificationHistoryPanel {
          --notification-history-enter-y: 14px;
          transform-origin: bottom center;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .notificationHistoryBackdrop,
        .notificationHistoryPanel {
          animation: none !important;
          will-change: auto;
        }
      }
    `}</style>
  );
}
