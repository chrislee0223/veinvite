'use client';

import {
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';

import { useRewardForecastSeed } from './RewardForecastSeedProvider';
import {
  getLocaleDirection,
  isLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import { REWARD_FORECAST_COPY } from '@/lib/i18n/rewardForecastCopy';
import { REWARD_FORECAST_MODEL_VERSION } from '@/lib/rewards/rewardForecastPolicy';
import {
  forecastSnapshotAgeMs,
  isRestorableRewardForecast,
  isRewardForecastStale,
  needsImmediateLiveForecastRefresh,
} from '@/lib/rewards/rewardForecastCacheGuards';

type RewardForecastResponse =
  | {
      generatedAt?: string;
      modelVersion?: string | null;
      status: 'pending';
      estimatedRewardWei: null;
      stale?: boolean;
    }
  | {
      generatedAt?: string;
      modelVersion?: string | null;
      status: 'ready';
      estimatedRewardWei: string;
      stale?: boolean;
    };

type PersistedRewardForecast = {
  savedAt: number;
  forecast: RewardForecastResponse;
};

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const PREVIEW_FORECAST: RewardForecastResponse = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  modelVersion: 'preview',
  status: 'ready',
  estimatedRewardWei: '147740500000000000000',
  stale: false,
};

const CLIENT_FORECAST_CACHE_MS = 15 * 60_000;
const LIVE_REFRESH_THROTTLE_MS = 60_000;
const BACKGROUND_LIVE_REFRESH_DELAY_MS = 600;
// A new forecast model always uses a new browser cache namespace.
const PERSISTED_FORECAST_STORAGE_KEY =
  `veinvite_reward_forecast_${REWARD_FORECAST_MODEL_VERSION}`;
// Existing v2.1 storage sometimes held the v2.2 model. Restore it only after
// verifying its actual model and original timestamps, not the legacy key name.
const LEGACY_FORECAST_STORAGE_KEY = 'veinvite_reward_forecast_v2_1_cohort';
const APP_READY_EVENT = 'veinvite-app-ready';
const APP_READY_IDLE_FALLBACK_MS = 900;
const REWARD_FORECAST_UPDATED_EVENT = 'veinvite-reward-forecast-updated';
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

let cachedForecast: RewardForecastResponse | null = null;
let cachedForecastAt = 0;
let lastLiveRefreshAt = 0;
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

function normalizeForecastResponse(
  value: unknown,
): RewardForecastResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const generatedAt =
    typeof record.generatedAt === 'string' &&
    !Number.isNaN(Date.parse(record.generatedAt))
      ? record.generatedAt
      : undefined;
  const modelVersion =
    typeof record.modelVersion === 'string'
      ? record.modelVersion
      : record.modelVersion === null
        ? null
        : undefined;
  const stale = record.stale === true;

  if (
    record.status === 'ready' &&
    typeof record.estimatedRewardWei === 'string' &&
    /^\d+$/.test(record.estimatedRewardWei) &&
    modelVersion === REWARD_FORECAST_MODEL_VERSION &&
    forecastSnapshotAgeMs(generatedAt, Date.now()) !== null
  ) {
    return {
      generatedAt,
      modelVersion,
      status: 'ready',
      estimatedRewardWei: record.estimatedRewardWei,
      stale: isRewardForecastStale({ generatedAt, nowMs: Date.now(), stale }),
    };
  }

  if (
    record.status === 'pending' &&
    record.estimatedRewardWei === null
  ) {
    return {
      generatedAt,
      modelVersion,
      status: 'pending',
      estimatedRewardWei: null,
      stale,
    };
  }

  return null;
}

function forecastGeneratedAtMs(
  forecast: RewardForecastResponse,
): number {
  if (!forecast.generatedAt) return 0;
  const generatedAtMs = Date.parse(forecast.generatedAt);
  return Number.isNaN(generatedAtMs) ? 0 : generatedAtMs;
}

function pickPreferredForecast(
  ...candidates: Array<RewardForecastResponse | null | undefined>
): RewardForecastResponse | null {
  let preferred: RewardForecastResponse | null = null;

  for (const candidate of candidates) {
    if (!candidate) continue;
    // A long-lived tab can keep module memory beyond the 24-hour limit.
    // Never prefer an expired ready snapshot over a valid pending/new result.
    if (
      candidate.status === 'ready' &&
      (candidate.modelVersion !== REWARD_FORECAST_MODEL_VERSION ||
        forecastSnapshotAgeMs(candidate.generatedAt, Date.now()) === null)
    ) continue;
    if (!preferred) {
      preferred = candidate;
      continue;
    }

    const candidateReady = candidate.status === 'ready';
    const preferredReady = preferred.status === 'ready';
    if (candidateReady && !preferredReady) {
      preferred = candidate;
      continue;
    }
    if (!candidateReady && preferredReady) {
      continue;
    }

    if (
      forecastGeneratedAtMs(candidate) >
      forecastGeneratedAtMs(preferred)
    ) {
      preferred = candidate;
    }
  }

  return preferred;
}

