'use client';

import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { NAV_COPY } from '@/lib/i18n/navCopy';
import { NETWORK_COPY } from '@/lib/i18n/networkCopy';
import type { Locale, SupportedLocale } from '@/lib/i18n/locales';
import { prefetchPublicLeaderboard } from '@/lib/leaderboardClientCache';
import { HomeGuideInfoPortal } from './HomeGuideInfoPortal';
import { LeaderboardImpactInfoPortal } from './LeaderboardImpactInfoPortal';
import { useActiveWallet } from './WalletControl';

// Keep the legacy `guide` tab key while Network is only a Coming Soon surface.
// This preserves the existing analytics/database contract until the real
// Network experience is launched. The user-facing label and content are Network.
export type AppTab = 'home' | 'guide' | 'leaderboard' | 'settings';

const TABS: AppTab[] = ['home', 'guide', 'leaderboard', 'settings'];
const LAZY_TABS: AppTab[] = ['guide', 'leaderboard', 'settings'];
const TAB_CONTENT_SELECTORS: Record<AppTab, string> = {
  home: '.missionCard',
  guide: '.networkCard',
  leaderboard:
    '.leaderboardPage > .impactCard, .leaderboardPage > .rankingCard, .leaderboardPage > .leaderboardInlineError',
  settings: '.settingsPage > header, .settingsPage > .settingsCard',
};
const TAB_ENTER_DURATION_MS = 160;
const NAV_INDICATOR_DURATION_MS = 210;
const NAV_INDICATOR_EASING = 'cubic-bezier(.22,1,.36,1)';

function preloadTabModule(tab: AppTab) {
  if (tab === 'guide') {
    return import('./AppGuide');
  }
  if (tab === 'leaderboard') {
    return import('./PublicLeaderboard');
  }
  if (tab === 'settings') {
    return import('./AppSettings');
  }
  return Promise.resolve();
}

function reportAnalyticsView(tab: AppTab) {
  window.dispatchEvent(
    new CustomEvent('veinvite-analytics-view', {
      detail: tab,
    }),
  );
}

