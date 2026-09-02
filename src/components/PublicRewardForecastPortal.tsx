'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
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

export function PublicRewardForecastPortal() {
  const [mount, setMount] = useState<HTMLDivElement | null>(null);
  const [locale, setLocale] = useState<SupportedLocale>('en');
  const [forecast, setForecast] =
    useState<RewardForecastResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    let activeMount: HTMLDivElement | null = null;
    let attachFrame: number | null = null;

    const detach = () => {
      activeMount?.remove();
      activeMount = null;
      setMount(null);
      setPreview(false);
    };

    const attach = () => {
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

      detach();
      const nextMount = document.createElement('div');
      nextMount.className = 'leaderboardRewardEstimateMount';
      impactCard.insertAdjacentElement('afterend', nextMount);
      activeMount = nextMount;
      setPreview(
        impactCard.dataset.rewardForecastPreview === 'true',
      );
      setMount(nextMount);
    };

    const scheduleAttach = () => {
      if (attachFrame !== null) return;
      attachFrame = window.requestAnimationFrame(() => {
        attachFrame = null;
        attach();
      });
    };

    attach();
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

  useEffect(() => {
    const syncFromDocument = () => {
      const next = localeFromLanguageTag(
        document.documentElement.lang,
      );
      if (next) setLocale(next);
    };
    const syncFromEvent = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isLocale(detail)) setLocale(detail);
    };

    syncFromDocument();
    window.addEventListener(
      'veinvite-language-change',
      syncFromEvent,
    );
    return () =>
      window.removeEventListener(
        'veinvite-language-change',
        syncFromEvent,
      );
  }, []);

  useEffect(() => {
    if (!mount) return;

    if (preview) {
      setUnavailable(false);
      setForecast(PREVIEW_FORECAST);
      return;
    }

    let active = true;
    let controller: AbortController | null = null;

    const loadForecast = () => {
      controller?.abort();
      controller = new AbortController();
      setUnavailable(false);

      void fetch('/api/rewards/estimate', {
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error('Reward forecast request failed.');
          }
          return (await response.json()) as RewardForecastResponse;
        })
        .then((result) => {
          if (active) setForecast(result);
        })
        .catch((error: unknown) => {
          if (
            error instanceof DOMException &&
            error.name === 'AbortError'
          ) {
            return;
          }
          if (active) setUnavailable(true);
        });
    };

    setForecast(null);
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
      controller?.abort();
    };
  }, [mount, preview]);

  if (!mount) return null;
  const t = REWARD_FORECAST_COPY[locale];

  return createPortal(
    <section
      className="publicRewardEstimateCard"
      aria-live="polite"
      lang={locale}
    >
      <div className="estimateTop">
        <span className="estimateEyebrow">{t.eyebrow}</span>
        <h2>
          {forecast?.status === 'ready'
            ? t.eligibility
            : t.pendingTitle}
        </h2>
      </div>

      {unavailable ? (
        <p className="estimatePending">{t.unavailable}</p>
      ) : forecast?.status === 'ready' ? (
        <>
          <div className="estimateAmount">
            <strong>
              {formatRewardWei(forecast.estimatedRewardWei)} B3TR
            </strong>
          </div>
          <p className="estimateDisclaimer">{t.disclaimer}</p>
        </>
      ) : (
        <p className="estimatePending">
          {t.pendingDescription}
        </p>
      )}

      <style jsx>{`
        .publicRewardEstimateCard {
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
          overflow-wrap:anywhere;
          word-break:normal;
          hyphens:auto;
        }
        h2 {
          max-width:100%;
          margin:5px 0 0;
          color:#f7f3e8;
          font-size:clamp(.92rem,4vw,1.02rem);
          line-height:1.45;
          letter-spacing:-.025em;
          overflow-wrap:break-word;
          word-break:normal;
          hyphens:auto;
          text-wrap:pretty;
        }
        .estimateAmount {
          min-width:0;
          margin-top:17px;
          padding:17px 15px;
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
        .estimateDisclaimer,.estimatePending {
          max-width:440px;
          margin:13px auto 0;
          color:#8f8a80;
          font-size:.69rem;
          line-height:1.65;
          text-align:center;
          overflow-wrap:break-word;
          word-break:normal;
          hyphens:auto;
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
            padding:16px 10px;
          }
          .estimateAmount strong {
            font-size:clamp(1.22rem,6.7vw,1.75rem);
          }
        }
        @media (max-width:340px) {
          .publicRewardEstimateCard {
            padding:13px;
          }
          .estimateAmount {
            padding:15px 8px;
          }
          .estimateAmount strong {
            font-size:1.2rem;
          }
        }
      `}</style>
    </section>,
    mount,
  );
}