function readPersistedForecast(): RewardForecastResponse | null {
  if (typeof window === 'undefined') return null;

  try {
    const currentRaw = window.localStorage.getItem(
      PERSISTED_FORECAST_STORAGE_KEY,
    );
    const legacyRaw = currentRaw ? null : window.localStorage.getItem(
      LEGACY_FORECAST_STORAGE_KEY,
    );
    const raw = currentRaw ?? legacyRaw;
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedRewardForecast>;
    const savedAt = parsed.savedAt;
    const forecast = normalizeForecastResponse(parsed.forecast);
    const nowMs = Date.now();

    if (
      !forecast ||
      !isRestorableRewardForecast({
        savedAt,
        generatedAt: forecast.generatedAt,
        modelVersion: forecast.modelVersion,
        status: forecast.status,
        expectedModelVersion: REWARD_FORECAST_MODEL_VERSION,
        nowMs,
      })
    ) {
      window.localStorage.removeItem(
        currentRaw ? PERSISTED_FORECAST_STORAGE_KEY : LEGACY_FORECAST_STORAGE_KEY,
      );
      return null;
    }

    if (legacyRaw) {
      // Move only an already validated snapshot, preserving its original
      // savedAt and generatedAt. Migration must not re-age the estimate.
      try {
        window.localStorage.setItem(PERSISTED_FORECAST_STORAGE_KEY, raw);
        window.localStorage.removeItem(LEGACY_FORECAST_STORAGE_KEY);
      } catch {
        // A read-only browser cache is still usable for this render.
      }
    }

    return {
      ...forecast,
      stale: isRewardForecastStale({
        generatedAt: forecast.generatedAt,
        nowMs,
        stale: forecast.stale,
        savedAt: savedAt as number,
      }),
    };
  } catch {
    return null;
  }
}

