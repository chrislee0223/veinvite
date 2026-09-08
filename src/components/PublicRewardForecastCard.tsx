'use client';

import { useEffect, useState } from 'react';

import {
  getLocaleDirection,
  isLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { REWARD_FORECAST_COPY } from '@/lib/i18n/rewardForecastCopy';

type RewardForecastResponse =
  | {
      status: 'pending';
      estimatedRewardWei: null;
      stale?: boolean;
    }
  | {
      status: 'ready';
      estimatedRewardWei: string;
      stale?: boolean;
    };

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const PREVIEW_FORECAST: RewardForecastResponse = {
  status: 'ready',
  estimatedRewardWei: '147740500000000000000',
  stale: false,
};

const CLIENT_FORECAST_CACHE_MS = 15 * 60_000;
const APP_READY_EVENT = 'veinvite-app-ready';
const APP_READY_IDLE_FALLBACK_MS = 900;
const REWARD_FORECAST_UPDATED_EVENT = 'veinvite-reward-forecast-updated';
let cachedForecast: RewardForecastResponse | null = null;
let cachedForecastAt = 0;
let inFlightForecast: Promise<RewardForecastResponse> | null = null;

function formatRewardWei(value: string): string {
  if (!/^\d+$/.test(value)) return '0.00';

  const wei = BigInt(value);
  const hundredthWei = 10n ** 16n;
  const roundedHundredths =
    (wei + hundredthWei / 2n) / hundredthWei;
  const whole = (roundedHundredths / 100n).toString();
  const fraction = (roundedHundredths % 100n)
    .toString()
    .padStart(2, '0');
  const groupedWhole = whole.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ',',
  );

  return `${groupedWhole}.${fraction}`;
}

function requestForecast(force = false): Promise<RewardForecastResponse> {
  if (
    !force &&
    cachedForecast &&
    Date.now() - cachedForecastAt < CLIENT_FORECAST_CACHE_MS
  ) {
    return Promise.resolve(cachedForecast);
  }

  if (inFlightForecast) return inFlightForecast;

  const endpoint = force
    ? `/api/rewards/estimate?refresh=${Date.now()}`
    : '/api/rewards/estimate';

  inFlightForecast = fetch(
    endpoint,
    force ? { cache: 'no-store' } : undefined,
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Reward forecast request failed.');
      }
      return (await response.json()) as RewardForecastResponse;
    })
    .then((result) => {
      cachedForecast = result;
      cachedForecastAt = Date.now();
      window.dispatchEvent(
        new CustomEvent<RewardForecastResponse>(
          REWARD_FORECAST_UPDATED_EVENT,
          { detail: result },
        ),
      );
      return result;
    })
    .finally(() => {
      inFlightForecast = null;
    });

  return inFlightForecast;
}

