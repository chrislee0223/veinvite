'use client';

export const USAGE_ANALYTICS_PREFERENCE_EVENT =
  'veinvite-usage-analytics-preference-change';

export const USAGE_ANALYTICS_ENABLED_STORAGE_KEY =
  'veinvite.analytics.enabled.v1';
export const USAGE_ANALYTICS_DAILY_VISITOR_STORAGE_KEY =
  'veinvite.analytics.daily-visitor.v2';
export const USAGE_ANALYTICS_SEEN_STORAGE_KEY =
  'veinvite.analytics.seen-before.v1';
export const USAGE_ANALYTICS_SESSION_STORAGE_KEY =
  'veinvite.analytics.session.v3';

export function readUsageAnalyticsEnabled(): boolean {
  try {
    return (
      window.localStorage.getItem(
        USAGE_ANALYTICS_ENABLED_STORAGE_KEY,
      ) !== '0'
    );
  } catch {
    return true;
  }
}

export function setUsageAnalyticsEnabled(
  enabled: boolean,
): void {
  try {
    window.localStorage.setItem(
      USAGE_ANALYTICS_ENABLED_STORAGE_KEY,
      enabled ? '1' : '0',
    );

    if (!enabled) {
      window.localStorage.removeItem(
        USAGE_ANALYTICS_DAILY_VISITOR_STORAGE_KEY,
      );
      window.localStorage.removeItem(
        USAGE_ANALYTICS_SEEN_STORAGE_KEY,
      );
      window.sessionStorage.removeItem(
        USAGE_ANALYTICS_SESSION_STORAGE_KEY,
      );
    }
  } catch {
    // Preference writes must never interfere with VeInvite usage.
  }

  window.dispatchEvent(
    new CustomEvent(
      USAGE_ANALYTICS_PREFERENCE_EVENT,
      { detail: enabled },
    ),
  );
}