function persistForecast(result: RewardForecastResponse): void {
  if (
    typeof window === 'undefined' ||
    result.status !== 'ready' ||
    result.modelVersion !== REWARD_FORECAST_MODEL_VERSION ||
    forecastSnapshotAgeMs(result.generatedAt, Date.now()) === null
  ) {
    return;
  }

  try {
    const payload: PersistedRewardForecast = {
      savedAt: Date.now(),
      forecast: result,
    };
    window.localStorage.setItem(
      PERSISTED_FORECAST_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Storage may be unavailable in hardened/private browser modes. The
    // in-memory cache and server snapshot remain authoritative fallbacks.
  }
}

function requestForecast(force = false): Promise<RewardForecastResponse> {
  const now = Date.now();

  if (
    !force &&
    cachedForecast &&
    cachedForecast.status === 'ready' &&
    !isRewardForecastStale({
      generatedAt: cachedForecast.generatedAt,
      stale: cachedForecast.stale,
      nowMs: now,
    }) &&
    now - cachedForecastAt < CLIENT_FORECAST_CACHE_MS
  ) {
    return Promise.resolve(cachedForecast);
  }

  if (inFlightForecast) return inFlightForecast;

  if (
    force &&
    cachedForecast &&
    cachedForecast.status === 'ready' &&
    forecastSnapshotAgeMs(cachedForecast.generatedAt, now) !== null &&
    now - lastLiveRefreshAt < LIVE_REFRESH_THROTTLE_MS
  ) {
    return Promise.resolve(cachedForecast);
  }

  if (force) lastLiveRefreshAt = now;

  const endpoint = force
    ? '/api/rewards/estimate?refresh=1'
    : '/api/rewards/estimate';

  inFlightForecast = fetch(
    endpoint,
    force ? { cache: 'no-store' } : undefined,
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('Reward forecast request failed.');
      }

      const result = normalizeForecastResponse(await response.json());
      if (!result) {
        throw new Error('Reward forecast response is malformed.');
      }
      return result;
    })
    .then((result) => {
      // An out-of-order response must not replace a newer known snapshot.
      const preferred = pickPreferredForecast(cachedForecast, result) ?? result;
      cachedForecast = preferred;
      if (preferred === result) {
        cachedForecastAt = Date.now();
        persistForecast(result);
      }
      window.dispatchEvent(
        new CustomEvent<RewardForecastResponse>(
          REWARD_FORECAST_UPDATED_EVENT,
          { detail: preferred },
        ),
      );
      return preferred;
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
  const serverSeed = useRewardForecastSeed();
  const resolvedLocale: SupportedLocale = isLocale(locale)
    ? locale
    : 'en';
  const [forecast, setForecast] = useState<RewardForecastResponse | null>(
    () => rewardForecastPreview
      ? PREVIEW_FORECAST
      : pickPreferredForecast(serverSeed, cachedForecast),
  );
  const [unavailable, setUnavailable] = useState(false);

  // Prefer the newest known public estimate before paint. First-time visitors
  // receive the server snapshot, while returning visitors may keep a newer
  // browser value if one exists. This avoids both a blank first-login amount
  // and a visible regression to an older cached server value.
  useIsomorphicLayoutEffect(() => {
    if (rewardForecastPreview) {
      setUnavailable(false);
      setForecast(PREVIEW_FORECAST);
      return;
    }

    const restored = readPersistedForecast();
    const preferred = pickPreferredForecast(
      serverSeed,
      cachedForecast,
      restored,
    );
    if (preferred) {
      cachedForecast = preferred;
      // Hydration restores an existing value, not a new successful network read.
      // Never renew either the network cache clock or the persisted savedAt.
      setUnavailable(false);
      setForecast(preferred);
    }
  }, [rewardForecastPreview, serverSeed]);

  useEffect(() => {
    if (rewardForecastPreview) return;

    let active = true;
    let scheduled = false;
    let started = false;
    let timeoutId = 0;
    let backgroundRefreshTimeoutId = 0;
    let intervalId = 0;
    let idleId: number | null = null;

    const applyForecast = (result: RewardForecastResponse) => {
      if (!active) return;
      setUnavailable(false);
      setForecast((current) => pickPreferredForecast(current, result) ?? result);
    };

    const syncRefreshedForecast = (event: Event) => {
      const detail = normalizeForecastResponse(
        (event as CustomEvent<unknown>).detail,
      );
      if (!detail) return;
      applyForecast(detail);
    };

    const loadForecast = async (force = false): Promise<boolean> => {
      try {
        const result = await requestForecast(force);
        applyForecast(result);
        return true;
      } catch {
        if (!active) return false;

        // A transient RPC/API failure must not blank a previously good public
        // estimate. Keep the last value visible and mark it as stale instead.
        if (
          cachedForecast?.status === 'ready' &&
          forecastSnapshotAgeMs(cachedForecast.generatedAt, Date.now()) !== null
        ) {
          const staleForecast: RewardForecastResponse = {
            ...cachedForecast,
            stale: true,
          };
          cachedForecast = staleForecast;
          setUnavailable(false);
          setForecast(staleForecast);
          return false;
        }

        cachedForecast = null;
        setForecast(null);
        setUnavailable(true);
        return false;
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void loadForecast(true);
      }
    };
    const refreshWhenFocused = () => {
      if (document.visibilityState === 'visible') {
        void loadForecast(true);
      }
    };
    const startForecastActivity = () => {
      if (!active || started) return;
      started = true;

      document.addEventListener(
        'visibilitychange',
        refreshWhenVisible,
      );
      window.addEventListener('focus', refreshWhenFocused);

      // First read the cheap server snapshot. Once that is settled, perform a
      // live funding check in the background so pool changes still propagate
      // quickly without blocking the value already shown on screen.
      void loadForecast().then((loaded) => {
        if (!active || !loaded) return;
        // Fresh snapshots need no second expensive on-chain read at startup.
        // Otherwise keep the existing background live funding verification.
        if (
          cachedForecast &&
          !needsImmediateLiveForecastRefresh({
            generatedAt: cachedForecast.generatedAt,
            status: cachedForecast.status,
            stale: cachedForecast.stale,
            nowMs: Date.now(),
          })
        ) return;
        backgroundRefreshTimeoutId = window.setTimeout(
          () => {
            void loadForecast(true);
          },
          BACKGROUND_LIVE_REFRESH_DELAY_MS,
        );
      });

      intervalId = window.setInterval(
        () => {
          void loadForecast(true);
        },
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
      window.clearTimeout(backgroundRefreshTimeoutId);
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
  const stale = ready && forecast.stale === true;
  const amount = ready
    ? `${formatRewardWei(forecast.estimatedRewardWei)} B3TR`
    : '— B3TR';
  const note = unavailable && !forecast
    ? t.unavailable
    : forecast?.status === 'pending'
      ? t.pendingDescription
      : t.disclaimer;

  return (
    <section
      className="homeRewardEstimateCard"
      aria-live="polite"
      lang={resolvedLocale}
      dir={getLocaleDirection(resolvedLocale)}
      data-home-reward-forecast="true"
      data-forecast-state={
        unavailable && !forecast
          ? 'unavailable'
          : stale
            ? 'stale'
            : ready
              ? 'ready'
              : forecast?.status ?? 'initial'
      }
    >
      <span className="estimateEyebrow">{t.eyebrow}</span>

      <div
        className="estimateAmount"
        aria-label={ready ? amount : t.pendingTitle}
      >
        <strong>{amount}</strong>
      </div>

      <p className="estimateEligibility">{t.eligibility}</p>
      <p
        className={
          unavailable || forecast?.status === 'pending' || stale
            ? 'estimateDisclaimer estimatePending'
            : 'estimateDisclaimer'
        }
      >
        {stale ? (
          <span className="staleIndicator" aria-hidden="true">◷</span>
        ) : null}
        {note}
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
        .staleIndicator {
          display:inline-block;
          margin-inline-end:4px;
          font-size:.78em;
          opacity:.78;
          vertical-align:.06em;
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
      `}</style>
    </section>
  );
}