export function PublicRewardForecastCard({
  locale,
  rewardForecastPreview = false,
}: {
  locale: SupportedLocale;
  rewardForecastPreview?: boolean;
}) {
  const resolvedLocale: SupportedLocale = isLocale(locale)
    ? locale
    : 'en';
  const [forecast, setForecast] = useState<RewardForecastResponse | null>(
    () => rewardForecastPreview ? PREVIEW_FORECAST : cachedForecast,
  );
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (rewardForecastPreview) {
      setUnavailable(false);
      setForecast(PREVIEW_FORECAST);
      return;
    }

    if (cachedForecast) {
      setForecast(cachedForecast);
    }

    let active = true;
    let scheduled = false;
    let started = false;
    let timeoutId = 0;
    let intervalId = 0;
    let idleId: number | null = null;

    const syncRefreshedForecast = (event: Event) => {
      if (!active) return;
      const detail = (event as CustomEvent<RewardForecastResponse>).detail;
      if (!detail) return;
      setUnavailable(false);
      setForecast(detail);
    };
    const loadForecast = (force = false) => {
      void requestForecast(force)
        .then((result) => {
          if (!active) return;
          setUnavailable(false);
          setForecast(result);
        })
        .catch(() => {
          if (!active) return;
          setUnavailable(true);
        });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        loadForecast(true);
      }
    };
    const refreshWhenFocused = () => {
      loadForecast(true);
    };
    const startForecastActivity = () => {
      if (!active || started) return;
      started = true;

      document.addEventListener(
        'visibilitychange',
        refreshWhenVisible,
      );
      window.addEventListener('focus', refreshWhenFocused);
      loadForecast();
      intervalId = window.setInterval(
        loadForecast,
        CLIENT_FORECAST_CACHE_MS,
      );
    };
    const scheduleForecastActivity = () => {
      if (!active || scheduled) return;
      scheduled = true;

      const idleWindow = window as IdleWindow;
      if (idleWindow.requestIdleCallback) {
        idleId = idleWindow.requestIdleCallback(
          startForecastActivity,
          { timeout: APP_READY_IDLE_FALLBACK_MS },
        );
        return;
      }

      timeoutId = window.setTimeout(
        startForecastActivity,
        APP_READY_IDLE_FALLBACK_MS,
      );
    };

    window.addEventListener(
      REWARD_FORECAST_UPDATED_EVENT,
      syncRefreshedForecast,
    );

    if (
      document.documentElement.dataset.veinviteAppReady === 'true'
    ) {
      scheduleForecastActivity();
    } else {
      window.addEventListener(
        APP_READY_EVENT,
        scheduleForecastActivity,
        { once: true },
      );
    }

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      const idleWindow = window as IdleWindow;
      if (idleId !== null && idleWindow.cancelIdleCallback) {
        idleWindow.cancelIdleCallback(idleId);
      }
      window.removeEventListener(
        APP_READY_EVENT,
        scheduleForecastActivity,
      );
      window.removeEventListener(
        REWARD_FORECAST_UPDATED_EVENT,
        syncRefreshedForecast,
      );
      document.removeEventListener(
        'visibilitychange',
        refreshWhenVisible,
      );
      window.removeEventListener('focus', refreshWhenFocused);
    };
  }, [rewardForecastPreview]);

  const t = REWARD_FORECAST_COPY[resolvedLocale];
  const ready = forecast?.status === 'ready';
  const amount = ready
    ? `${formatRewardWei(forecast.estimatedRewardWei)} B3TR`
    : '— B3TR';
  const note = unavailable
    ? t.unavailable
    : forecast?.status === 'pending'
      ? t.pendingDescription
      : t.disclaimer;
  const loading = !forecast && !unavailable;

  return (
    <section
      className="homeRewardEstimateCard"
      aria-live="polite"
      aria-busy={loading}
      lang={resolvedLocale}
      dir={getLocaleDirection(resolvedLocale)}
      data-home-reward-forecast="true"
    >
      <div className="estimateSummaryRow">
        <span className="estimateEyebrow">{t.eyebrow}</span>
        <div
          className="estimateAmount"
          aria-label={ready ? amount : t.pendingTitle}
        >
          {loading ? (
            <span className="amountSkeleton" aria-hidden="true" />
          ) : (
            <strong>{amount}</strong>
          )}
        </div>
      </div>

      <p className="estimateEligibility">{t.eligibility}</p>
      <p
        className={
          unavailable || forecast?.status === 'pending'
            ? 'estimateDisclaimer estimatePending'
            : 'estimateDisclaimer'
        }
      >
        {loading ? (
          <span className="noteSkeleton" aria-hidden="true" />
        ) : (
          note
        )}
      </p>

      <style jsx>{`
        :global(.missionCard) {
          display:flex;
          flex-direction:column;
        }
        :global(.missionCard > .missionCopy) {
          order:0;
        }
        :global(.missionCard > .primaryAction),
        :global(.missionCard > .permanentLinkCard),
        :global(.missionCard > .linkErrorCard) {
          order:1;
        }
        :global(.missionCard > .slotsBlock) {
          order:3;
        }
        :global(.missionCard > .rewardsPanel) {
          order:4;
        }
        .homeRewardEstimateCard {
          position:relative;
          z-index:1;
          order:2;
          min-width:0;
          min-height:142px;
          min-height:104px;
          box-sizing:border-box;
          margin-top:12px;
          padding:12px 14px 11px;
          border:1px solid rgba(255,205,80,.18);
          border-radius:16px;
          background:linear-gradient(145deg,rgba(244,183,40,.065),rgba(244,183,40,.028));
          box-shadow:inset 0 1px 0 rgba(255,255,255,.025);
        }
        .estimateSummaryRow {
          min-width:0;
          display:flex;
          align-items:baseline;
          justify-content:space-between;
          gap:7px 12px;
          flex-wrap:wrap;
        }
        .estimateEyebrow {
          min-width:0;
          color:#f2b82b;
          font-size:clamp(.56rem,2.35vw,.62rem);
          font-weight:950;
          line-height:1.4;
          letter-spacing:.065em;
          text-transform:uppercase;
          overflow-wrap:normal;
          word-break:normal;
          hyphens:none;
        }
        .estimateAmount {
          min-width:0;
          min-height:27px;
          display:flex;
          align-items:center;
          margin-inline-start:auto;
          direction:ltr;
          unicode-bidi:isolate;
        }
        .estimateAmount strong {
          display:block;
          max-width:100%;
          color:#ffd45f;
          font-size:clamp(1.08rem,5.3vw,1.34rem);
          line-height:1.08;
          font-variant-numeric:tabular-nums;
          letter-spacing:-.035em;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .estimateEligibility {
          margin:7px 0 0;
          color:#cbc6bb;
          font-size:.68rem;
          font-weight:740;
          line-height:1.45;
          overflow-wrap:normal;
          word-break:normal;
          hyphens:none;
          text-wrap:pretty;
        }
        .estimateDisclaimer {
          min-height:1.45em;
          margin:3px 0 0;
          color:#817c73;
          font-size:.61rem;
          line-height:1.48;
          overflow-wrap:normal;
          word-break:normal;
          hyphens:none;
          text-wrap:pretty;
        }
        .estimatePending {
          color:#999286;
        }
        .amountSkeleton,
        .noteSkeleton {
          display:block;
          border-radius:999px;
          background:rgba(255,255,255,.085);
          animation:forecastSkeletonPulse 1.5s ease-in-out infinite;
        }
        .amountSkeleton {
          width:116px;
          max-width:38vw;
          height:18px;
        }
        .noteSkeleton {
          width:min(72%,260px);
          height:7px;
          margin-top:4px;
        }
        @keyframes forecastSkeletonPulse {
          0%,100% { opacity:.48; }
          50% { opacity:.92; }
        }
        @media (max-width:420px) {
          .homeRewardEstimateCard {
            min-height:102px;
            padding:11px 12px 10px;
            border-radius:15px;
          }
          .estimateAmount strong {
            font-size:clamp(1.04rem,5.4vw,1.26rem);
          }
        }
        @media (max-width:340px) {
          .homeRewardEstimateCard {
            padding:10px 11px;
          }
          .estimateEyebrow {
            font-size:.54rem;
            letter-spacing:.045em;
          }
          .estimateEligibility {
            font-size:.65rem;
          }
          .estimateDisclaimer {
            font-size:.59rem;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .amountSkeleton,
          .noteSkeleton {
            animation:none;
          }
        }
      `}</style>
    </section>
  );
}
