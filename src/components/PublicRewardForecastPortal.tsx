'use client';

import { useEffect, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';

import {
  getLocaleDirection,
  isLocale,
  localeFromLanguageTag,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { REWARD_FORECAST_COPY } from '@/lib/i18n/rewardForecastCopy';

type RewardForecastResponse =
  | {
      status: 'pending';
      estimatedRewardWei: null;
    }
  | {
      status: 'ready';
      estimatedRewardWei: string;
    };

const PREVIEW_FORECAST: RewardForecastResponse = {
  status: 'ready',
  estimatedRewardWei: '147740500000000000000',
};

let cachedForecast: RewardForecastResponse | null = null;
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

function requestForecast(): Promise<RewardForecastResponse> {
  if (inFlightForecast) return inFlightForecast;

  inFlightForecast = fetch('/api/rewards/estimate')
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Reward forecast request failed.');
      }
      return (await response.json()) as RewardForecastResponse;
    })
    .then((result) => {
      cachedForecast = result;
      return result;
    })
    .finally(() => {
      inFlightForecast = null;
    });

  return inFlightForecast;
}

export function PublicRewardForecastWarmup() {
  useEffect(() => {
    if (window.location.pathname !== '/') return;

    let active = true;

    const loadForecast = () => {
      void requestForecast().catch(() => {
        if (!active) return;
      });
    };

    loadForecast();
    const intervalId = window.setInterval(
      loadForecast,
      15 * 60_000,
    );
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadForecast();
    };
    document.addEventListener(
      'visibilitychange',
      refreshWhenVisible,
    );

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener(
        'visibilitychange',
        refreshWhenVisible,
      );
    };
  }, []);

  return null;
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
    void requestForecast()
      .then((result) => {
        if (!active) return;
        setUnavailable(false);
        setForecast(result);
      })
      .catch(() => {
        if (!active) return;
        setUnavailable(true);
      });

    return () => {
      active = false;
    };
  }, [rewardForecastPreview]);

  const t = REWARD_FORECAST_COPY[resolvedLocale];
  const amount =
    forecast?.status === 'ready'
      ? `${formatRewardWei(forecast.estimatedRewardWei)} B3TR`
      : '— B3TR';
  const note = unavailable
    ? t.unavailable
    : forecast?.status === 'pending'
      ? t.pendingDescription
      : t.disclaimer;

  return (
    <section
      className="publicRewardEstimateCard"
      aria-live="polite"
      aria-busy={!forecast && !unavailable}
      lang={resolvedLocale}
      dir={getLocaleDirection(resolvedLocale)}
    >
      <div className="estimateTop">
        <span className="estimateEyebrow">{t.eyebrow}</span>
        <h2>{t.eligibility}</h2>
      </div>

      <div
        className="estimateAmount"
        aria-label={
          forecast?.status === 'ready'
            ? amount
            : t.pendingTitle
        }
      >
        <strong>{amount}</strong>
      </div>

      <p className={unavailable || forecast?.status === 'pending'
        ? 'estimateDisclaimer estimatePending'
        : 'estimateDisclaimer'}>
        {note}
      </p>

      <style jsx>{`
        .publicRewardEstimateCard {
          box-sizing:border-box;
          margin-top:18px;
          padding:18px;
          border:1px solid rgba(255,205,80,.24);
          border-radius:21px;
          background:radial-gradient(circle at 90% 10%,rgba(244,183,40,.16),transparent 38%),linear-gradient(145deg,rgba(45,33,10,.82),rgba(18,18,15,.92));
          box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
          min-width:0;
        }
        .estimateTop {
          display:block;
          min-width:0;
          max-width:100%;
        }
        .estimateEyebrow {
          display:block;
          max-width:100%;
          color:#f8bc2e;
          font-size:clamp(.58rem,2.6vw,.66rem);
          font-weight:950;
          line-height:1.45;
          letter-spacing:.08em;
          text-transform:uppercase;
          overflow-wrap:normal;
          word-break:normal;
          hyphens:none;
        }
        h2 {
          max-width:100%;
          margin:5px 0 0;
          color:#f7f3e8;
          font-size:clamp(.92rem,4vw,1.02rem);
          line-height:1.45;
          letter-spacing:-.025em;
          overflow-wrap:normal;
          word-break:normal;
          hyphens:none;
          text-wrap:pretty;
        }
        .estimateAmount {
          box-sizing:border-box;
          min-width:0;
          min-height:72px;
          margin-top:17px;
          padding:17px 15px;
          display:grid;
          place-items:center;
          border:1px solid rgba(255,205,80,.16);
          border-radius:16px;
          background:rgba(244,183,40,.07);
          text-align:center;
          direction:ltr;
          unicode-bidi:isolate;
        }
        .estimateAmount strong {
          display:block;
          max-width:100%;
          color:#ffd45f;
          font-size:clamp(1.3rem,7vw,2rem);
          line-height:1.15;
          font-variant-numeric:tabular-nums;
          letter-spacing:-.04em;
          white-space:nowrap;
        }
        .estimateDisclaimer {
          max-width:440px;
          min-height:1.65em;
          margin:13px auto 0;
          color:#8f8a80;
          font-size:.69rem;
          line-height:1.65;
          text-align:center;
          overflow-wrap:normal;
          word-break:normal;
          hyphens:none;
          text-wrap:pretty;
        }
        .estimatePending {
          color:#a49e91;
        }
        @media (max-width:420px) {
          .publicRewardEstimateCard {
            padding:15px;
            border-radius:19px;
          }
          .estimateAmount {
            min-height:68px;
            padding:16px 10px;
          }
          .estimateAmount strong {
            font-size:clamp(1.22rem,6.7vw,1.75rem);
          }
        }
        @media (max-width:340px) {
          .publicRewardEstimateCard {
            padding:14px 12px;
          }
          .estimateEyebrow {
            font-size:.56rem;
            letter-spacing:.055em;
          }
          h2 {
            font-size:.9rem;
          }
          .estimateAmount {
            min-height:64px;
            padding:15px 8px;
          }
          .estimateAmount strong {
            font-size:clamp(1.12rem,6.4vw,1.55rem);
          }
          .estimateDisclaimer {
            font-size:.66rem;
          }
        }
      `}</style>
    </section>
  );
}