export function AppBottomNavigation({
  activeTab,
  locale,
  onChange,
}: {
  activeTab: AppTab;
  locale: Locale;
  onChange: (tab: AppTab) => void;
}) {
  const labels = NAV_COPY[locale];
  const network = NETWORK_COPY[locale as SupportedLocale];
  const wallet = useActiveWallet();
  const navigationRequestRef = useRef(0);
  const pendingMotionTabRef = useRef<AppTab | null>(null);
  const navigationTrackRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const buttonRefs = useRef<Record<AppTab, HTMLButtonElement | null>>({
    home: null,
    guide: null,
    leaderboard: null,
    settings: null,
  });
  const indicatorInitializedRef = useRef(false);
  const [visualTab, setVisualTab] = useState<AppTab>(activeTab);
  const visualTabRef = useRef<AppTab>(activeTab);

  const setVisualTarget = useCallback((tab: AppTab) => {
    visualTabRef.current = tab;
    setVisualTab(tab);
  }, []);

  const positionIndicator = useCallback((tab: AppTab, animate: boolean) => {
    const track = navigationTrackRef.current;
    const indicator = indicatorRef.current;
    const button = buttonRefs.current[tab];
    if (!track || !indicator || !button) return;

    const trackRect = track.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const reduceMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const shouldAnimate = animate && !reduceMotion;

    indicator.style.transition = shouldAnimate
      ? `transform ${NAV_INDICATOR_DURATION_MS}ms ${NAV_INDICATOR_EASING}, width ${NAV_INDICATOR_DURATION_MS}ms ${NAV_INDICATOR_EASING}, height ${NAV_INDICATOR_DURATION_MS}ms ${NAV_INDICATOR_EASING}`
      : 'none';
    indicator.style.width = `${buttonRect.width}px`;
    indicator.style.height = `${buttonRect.height}px`;
    indicator.style.transform = `translate3d(${buttonRect.left - trackRect.left - track.clientLeft}px, ${buttonRect.top - trackRect.top - track.clientTop}px, 0)`;
    indicator.dataset.ready = 'true';
  }, []);

  useEffect(() => {
    let cancelled = false;

    const moduleTimer = window.setTimeout(() => {
      if (cancelled) return;
      void Promise.allSettled(
        LAZY_TABS.map((tab) => preloadTabModule(tab)),
      );
    }, 0);

    const leaderboardTimer = window.setTimeout(() => {
      if (cancelled) return;
      void prefetchPublicLeaderboard(wallet).catch(() => undefined);
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(moduleTimer);
      window.clearTimeout(leaderboardTimer);
    };
  }, [wallet]);

  useEffect(() => {
    setVisualTarget(activeTab);
  }, [activeTab, setVisualTarget]);

  useLayoutEffect(() => {
    positionIndicator(visualTab, indicatorInitializedRef.current);
    indicatorInitializedRef.current = true;
  }, [positionIndicator, visualTab]);

  useEffect(() => {
    const track = navigationTrackRef.current;
    if (!track) return;

    let frame = 0;
    const syncWithoutMotion = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        positionIndicator(visualTabRef.current, false);
      });
    };

    const observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(syncWithoutMotion)
      : null;
    observer?.observe(track);
    TABS.forEach((tab) => {
      const button = buttonRefs.current[tab];
      if (button) observer?.observe(button);
    });
    window.addEventListener('resize', syncWithoutMotion);

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', syncWithoutMotion);
    };
  }, [positionIndicator]);

  useLayoutEffect(() => {
    const pendingTab = pendingMotionTabRef.current;
    if (pendingTab !== activeTab) return;

    pendingMotionTabRef.current = null;
    if (
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(
        TAB_CONTENT_SELECTORS[activeTab],
      ),
    );
    if (targets.length < 1) return;

    const animations = targets
      .filter((target) => typeof target.animate === 'function')
      .map((target) =>
        target.animate(
          [
            { opacity: 0, transform: 'translateY(5px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          {
            duration: TAB_ENTER_DURATION_MS,
            easing: 'cubic-bezier(.2,.8,.2,1)',
          },
        ),
      );

    return () => {
      animations.forEach((animation) => animation.cancel());
    };
  }, [activeTab]);

  const warmTab = (tab: AppTab) => {
    void preloadTabModule(tab).catch(() => undefined);
    if (tab === 'leaderboard') {
      void prefetchPublicLeaderboard(wallet).catch(() => undefined);
    }
  };

  const commitTab = (tab: AppTab, requestId: number) => {
    if (navigationRequestRef.current !== requestId) return;

    // HomeClient also normalizes scroll position on a tab change. Do it here
    // synchronously first so its legacy smooth-scroll call has no distance to
    // animate across after a large content-height swap on desktop browsers.
    if (window.scrollY !== 0) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    // A first render of a code-split tab can briefly suspend even after its
    // chunk promise resolves. Mark the update as a React transition so the
    // currently visible tab stays painted until the next tab is actually ready
    // instead of revealing the root dark background for a frame.
    startTransition(() => {
      onChange(tab);
    });
    reportAnalyticsView(tab);
  };

  const selectTab = (tab: AppTab) => {
    const requestId = ++navigationRequestRef.current;

    if (tab === activeTab) {
      // A second tap on the current tab cancels any older lazy-tab request and
      // brings an in-flight visual indicator back to the page that is still
      // actually active.
      pendingMotionTabRef.current = null;
      setVisualTarget(activeTab);
      return;
    }

    // Give immediate touch feedback even when a code-split tab still needs a
    // moment to become ready. aria-current remains tied to activeTab below, so
    // accessibility state only changes after the real page has committed.
    setVisualTarget(tab);
    pendingMotionTabRef.current = tab;
    if (tab === 'home') {
      commitTab(tab, requestId);
      return;
    }

    void preloadTabModule(tab)
      .then(() => commitTab(tab, requestId))
      .catch(() => commitTab(tab, requestId));
  };

  return (
    <>
      {activeTab === 'home' ? (
        <HomeGuideInfoPortal locale={locale} />
      ) : null}
      {activeTab === 'leaderboard' ? (
        <LeaderboardImpactInfoPortal locale={locale} />
      ) : null}
      <nav
        className="bottomNavigation"
        data-veinvite-active-tab={activeTab}
        data-veinvite-visual-tab={visualTab}
        aria-label={labels.ariaLabel}
      >
        <div ref={navigationTrackRef}>
          <span
            ref={indicatorRef}
            className="activeIndicator"
            aria-hidden="true"
          />
          {TABS.map((tab) => (
            <button
              key={tab}
              ref={(node) => {
                buttonRefs.current[tab] = node;
              }}
              type="button"
              data-veinvite-tab={tab}
              className={visualTab === tab ? 'visualActive' : ''}
              aria-current={activeTab === tab ? 'page' : undefined}
              onPointerEnter={tab === 'home' ? undefined : () => warmTab(tab)}
              onFocus={tab === 'home' ? undefined : () => warmTab(tab)}
              onPointerDown={tab === 'home' ? undefined : () => warmTab(tab)}
              onClick={() => selectTab(tab)}
            >
              <NavIcon name={tab} />
              <span>{tab === 'guide' ? network.navLabel : labels[tab]}</span>
            </button>
          ))}
        </div>

        <style jsx>{`
          .bottomNavigation { position: fixed; z-index: 90; right: 0; bottom: 0; left: 0; padding: 0 12px calc(10px + env(safe-area-inset-bottom)); pointer-events: none; background: linear-gradient(to top,rgba(7,7,7,.98) 58%,transparent); }
          .bottomNavigation > div { position: relative; width: min(100%,520px); min-height: 70px; margin: 0 auto; padding: 6px; display: grid; grid-template-columns: repeat(4,1fr); border: 1px solid rgba(255,205,80,.16); border-radius: 23px; background: rgba(22,22,20,.985); box-shadow: 0 18px 55px rgba(0,0,0,.5); pointer-events: auto; isolation: isolate; }
          .activeIndicator { position: absolute; z-index: 0; top: 0; left: 0; border-radius: 17px; background: rgba(255,201,61,.1); opacity: 0; pointer-events: none; }
          .activeIndicator[data-ready='true'] { opacity: 1; }
          button { position: relative; z-index: 1; min-width: 0; min-height: 56px; padding: 6px 3px; display: grid; place-items: center; align-content: center; gap: 4px; border: 0; border-radius: 17px; background: transparent; color: #77736c; font: inherit; font-size: .6rem; font-weight: 850; cursor: pointer; transition: color 180ms ease, transform 90ms ease; }
          button:active { transform: scale(.98); }
          button span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          button.visualActive { color: #ffd45f; }
          button :global(svg) { width: 21px; height: 21px; }
          @media (max-width: 360px) { button { font-size: .53rem; } }
          @media (prefers-reduced-motion: reduce) {
            .activeIndicator { transition: none !important; }
            button { transition: none; }
            button:active { transform: none; }
          }
        `}</style>
      </nav>
    </>
  );
}

function NavIcon({ name }: { name: AppTab }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'home') {
    return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>;
  }
  if (name === 'guide') {
    return <svg {...common}><circle cx="12" cy="5" r="2.2" /><circle cx="6" cy="17" r="2.2" /><circle cx="18" cy="17" r="2.2" /><path d="M10.8 6.9 7.2 15" /><path d="m13.2 6.9 3.6 8.1" /><path d="M8.2 17h7.6" /></svg>;
  }
  if (name === 'leaderboard') {
    return <svg {...common}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a4 4 0 0 0 4 4" /><path d="M17 6h3v1a4 4 0 0 1-4 4" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21H9.55v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H2.4V9.55h.1A1.7 1.7 0 0 0 4.1 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.56 3.7l.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V2.4h4.05v.1A1.7 1.7 0 0 0 15 4.1a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.5a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1 .4h.1v4.05H21a1.7 1.7 0 0 0-1.6 1.05Z" /></svg>;
}
