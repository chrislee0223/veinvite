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

const PREVIEW_FORECAST: RewardForecastResponse = {
  status: 'ready',
  estimatedRewardWei: '147740500000000000000',
  stale: false,
};

const CLIENT_FORECAST_CACHE_MS = 15 * 60_000;
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

    window.addEventListener(
      REWARD_FORECAST_UPDATED_EVENT,
      syncRefreshedForecast,
    );
    document.addEventListener(
      'visibilitychange',
      refreshWhenVisible,
    );
    window.addEventListener('focus', refreshWhenFocused);

    loadForecast();
    const intervalId = window.setInterval(
      loadForecast,
      CLIENT_FORECAST_CACHE_MS,
    );

    return () => {
      active = false;
      window.clearInterval(intervalId);
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
        .homeRewardEstimateCard {
          position:relative;
          z-index:1;
          min-width:0;
          min-height:142px;
          box-sizing:border-box;
          margin-top:17px;
          padding:14px 15px;
          border:1px solid rgba(255,205,80,.22);
          border-radius:18px;
          background:radial-gradient(circle at 92% 8%,rgba(244,183,40,.13),transparent 40%),rgba(244,183,40,.052);
          box-shadow:inset 0 1px 0 rgba(255,255,255,.035);
        }
        .estimateEyebrow {
          display:block;
          max-width:100%;
          color:#f8bc2e;
          font-size:clamp(.57rem,2.5vw,.64rem);
          font-weight:950;
          line-height:1.4;
          letter-spacing:.075em;
          text-transform:uppercase;
          overflow-wrap:normal;
          word-break:normal;
          hyphens:none;
        }
        .estimateAmount {
          min-width:0;
          min-height:35px;
          margin-top:6px;
          display:flex;
          align-items:center;
          direction:ltr;
          unicode-bidi:isolate;
        }
        .estimateAmount strong {
          display:block;
          max-width:100%;
          color:#ffd45f;
          font-size:clamp(1.34rem,6.5vw,1.72rem);
          line-height:1.12;
          font-variant-numeric:tabular-nums;
          letter-spacing:-.04em;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        .estimateEligibility {
          margin:7px 0 0;
          color:#d5d0c5;
          font-size:.71rem;
          font-weight:760;
          line-height:1.48;
          overflow-wrap:normal;
          word-break:normal;
          hyphens:none;
          text-wrap:pretty;
        }
        .estimateDisclaimer {
          min-height:1.55em;
          margin:5px 0 0;
          color:#8f8a80;
          font-size:.65rem;
          line-height:1.55;
          overflow-wrap:normal;
          word-break:normal;
          hyphens:none;
          text-wrap:pretty;
        }
        .estimatePending {
          color:#a49e91;
        }
        .amountSkeleton,
        .noteSkeleton {
          display:block;
          border-radius:999px;
          background:rgba(255,255,255,.085);
          animation:forecastSkeletonPulse 1.5s ease-in-out infinite;
        }
        .amountSkeleton {
          width:min(58%,190px);
          height:24px;
        }
        .noteSkeleton {
          width:min(82%,320px);
          height:8px;
          margin-top:5px;
        }
        @keyframes forecastSkeletonPulse {
          0%,100% { opacity:.48; }
          50% { opacity:.92; }
        }
        @media (max-width:420px) {
          .homeRewardEstimateCard {
            min-height:138px;
            padding:13px 14px;
            border-radius:17px;
          }
          .estimateAmount strong {
            font-size:clamp(1.27rem,6.3vw,1.58rem);
          }
        }
        @media (max-width:340px) {
          .homeRewardEstimateCard {
            padding:12px;
          }
          .estimateEyebrow {
            font-size:.55rem;
            letter-spacing:.05em;
          }
          .estimateEligibility {
            font-size:.68rem;
          }
          .estimateDisclaimer {
            font-size:.63rem;
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
