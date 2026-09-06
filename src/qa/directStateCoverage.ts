import type { PermanentReferralQaState } from '@/components/PermanentReferralClient';
import type { WalletSessionQaState } from '@/components/WalletSessionGate';
import type { LegalConsentQaState } from '@/components/LegalConsentGate';
import type { QaHomeStateId } from './QaHomeStateHarness';
import type { QaHomeFeedbackStateId } from './QaHomeFeedbackHarness';
import type { QaNotificationStateId } from './QaNotificationStateHarness';
import type { QaSettingsStateId } from './QaSettingsStateHarness';
import type { QaLeaderboardStateId } from './QaLeaderboardStateHarness';
import type { QaInviteLandingStateId } from './QaInviteLandingStateHarness';
import type { QaLegacyInviteStateId } from './QaLegacyInviteStateHarness';
import {
  QA_KNOWN_STATES,
  type QaKnownState,
  type QaStateCoverage,
} from './stateRegistry';

type QaDirectStateRendererBase = {
  stateId: string;
  defaultLocale: 'ko' | 'en';
};

export type QaDirectStateRenderer =
  | (QaDirectStateRendererBase & {
      renderer: 'permanent-referral';
      permanentReferralState: PermanentReferralQaState;
    })
  | (QaDirectStateRendererBase & {
      renderer: 'invite-landing';
      inviteLandingStateId: QaInviteLandingStateId;
    })
  | (QaDirectStateRendererBase & {
      renderer: 'legacy-invite';
      legacyInviteStateId: QaLegacyInviteStateId;
    })
  | (QaDirectStateRendererBase & {
      renderer: 'wallet-session';
      walletSessionState: WalletSessionQaState;
    })
  | (QaDirectStateRendererBase & {
      renderer: 'legal-consent';
      legalConsentState: LegalConsentQaState;
    })
  | (QaDirectStateRendererBase & {
      renderer: 'home';
      homeStateId: QaHomeStateId;
    })
  | (QaDirectStateRendererBase & {
      renderer: 'home-feedback';
      homeFeedbackStateId: QaHomeFeedbackStateId;
    })
  | (QaDirectStateRendererBase & {
      renderer: 'notification';
      notificationStateId: QaNotificationStateId;
    })
  | (QaDirectStateRendererBase & {
      renderer: 'settings';
      settingsStateId: QaSettingsStateId;
    })
  | (QaDirectStateRendererBase & {
      renderer: 'leaderboard';
      leaderboardStateId: QaLeaderboardStateId;
    });