type ForecastPortalTarget = {
  mount: HTMLDivElement;
  rewardForecastPreview: boolean;
};

export function PublicRewardForecastPortal() {
  const [target, setTarget] = useState<ForecastPortalTarget | null>(null);
  const [locale, setLocale] = useState<SupportedLocale>('en');

  useEffect(() => {
    const syncFromDocument = () => {
      const next = localeFromLanguageTag(document.documentElement.lang);
      if (next) setLocale(next);
    };
    const syncFromEvent = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isLocale(detail)) setLocale(detail);
    };

    syncFromDocument();
    window.addEventListener('veinvite-language-change', syncFromEvent);
    return () =>
      window.removeEventListener('veinvite-language-change', syncFromEvent);
  }, []);

  useEffect(() => {
    let activeMount: HTMLDivElement | null = null;
    let attachFrame: number | null = null;

    const commitTarget = (
      nextTarget: ForecastPortalTarget | null,
      synchronous: boolean,
    ) => {
      if (synchronous) {
        flushSync(() => setTarget(nextTarget));
      } else {
        setTarget(nextTarget);
      }
    };

    const detach = () => {
      activeMount?.remove();
      activeMount = null;
      setTarget(null);
    };

    const attach = (synchronous = false) => {
      const impactCard = document.querySelector<HTMLElement>(
        '.leaderboardPage .impactCard',
      );
      if (!impactCard) {
        if (activeMount) detach();
        return;
      }
      if (
        activeMount?.isConnected &&
        activeMount.previousElementSibling === impactCard
      ) {
        return;
      }

      if (activeMount) {
        activeMount.remove();
      }
      const nextMount = document.createElement('div');
      nextMount.className = 'leaderboardRewardEstimateMount';
      impactCard.insertAdjacentElement('afterend', nextMount);
      activeMount = nextMount;
      commitTarget(
        {
          mount: nextMount,
          rewardForecastPreview:
            impactCard.dataset.rewardForecastPreview === 'true',
        },
        synchronous,
      );
    };

    const scheduleAttach = () => {
      attach(true);
      if (attachFrame !== null) return;
      attachFrame = window.requestAnimationFrame(() => {
        attachFrame = null;
      });
    };

    attach(false);
    const observer = new MutationObserver(scheduleAttach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (attachFrame !== null) {
        window.cancelAnimationFrame(attachFrame);
      }
      detach();
    };
  }, []);

  return (
    <>
      <PublicRewardForecastWarmup />
      {target
        ? createPortal(
            <PublicRewardForecastCard
              locale={locale}
              rewardForecastPreview={target.rewardForecastPreview}
            />,
            target.mount,
          )
        : null}
    </>
  );
}
