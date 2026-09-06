import type { PermanentReferralQaState } from '@/components/PermanentReferralClient';
import type { WalletSessionQaState } from '@/components/WalletSessionGate';
import type { LegalConsentQaState } from '@/components/LegalConsentGate';
import type { QaHomeStateId } from './QaHomeStateHarness';
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
    });

export const QA_DIRECT_STATE_RENDERERS: QaDirectStateRenderer[] = [
  { stateId: 'PRI-BOOT-BRAND', renderer: 'permanent-referral', permanentReferralState: 'boot', defaultLocale: 'ko' },
  { stateId: 'PRI-LANGUAGE-SETUP', renderer: 'permanent-referral', permanentReferralState: 'language-setup', defaultLocale: 'ko' },
  { stateId: 'PRI-LINK-CHECKING', renderer: 'permanent-referral', permanentReferralState: 'link-checking', defaultLocale: 'ko' },
  { stateId: 'PRI-LANDING', renderer: 'permanent-referral', permanentReferralState: 'landing', defaultLocale: 'ko' },
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
  { stateId: 'REWARD-AWAITING-CLAIM', renderer: 'home', homeStateId: 'REWARD-AWAITING-CLAIM', defaultLocale: 'ko' },
  { stateId: 'REWARD-CLAIM-PENDING', renderer: 'home', homeStateId: 'REWARD-CLAIM-PENDING', defaultLocale: 'ko' },
  { stateId: 'REWARD-CLAIM-QUEUED', renderer: 'home', homeStateId: 'REWARD-CLAIM-QUEUED', defaultLocale: 'ko' },
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
