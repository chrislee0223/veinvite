export const SOFT_FOCUS_CLOSE_MS = 140;

export function softFocusCloseDelay() {
  if (typeof window === 'undefined') return SOFT_FOCUS_CLOSE_MS;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 0
    : SOFT_FOCUS_CLOSE_MS;
}

export const SOFT_FOCUS_MOTION_CSS = `
  .veinviteSoftFocusBackdrop {
    opacity: 0;
    transition: opacity 140ms ease-out;
  }
  .veinviteSoftFocusBackdrop[data-open="true"] {
    opacity: 1;
    transition-duration: 180ms;
  }
  .veinviteSoftFocusPanel {
    opacity: 0;
    transform: translate3d(0, 4px, 0) scale(.97);
    transform-origin: center;
    transition:
      opacity 140ms ease-out,
      transform 140ms cubic-bezier(.22,.8,.24,1);
  }
  .veinviteSoftFocusBackdrop[data-open="true"] .veinviteSoftFocusPanel {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
    transition-duration: 180ms;
  }
  @media (prefers-reduced-motion: reduce) {
    .veinviteSoftFocusBackdrop,
    .veinviteSoftFocusPanel {
      transition: none !important;
    }
    .veinviteSoftFocusPanel {
      transform: none !important;
    }
  }
`;
