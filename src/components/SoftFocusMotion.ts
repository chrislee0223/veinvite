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
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
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
  .veinviteSoftFocusHeader {
    flex: 0 0 auto;
    min-height: 56px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    box-sizing: border-box;
    padding: 10px 12px 8px;
    border-bottom: 1px solid rgba(255,255,255,.045);
    background: rgba(255,255,255,.012);
  }
  .veinviteSoftFocusScroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  .veinviteSoftFocusClose {
    position: relative;
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 12px;
    background: rgba(255,255,255,.055);
    color: #fff;
    cursor: pointer;
    line-height: 0;
  }
  .veinviteSoftFocusClose::before,
  .veinviteSoftFocusClose::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 13px;
    height: 1.8px;
    border-radius: 999px;
    background: currentColor;
    transform-origin: center;
  }
  .veinviteSoftFocusClose::before {
    transform: translate(-50%, -50%) rotate(45deg);
  }
  .veinviteSoftFocusClose::after {
    transform: translate(-50%, -50%) rotate(-45deg);
  }
  .veinviteSoftFocusClose:hover {
    border-color: rgba(255,255,255,.2);
    background: rgba(255,255,255,.085);
  }
  .veinviteSoftFocusClose:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(244,183,40,.1);
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
