'use client';

import dynamic from 'next/dynamic';
import { useLayoutEffect } from 'react';

import { AppNetworkComingSoon } from './AppNetworkComingSoon';
import { AppNetworkHub } from './AppNetworkHub';
import { NetworkInteractionSafety } from './NetworkInteractionSafety';
import { useWalletLauncher } from './WalletControl';
import { GUIDE_COPY } from '@/lib/i18n/guideCopy';
import { GUIDE_ELIGIBILITY_COPY } from '@/lib/i18n/guideEligibilityCopy';
import { GUIDE_FLOW_COPY } from '@/lib/i18n/guideFlowCopy';
import { GUIDE_MISSION_STEP_COPY } from '@/lib/i18n/guideMissionStepCopy';
import { GUIDE_REWARD_STEP_COPY } from '@/lib/i18n/guideRewardStepCopy';
import '@/lib/i18n/networkNativeReview';
import type { Locale } from '@/lib/i18n/locales';

const AppNetworkCanaryV71 = dynamic(
  () => import('./AppNetworkCanaryV71').then((module) => module.AppNetworkCanaryV71),
  { ssr: false },
);

const NETWORK_CANARY_WALLET = '0xeff325935b63299e9eeda79931bed6ec119aefcb';
const NETWORK_PAGE_TOUCH_ACTION = 'pan-x pan-y';
const NETWORK_VIEWPORT_ZOOM_KEYS = new Set([
  'initial-scale',
  'minimum-scale',
  'maximum-scale',
  'user-scalable',
]);

function lockedNetworkViewportContent(content: string | null): string {
  const entries = (content ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry) => {
      const [key] = entry.split('=');
      return !NETWORK_VIEWPORT_ZOOM_KEYS.has(key.trim().toLowerCase());
    });

  if (!entries.some((entry) => entry.toLowerCase().startsWith('width='))) {
    entries.unshift('width=device-width');
  }

  entries.push(
    'initial-scale=1',
    'minimum-scale=1',
    'maximum-scale=1',
    'user-scalable=no',
  );
  return entries.join(', ');
}

function NetworkPageZoomGuard() {
  useLayoutEffect(() => {
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!viewport) return;

    const root = document.documentElement;
    const previousContent = viewport.getAttribute('content');
    const previousTouchAction = root.style.touchAction;
    const lockedContent = lockedNetworkViewportContent(previousContent);

    const blockNativePinch = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };

    viewport.setAttribute('content', lockedContent);
    root.style.touchAction = NETWORK_PAGE_TOUCH_ACTION;
    root.dataset.veinviteNetworkViewportLocked = 'true';

    // iOS Safari and embedded WKWebViews may still emit native gesture events
    // even when viewport scaling is constrained. Block only the native page
    // gesture; the Network canvases keep owning their existing pointer/touch
    // pinch logic and one-finger pan/controls remain untouched.
    document.addEventListener('gesturestart', blockNativePinch, { capture: true, passive: false });
    document.addEventListener('gesturechange', blockNativePinch, { capture: true, passive: false });
    document.addEventListener('gestureend', blockNativePinch, { capture: true, passive: false });

    return () => {
      document.removeEventListener('gesturestart', blockNativePinch, true);
      document.removeEventListener('gesturechange', blockNativePinch, true);
      document.removeEventListener('gestureend', blockNativePinch, true);

      // Restore only values still owned by this guard so a future route or
      // browser integration cannot be overwritten by stale cleanup.
      if (viewport.getAttribute('content') === lockedContent) {
        if (previousContent === null) viewport.removeAttribute('content');
        else viewport.setAttribute('content', previousContent);
      }
      if (root.style.touchAction === NETWORK_PAGE_TOUCH_ACTION) {
        root.style.touchAction = previousTouchAction;
      }
      if (root.dataset.veinviteNetworkViewportLocked === 'true') {
        delete root.dataset.veinviteNetworkViewportLocked;
      }
    };
  }, []);

  return null;
}

