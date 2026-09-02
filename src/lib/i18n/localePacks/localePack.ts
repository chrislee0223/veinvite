import { ENTRY_REJECTION_COPY } from '../entryRejectionCopy';
import { GUIDE_COPY } from '../guideCopy';
import { GUIDE_ELIGIBILITY_COPY } from '../guideEligibilityCopy';
import { GUIDE_FLOW_COPY } from '../guideFlowCopy';
import { GUIDE_MISSION_STEP_COPY } from '../guideMissionStepCopy';
import { GUIDE_REWARD_STEP_COPY } from '../guideRewardStepCopy';
import { HOME_COPY } from '../homeCopy';
import { INVITE_LANDING_COPY } from '../inviteLandingCopy';
import { INVITEE_COPY } from '../inviteeCopy';
import { LANGUAGE_SELECT_COPY } from '../languageSelectCopy';
import { LEADERBOARD_COPY } from '../leaderboardCopy';
import { LEGAL_CONSENT_COPY } from '../legalConsentCopy';
import { LEGAL_COPY } from '../legalCopy';
import { NAV_COPY } from '../navCopy';
import { NOTIFICATION_COPY } from '../notificationCopy';
import { REWARD_RECEIPT_COPY } from '../rewardReceiptCopy';
import { SETTINGS_COPY } from '../settingsCopy';
import { WALLET_SESSION_COPY } from '../walletSessionCopy';
import { isLocale, type SupportedLocale } from '../locales';

export type LocalePack = {
  entryRejection: typeof ENTRY_REJECTION_COPY.en;
  guide: typeof GUIDE_COPY.en;
  guideEligibility: typeof GUIDE_ELIGIBILITY_COPY.en;
  guideFlow: typeof GUIDE_FLOW_COPY.en;
  guideMissionStep: typeof GUIDE_MISSION_STEP_COPY.en;
  guideRewardStep: typeof GUIDE_REWARD_STEP_COPY.en;
  home: typeof HOME_COPY.en;
  inviteLanding: typeof INVITE_LANDING_COPY.en;
  invitee: typeof INVITEE_COPY.en;
  languageSelect: typeof LANGUAGE_SELECT_COPY.en;
  leaderboard: typeof LEADERBOARD_COPY.en;
  legalConsent: typeof LEGAL_CONSENT_COPY.en;
  legal: {
    privacy: typeof LEGAL_COPY.privacy.en;
    terms: typeof LEGAL_COPY.terms.en;
  };
  nav: typeof NAV_COPY.en;
  notification: typeof NOTIFICATION_COPY.en;
  rewardReceipt: typeof REWARD_RECEIPT_COPY.en;
  settings: typeof SETTINGS_COPY.en;
  walletSession: typeof WALLET_SESSION_COPY.en;
};

function fromTable<T>(
  table: Record<string, T>,
  locale: string,
  fallback: T,
): T {
  return table[locale] ?? fallback;
}

/**
 * Snapshot an already available locale into the typed locale-pack shape.
 *
 * This is intentionally used only for regional variants where sharing formal
 * or protocol copy is linguistically appropriate (for example Egyptian Arabic
 * legal copy based on Modern Standard Arabic). Product-facing regional copy
 * should still be explicitly overridden in the variant pack.
 */
export function snapshotLocalePack(locale: string): LocalePack {
  return {
    entryRejection: fromTable(ENTRY_REJECTION_COPY, locale, ENTRY_REJECTION_COPY.en),
    guide: fromTable(GUIDE_COPY, locale, GUIDE_COPY.en),
    guideEligibility: fromTable(
      GUIDE_ELIGIBILITY_COPY,
      locale,
      GUIDE_ELIGIBILITY_COPY.en,
    ),
    guideFlow: fromTable(GUIDE_FLOW_COPY, locale, GUIDE_FLOW_COPY.en),
    guideMissionStep: fromTable(
      GUIDE_MISSION_STEP_COPY,
      locale,
      GUIDE_MISSION_STEP_COPY.en,
    ),
    guideRewardStep: fromTable(
      GUIDE_REWARD_STEP_COPY,
      locale,
      GUIDE_REWARD_STEP_COPY.en,
    ),
    home: fromTable(HOME_COPY, locale, HOME_COPY.en),
    inviteLanding: fromTable(
      INVITE_LANDING_COPY,
      locale,
      INVITE_LANDING_COPY.en,
    ),
    invitee: fromTable(INVITEE_COPY, locale, INVITEE_COPY.en),
    languageSelect: fromTable(
      LANGUAGE_SELECT_COPY,
      locale,
      LANGUAGE_SELECT_COPY.en,
    ),
    leaderboard: fromTable(LEADERBOARD_COPY, locale, LEADERBOARD_COPY.en),
    legalConsent: fromTable(
      LEGAL_CONSENT_COPY,
      locale,
      LEGAL_CONSENT_COPY.en,
    ),
    legal: {
      privacy: fromTable(LEGAL_COPY.privacy, locale, LEGAL_COPY.privacy.en),
      terms: fromTable(LEGAL_COPY.terms, locale, LEGAL_COPY.terms.en),
    },
    nav: fromTable(NAV_COPY, locale, NAV_COPY.en),
    notification: fromTable(
      NOTIFICATION_COPY,
      locale,
      NOTIFICATION_COPY.en,
    ),
    rewardReceipt: fromTable(
      REWARD_RECEIPT_COPY,
      locale,
      REWARD_RECEIPT_COPY.en,
    ),
    settings: fromTable(SETTINGS_COPY, locale, SETTINGS_COPY.en),
    walletSession: fromTable(
      WALLET_SESSION_COPY,
      locale,
      WALLET_SESSION_COPY.en,
    ),
  };
}

export function registerLocalePack(
  locale: SupportedLocale,
  pack: LocalePack,
): void {
  if (!isLocale(locale)) {
    throw new Error(`Cannot register unsupported VeInvite locale: ${locale}`);
  }

  ENTRY_REJECTION_COPY[locale] = pack.entryRejection;
  GUIDE_COPY[locale] = pack.guide;
  GUIDE_ELIGIBILITY_COPY[locale] = pack.guideEligibility;
  GUIDE_FLOW_COPY[locale] = pack.guideFlow;
  GUIDE_MISSION_STEP_COPY[locale] = pack.guideMissionStep;
  GUIDE_REWARD_STEP_COPY[locale] = pack.guideRewardStep;
  HOME_COPY[locale] = pack.home;
  INVITE_LANDING_COPY[locale] = pack.inviteLanding;
  INVITEE_COPY[locale] = pack.invitee;
  LANGUAGE_SELECT_COPY[locale] = pack.languageSelect;
  LEADERBOARD_COPY[locale] = pack.leaderboard;
  LEGAL_CONSENT_COPY[locale] = pack.legalConsent;
  LEGAL_COPY.privacy[locale] = pack.legal.privacy;
  LEGAL_COPY.terms[locale] = pack.legal.terms;
  NAV_COPY[locale] = pack.nav;
  NOTIFICATION_COPY[locale] = pack.notification;
  REWARD_RECEIPT_COPY[locale] = pack.rewardReceipt;
  SETTINGS_COPY[locale] = pack.settings;
  WALLET_SESSION_COPY[locale] = pack.walletSession;
}