export const QA_DIRECT_STATE_RENDERERS: QaDirectStateRenderer[] = [
  { stateId: 'PRI-BOOT-BRAND', renderer: 'permanent-referral', permanentReferralState: 'boot', defaultLocale: 'ko' },
  { stateId: 'PRI-LANGUAGE-SETUP', renderer: 'permanent-referral', permanentReferralState: 'language-setup', defaultLocale: 'ko' },
  { stateId: 'PRI-LINK-CHECKING', renderer: 'permanent-referral', permanentReferralState: 'link-checking', defaultLocale: 'ko' },
  { stateId: 'PRI-LANDING', renderer: 'permanent-referral', permanentReferralState: 'landing', defaultLocale: 'ko' },
  { stateId: 'PRI-LANDING-DISABLED', renderer: 'invite-landing', inviteLandingStateId: 'PRI-LANDING-DISABLED', defaultLocale: 'ko' },
  { stateId: 'PRI-WALLET-REQUIRED', renderer: 'permanent-referral', permanentReferralState: 'wallet-required', defaultLocale: 'ko' },
  { stateId: 'PRI-WALLET-CONNECTED', renderer: 'permanent-referral', permanentReferralState: 'wallet-connected', defaultLocale: 'ko' },
  { stateId: 'PRI-ELIGIBILITY-CHECKING', renderer: 'permanent-referral', permanentReferralState: 'eligibility-checking', defaultLocale: 'ko' },
  { stateId: 'PRI-SUCCESS-NEW', renderer: 'permanent-referral', permanentReferralState: 'success-new', defaultLocale: 'ko' },
  { stateId: 'PRI-SUCCESS-RETURNING', renderer: 'permanent-referral', permanentReferralState: 'success-returning', defaultLocale: 'ko' },
  { stateId: 'PRI-ERROR-INVALID', renderer: 'permanent-referral', permanentReferralState: 'error-invalid', defaultLocale: 'ko' },
  { stateId: 'PRI-ERROR-SLOTS-FULL', renderer: 'permanent-referral', permanentReferralState: 'error-slots-full', defaultLocale: 'ko' },
  { stateId: 'PRI-ERROR-EXISTING', renderer: 'permanent-referral', permanentReferralState: 'error-existing', defaultLocale: 'ko' },
  { stateId: 'PRI-ERROR-SELF', renderer: 'permanent-referral', permanentReferralState: 'error-self', defaultLocale: 'ko' },
  { stateId: 'PRI-ERROR-ALREADY-REFERRED', renderer: 'permanent-referral', permanentReferralState: 'error-already-referred', defaultLocale: 'ko' },
  { stateId: 'PRI-ERROR-ELIGIBILITY', renderer: 'permanent-referral', permanentReferralState: 'error-eligibility', defaultLocale: 'ko' },

  { stateId: 'LEG-LANGUAGE-SETUP', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-LANGUAGE-SETUP', defaultLocale: 'ko' },
  { stateId: 'LEG-LANDING', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-LANDING', defaultLocale: 'ko' },
  { stateId: 'LEG-WALLET-REQUIRED', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-WALLET-REQUIRED', defaultLocale: 'ko' },
  { stateId: 'LEG-ELIGIBILITY-CHECKING', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-ELIGIBILITY-CHECKING', defaultLocale: 'ko' },
  { stateId: 'LEG-UNDER-REVIEW', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-UNDER-REVIEW', defaultLocale: 'ko' },
  { stateId: 'LEG-SUCCESS-NEW', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-SUCCESS-NEW', defaultLocale: 'ko' },
  { stateId: 'LEG-SUCCESS-RETURNING', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-SUCCESS-RETURNING', defaultLocale: 'ko' },
  { stateId: 'LEG-MISSION-0-3', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-MISSION-0-3', defaultLocale: 'ko' },
  { stateId: 'LEG-MISSION-1-3', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-MISSION-1-3', defaultLocale: 'ko' },
  { stateId: 'LEG-MISSION-2-3', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-MISSION-2-3', defaultLocale: 'ko' },
  { stateId: 'LEG-MISSION-3-3', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-MISSION-3-3', defaultLocale: 'ko' },
  { stateId: 'LEG-VOT3-LOCKED', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-VOT3-LOCKED', defaultLocale: 'ko' },
  { stateId: 'LEG-VOT3-READY', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-VOT3-READY', defaultLocale: 'ko' },
  { stateId: 'LEG-VOT3-DONE', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-VOT3-DONE', defaultLocale: 'ko' },
  { stateId: 'LEG-VOTE-LOCKED', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-VOTE-LOCKED', defaultLocale: 'ko' },
  { stateId: 'LEG-VOTE-READY', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-VOTE-READY', defaultLocale: 'ko' },
  { stateId: 'LEG-ALL-MISSIONS-DONE', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-ALL-MISSIONS-DONE', defaultLocale: 'ko' },
  { stateId: 'LEG-COMPLETED-INCOMPLETE', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-COMPLETED-INCOMPLETE', defaultLocale: 'ko' },
  { stateId: 'LEG-ERROR-INVALID', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-ERROR-INVALID', defaultLocale: 'ko' },
  { stateId: 'LEG-ERROR-USED', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-ERROR-USED', defaultLocale: 'ko' },
  { stateId: 'LEG-ERROR-EXISTING', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-ERROR-EXISTING', defaultLocale: 'ko' },
  { stateId: 'LEG-ERROR-SELF', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-ERROR-SELF', defaultLocale: 'ko' },
  { stateId: 'LEG-ERROR-ALREADY-REFERRED', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-ERROR-ALREADY-REFERRED', defaultLocale: 'ko' },
  { stateId: 'LEG-ERROR-ELIGIBILITY', renderer: 'legacy-invite', legacyInviteStateId: 'LEG-ERROR-ELIGIBILITY', defaultLocale: 'ko' },

  { stateId: 'SESSION-IDLE-BRAND', renderer: 'wallet-session', walletSessionState: 'idle-brand', defaultLocale: 'ko' },
  { stateId: 'SESSION-CHECKING-DELAY', renderer: 'wallet-session', walletSessionState: 'checking-delay', defaultLocale: 'ko' },
  { stateId: 'SESSION-CHECKING', renderer: 'wallet-session', walletSessionState: 'checking', defaultLocale: 'ko' },
  { stateId: 'SESSION-ERROR', renderer: 'wallet-session', walletSessionState: 'error', defaultLocale: 'ko' },
  { stateId: 'SESSION-WALLET-MISMATCH', renderer: 'wallet-session', walletSessionState: 'wallet-mismatch', defaultLocale: 'ko' },
  { stateId: 'SESSION-DISCONNECTING', renderer: 'wallet-session', walletSessionState: 'disconnecting', defaultLocale: 'ko' },

  { stateId: 'LEGAL-CHECKING', renderer: 'legal-consent', legalConsentState: 'checking', defaultLocale: 'ko' },
  { stateId: 'LEGAL-REQUIRED', renderer: 'legal-consent', legalConsentState: 'required', defaultLocale: 'ko' },
  { stateId: 'LEGAL-ACCEPTING', renderer: 'legal-consent', legalConsentState: 'accepting', defaultLocale: 'ko' },
  { stateId: 'LEGAL-ERROR', renderer: 'legal-consent', legalConsentState: 'error', defaultLocale: 'ko' },

  { stateId: 'HOME-NO-WALLET', renderer: 'home', homeStateId: 'HOME-NO-WALLET', defaultLocale: 'ko' },
  { stateId: 'HOME-WALLET-MODAL-PENDING', renderer: 'home', homeStateId: 'HOME-WALLET-MODAL-PENDING', defaultLocale: 'ko' },
  { stateId: 'HOME-STARTUP-LOADING', renderer: 'home', homeStateId: 'HOME-STARTUP-LOADING', defaultLocale: 'ko' },
  { stateId: 'HOME-LINK-SKELETON', renderer: 'home', homeStateId: 'HOME-LINK-SKELETON', defaultLocale: 'ko' },
  { stateId: 'HOME-LINK-ERROR', renderer: 'home', homeStateId: 'HOME-LINK-ERROR', defaultLocale: 'ko' },
  { stateId: 'HOME-SLOTS-SKELETON', renderer: 'home', homeStateId: 'HOME-SLOTS-SKELETON', defaultLocale: 'ko' },
  { stateId: 'HOME-SLOTS-EMPTY', renderer: 'home', homeStateId: 'HOME-SLOTS-EMPTY', defaultLocale: 'ko' },
  { stateId: 'HOME-SLOT-PENDING', renderer: 'home', homeStateId: 'HOME-SLOT-PENDING', defaultLocale: 'ko' },
  { stateId: 'HOME-SLOT-ACTIVATING', renderer: 'home', homeStateId: 'HOME-SLOT-ACTIVATING', defaultLocale: 'ko' },
  { stateId: 'HOME-SLOT-REVIEW', renderer: 'home', homeStateId: 'HOME-SLOT-REVIEW', defaultLocale: 'ko' },
  { stateId: 'HOME-SLOT-COMPLETED', renderer: 'home', homeStateId: 'HOME-SLOT-COMPLETED', defaultLocale: 'ko' },
  { stateId: 'HOME-SLOTS-FULL', renderer: 'home', homeStateId: 'HOME-SLOTS-FULL', defaultLocale: 'ko' },
  { stateId: 'HOME-CANCEL-CONFIRM', renderer: 'home', homeStateId: 'HOME-CANCEL-CONFIRM', defaultLocale: 'ko' },
  { stateId: 'HOME-COPY-SUCCESS', renderer: 'home-feedback', homeFeedbackStateId: 'HOME-COPY-SUCCESS', defaultLocale: 'ko' },
  { stateId: 'HOME-COPY-ERROR', renderer: 'home-feedback', homeFeedbackStateId: 'HOME-COPY-ERROR', defaultLocale: 'ko' },
  { stateId: 'HOME-LOAD-ERROR', renderer: 'home-feedback', homeFeedbackStateId: 'HOME-LOAD-ERROR', defaultLocale: 'ko' },
  { stateId: 'REWARD-AWAITING-CLAIM', renderer: 'home', homeStateId: 'REWARD-AWAITING-CLAIM', defaultLocale: 'ko' },
  { stateId: 'REWARD-CLAIM-PENDING', renderer: 'home', homeStateId: 'REWARD-CLAIM-PENDING', defaultLocale: 'ko' },
  { stateId: 'REWARD-CLAIM-QUEUED', renderer: 'home', homeStateId: 'REWARD-CLAIM-QUEUED', defaultLocale: 'ko' },
  { stateId: 'REWARD-CLAIM-ERROR', renderer: 'home-feedback', homeFeedbackStateId: 'REWARD-CLAIM-ERROR', defaultLocale: 'ko' },

  { stateId: 'NOTI-BELL-EMPTY', renderer: 'notification', notificationStateId: 'NOTI-BELL-EMPTY', defaultLocale: 'ko' },
  { stateId: 'NOTI-BELL-UNREAD', renderer: 'notification', notificationStateId: 'NOTI-BELL-UNREAD', defaultLocale: 'ko' },
  { stateId: 'NOTI-HISTORY-OPEN', renderer: 'notification', notificationStateId: 'NOTI-HISTORY-OPEN', defaultLocale: 'ko' },
  { stateId: 'NOTI-HISTORY-LOADING', renderer: 'notification', notificationStateId: 'NOTI-HISTORY-LOADING', defaultLocale: 'ko' },
  { stateId: 'NOTI-HISTORY-ERROR', renderer: 'notification', notificationStateId: 'NOTI-HISTORY-ERROR', defaultLocale: 'ko' },
  { stateId: 'NOTI-HISTORY-READ', renderer: 'notification', notificationStateId: 'NOTI-HISTORY-READ', defaultLocale: 'ko' },
  { stateId: 'NOTI-HISTORY-UNREAD', renderer: 'notification', notificationStateId: 'NOTI-HISTORY-UNREAD', defaultLocale: 'ko' },
  { stateId: 'NOTI-HISTORY-MORE', renderer: 'notification', notificationStateId: 'NOTI-HISTORY-MORE', defaultLocale: 'ko' },
  { stateId: 'NOTI-INVITE-ACCEPTED', renderer: 'notification', notificationStateId: 'NOTI-INVITE-ACCEPTED', defaultLocale: 'ko' },
  { stateId: 'NOTI-DAPP-1', renderer: 'notification', notificationStateId: 'NOTI-DAPP-1', defaultLocale: 'ko' },
  { stateId: 'NOTI-DAPP-2', renderer: 'notification', notificationStateId: 'NOTI-DAPP-2', defaultLocale: 'ko' },
  { stateId: 'NOTI-DAPP-3', renderer: 'notification', notificationStateId: 'NOTI-DAPP-3', defaultLocale: 'ko' },
  { stateId: 'NOTI-VOT3', renderer: 'notification', notificationStateId: 'NOTI-VOT3', defaultLocale: 'ko' },
  { stateId: 'NOTI-COLLAPSED-PROGRESS', renderer: 'notification', notificationStateId: 'NOTI-COLLAPSED-PROGRESS', defaultLocale: 'ko' },
  { stateId: 'NOTI-REWARD-READY', renderer: 'notification', notificationStateId: 'NOTI-REWARD-READY', defaultLocale: 'ko' },
  { stateId: 'NOTI-REWARD-PAID', renderer: 'notification', notificationStateId: 'NOTI-REWARD-PAID', defaultLocale: 'ko' },
  { stateId: 'NOTI-INELIGIBLE', renderer: 'notification', notificationStateId: 'NOTI-INELIGIBLE', defaultLocale: 'ko' },
  { stateId: 'NOTI-ACK-BUSY', renderer: 'notification', notificationStateId: 'NOTI-ACK-BUSY', defaultLocale: 'ko' },
  { stateId: 'NOTI-ACK-ERROR', renderer: 'notification', notificationStateId: 'NOTI-ACK-ERROR', defaultLocale: 'ko' },

  { stateId: 'SETTINGS-WALLET-DISCONNECTED', renderer: 'settings', settingsStateId: 'SETTINGS-WALLET-DISCONNECTED', defaultLocale: 'ko' },
  { stateId: 'SETTINGS-WALLET-CONNECTED', renderer: 'settings', settingsStateId: 'SETTINGS-WALLET-CONNECTED', defaultLocale: 'ko' },
  { stateId: 'SETTINGS-SWITCH-CONFIRM', renderer: 'settings', settingsStateId: 'SETTINGS-SWITCH-CONFIRM', defaultLocale: 'ko' },
  { stateId: 'SETTINGS-DISCONNECT-CONFIRM', renderer: 'settings', settingsStateId: 'SETTINGS-DISCONNECT-CONFIRM', defaultLocale: 'ko' },
  { stateId: 'SETTINGS-WALLET-PENDING', renderer: 'settings', settingsStateId: 'SETTINGS-WALLET-PENDING', defaultLocale: 'ko' },
  { stateId: 'SETTINGS-ACTION-ERROR', renderer: 'settings', settingsStateId: 'SETTINGS-ACTION-ERROR', defaultLocale: 'ko' },
  { stateId: 'SETTINGS-LANGUAGE-OPEN', renderer: 'settings', settingsStateId: 'SETTINGS-LANGUAGE-OPEN', defaultLocale: 'ko' },
  { stateId: 'SETTINGS-LANGUAGE-SEARCH', renderer: 'settings', settingsStateId: 'SETTINGS-LANGUAGE-SEARCH', defaultLocale: 'ko' },

  { stateId: 'LEADERBOARD-LOADING', renderer: 'leaderboard', leaderboardStateId: 'LEADERBOARD-LOADING', defaultLocale: 'ko' },
  { stateId: 'LEADERBOARD-ERROR', renderer: 'leaderboard', leaderboardStateId: 'LEADERBOARD-ERROR', defaultLocale: 'ko' },
  { stateId: 'LEADERBOARD-LIST', renderer: 'leaderboard', leaderboardStateId: 'LEADERBOARD-LIST', defaultLocale: 'ko' },
  { stateId: 'LEADERBOARD-PLACEHOLDERS', renderer: 'leaderboard', leaderboardStateId: 'LEADERBOARD-PLACEHOLDERS', defaultLocale: 'ko' },
  { stateId: 'LEADERBOARD-CURRENT-IN-LIST', renderer: 'leaderboard', leaderboardStateId: 'LEADERBOARD-CURRENT-IN-LIST', defaultLocale: 'ko' },
  { stateId: 'LEADERBOARD-CURRENT-TRAILING', renderer: 'leaderboard', leaderboardStateId: 'LEADERBOARD-CURRENT-TRAILING', defaultLocale: 'ko' },
  { stateId: 'LEADERBOARD-MOVE-UP', renderer: 'leaderboard', leaderboardStateId: 'LEADERBOARD-MOVE-UP', defaultLocale: 'ko' },
  { stateId: 'LEADERBOARD-MOVE-DOWN', renderer: 'leaderboard', leaderboardStateId: 'LEADERBOARD-MOVE-DOWN', defaultLocale: 'ko' },
  { stateId: 'LEADERBOARD-MOVE-NEW', renderer: 'leaderboard', leaderboardStateId: 'LEADERBOARD-MOVE-NEW', defaultLocale: 'ko' },
  { stateId: 'LEADERBOARD-MOVE-SAME', renderer: 'leaderboard', leaderboardStateId: 'LEADERBOARD-MOVE-SAME', defaultLocale: 'ko' },
  { stateId: 'LEADERBOARD-WALLET-DETAIL', renderer: 'leaderboard', leaderboardStateId: 'LEADERBOARD-WALLET-DETAIL', defaultLocale: 'ko' },
  { stateId: 'LEADERBOARD-IMPACT-DETAIL', renderer: 'leaderboard', leaderboardStateId: 'LEADERBOARD-IMPACT-DETAIL', defaultLocale: 'ko' },
];

const rendererByStateId = new Map(
  QA_DIRECT_STATE_RENDERERS.map((item) => [item.stateId, item]),
);

export function getQaDirectStateRenderer(stateId: string) {
  return rendererByStateId.get(stateId) ?? null;
}

export function effectiveQaStateCoverage(state: QaKnownState): QaStateCoverage {
  if (rendererByStateId.has(state.id)) return 'direct';
  return state.coverage;
}

export function getEffectiveQaStateCoverageSummary() {
  const production = QA_KNOWN_STATES.filter(
    (state) => state.lifecycle === 'production' && state.userVisible,
  );
  const legacy = QA_KNOWN_STATES.filter(
    (state) => state.lifecycle === 'legacy' && state.userVisible,
  );

  const count = (states: QaKnownState[], coverage: QaStateCoverage) =>
    states.filter((state) => effectiveQaStateCoverage(state) === coverage).length;

  return {
    production: {
      total: production.length,
      direct: count(production, 'direct'),
      partial: count(production, 'partial'),
      missing: count(production, 'missing'),
    },
    legacy: {
      total: legacy.length,
      direct: count(legacy, 'direct'),
      partial: count(legacy, 'partial'),
      missing: count(legacy, 'missing'),
    },
    external: QA_KNOWN_STATES.filter(
      (state) => state.lifecycle === 'external' && state.userVisible,
    ).length,
    future: QA_KNOWN_STATES.filter((state) => state.lifecycle === 'future').length,
    totalInventory: QA_KNOWN_STATES.length,
  };
}

export function validateQaDirectStateCoverage(): string[] {
  const errors: string[] = [];
  const knownStateIds = new Set(QA_KNOWN_STATES.map((state) => state.id));
  const seen = new Set<string>();

  for (const item of QA_DIRECT_STATE_RENDERERS) {
    if (seen.has(item.stateId)) {
      errors.push(`duplicate direct QA state renderer: ${item.stateId}`);
    }
    seen.add(item.stateId);

    if (!knownStateIds.has(item.stateId)) {
      errors.push(`direct QA renderer references unknown state: ${item.stateId}`);
    }
  }

  return errors;
}