// Keep the legacy `guide` tab key for analytics/database compatibility while
// the user-facing tab is Network. The hub separates My Network, Empty State,
// rollout maintenance, and privacy-gated Public Explore without changing the
// underlying mature My Network canvas.
export function AppGuide({ locale }: { locale: Locale }) {
  const { wallet } = useWalletLauncher();
  const networkEnabled =
    process.env.NEXT_PUBLIC_NETWORK_CANVAS_ENABLED !== 'false';
  const walletKey = wallet?.toLowerCase() ?? 'disconnected';

  if (wallet?.toLowerCase() === NETWORK_CANARY_WALLET) {
    return (
      <>
        <NetworkPageZoomGuard />
        <NetworkInteractionSafety key={walletKey}>
          <AppNetworkCanaryV71 locale={locale} />
        </NetworkInteractionSafety>
      </>
    );
  }

  return networkEnabled ? (
    <>
      <NetworkPageZoomGuard />
      <NetworkInteractionSafety key={walletKey}>
        <AppNetworkHub locale={locale} />
      </NetworkInteractionSafety>
    </>
  ) : (
    <AppNetworkComingSoon locale={locale} />
  );
}

export function InviteGuideContent({ locale }: { locale: Locale }) {
  const t = GUIDE_COPY[locale];
  const flow = GUIDE_FLOW_COPY[locale];
  const eligibility = GUIDE_ELIGIBILITY_COPY[locale];
  const missionStep = GUIDE_MISSION_STEP_COPY[locale];
  const rewardStep = GUIDE_REWARD_STEP_COPY[locale];
  const steps = [
    {
      title: t.inviteStepTitle,
      description: flow.inviteDescription,
    },
    missionStep,
    rewardStep,
  ];

  return (
    <section className="guidePage">
      <header className="guideIntro">
        <span>{t.eyebrow}</span>
        <p>{flow.description}</p>
      </header>

      <section className="guideCard stepsCard">
        <h2>{t.title}</h2>
        <ol className="steps">
          {steps.map((step, index) => (
            <li key={step.title}>
              <span className="stepNumber" aria-hidden="true">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="guideCard eligibilityCard">
        <h2>{t.eligibilityTitle}</h2>
        <Definition title={t.newTitle} description={eligibility.newDescription} icon="N" />
        <Definition title={t.returningTitle} description={eligibility.returningDescription} icon="R" />
      </section>

      <style jsx>{`
        .guidePage { width:min(100%,560px); margin:0 auto; padding-bottom:12px; }
        .guideIntro { margin:0 0 22px; }
        .guideIntro > span { color:#f8bc2e; font-size:.7rem; font-weight:950; letter-spacing:.12em; }
        .guideIntro > p { margin:8px 0 0; color:#aaa69d; font-size:.82rem; line-height:1.58; }
        .guideCard {
          padding:20px;
          border:1px solid rgba(255,205,80,.14);
          border-radius:22px;
          background:radial-gradient(circle at 90% 0,rgba(255,194,41,.1),transparent 34%),rgba(255,255,255,.03);
        }
        .guideCard + .guideCard { margin-top:18px; }
        .guideCard h2 { margin:0 0 14px; font-size:1.08rem; letter-spacing:-.025em; }
        .steps { margin:0; padding:0; list-style:none; }
        .steps li {
          padding:12px 0;
          display:flex;
          align-items:flex-start;
          gap:12px;
          border-top:1px solid rgba(255,255,255,.06);
        }
        .steps li > div { min-width:0; }
        .stepNumber {
          flex:0 0 auto;
          width:30px;
          height:30px;
          display:grid;
          place-items:center;
          border-radius:10px;
          background:rgba(255,201,61,.1);
          color:#ffc93d;
          font-size:.7rem;
          font-weight:950;
        }
        .steps strong { display:block; font-size:.86rem; }
        .steps p { margin:4px 0 0; color:#8f8b83; font-size:.75rem; line-height:1.5; overflow-wrap:anywhere; }
        @media (max-width:560px) {
          .guideIntro { margin-bottom:18px; }
          .guideCard { padding:17px; }
        }
      `}</style>
    </section>
  );
}

function Definition({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="definition">
      <span aria-hidden="true">{icon}</span>
      <div><strong>{title}</strong><p>{description}</p></div>
      <style jsx>{`
        .definition { padding:12px 0; display:flex; align-items:flex-start; gap:12px; border-top:1px solid rgba(255,255,255,.06); }
        .definition > span { flex:0 0 auto; width:30px; height:30px; display:grid; place-items:center; border-radius:10px; background:rgba(255,201,61,.1); color:#ffc93d; font-size:.7rem; font-weight:950; }
        .definition > div { min-width:0; }
        strong { display:block; font-size:.86rem; }
        p { margin:4px 0 0; color:#8f8b83; font-size:.75rem; line-height:1.5; overflow-wrap:anywhere; }
      `}</style>
    </div>
  );
}
