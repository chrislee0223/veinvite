'use client';

export const PRODUCT_ANALYTICS_EVENT =
  'veinvite-product-analytics-event';

export type ProductAnalyticsEventName =
  | 'wallet_connect_started'
  | 'wallet_auth_succeeded'
  | 'wallet_auth_failed'
  | 'invite_link_copied'
  | 'invite_link_shared'
  | 'invite_accept_started'
  | 'invite_accept_succeeded'
  | 'invite_accept_review'
  | 'invite_accept_failed'
  | 'mission_action_opened'
  | 'reward_claim_started'
  | 'reward_claim_succeeded'
  | 'reward_claim_failed';

export type ProductAnalyticsOutcome =
  | 'none'
  | 'success'
  | 'failure'
  | 'review'
  | 'cancelled';

export type ProductAnalyticsFailureCode =
  | 'none'
  | 'invalid_link'
  | 'slots_full'
  | 'existing_user'
  | 'self_referral'
  | 'already_referred'
  | 'already_used'
  | 'eligibility'
  | 'network'
  | 'server'
  | 'malformed_response'
  | 'wallet_auth'
  | 'unknown';

export type ProductAnalyticsMissionKey =
  | 'none'
  | 'vebetter_apps'
  | 'governance_vote';

export type ProductAnalyticsFlowKey =
  | 'none'
  | 'home'
  | 'permanent_referral'
  | 'legacy_invite';

export type ProductAnalyticsEntryClass =
  | 'none'
  | 'new_user'
  | 'returning_user';

export type ProductAnalyticsEventDetail = {
  eventName: ProductAnalyticsEventName;
  outcome?: ProductAnalyticsOutcome;
  failureCode?: ProductAnalyticsFailureCode;
  missionKey?: ProductAnalyticsMissionKey;
  flowKey?: ProductAnalyticsFlowKey;
  entryClass?: ProductAnalyticsEntryClass;
};

/**
 * Emits only a strict, non-identifying product analytics event. The mounted
 * UsageAnalyticsTracker owns anonymous visitor/session identity, preference
 * handling and transport. Nothing is sent when anonymous usage analytics is
 * disabled or on excluded admin/test routes.
 */
export function reportProductAnalyticsEvent(
  detail: ProductAnalyticsEventDetail,
): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<ProductAnalyticsEventDetail>(
      PRODUCT_ANALYTICS_EVENT,
      { detail },
    ),
  );
}
