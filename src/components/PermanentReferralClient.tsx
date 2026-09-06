'use client';

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  useConnectModal,
  useCurrentLanguage,
} from '@vechain/vechain-kit';

import { Brand } from './Brand';
import { InviteLandingV2 } from './InviteLandingV2';
import { LanguageSelectV2 } from './LanguageSelectV2';
import { useActiveWallet } from './WalletControl';
import { INVITEE_COPY } from '@/lib/i18n/inviteeCopy';
import { REFERRAL_LINK_COPY } from '@/lib/i18n/referralLinkCopy';
import {
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  isLocale,
  localeFromLanguageTag,
  resolveBrowserLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import {
  reportProductAnalyticsEvent,
  type ProductAnalyticsFailureCode,
} from '@/lib/productAnalytics';
import type { InviteRecord } from '@/lib/types';

type Step =
  | 'loading'
  | 'landing'
  | 'wallet'
  | 'checking'
  | 'success'
  | 'error';
type ErrorCode =
  | 'invalidLink'
  | 'full'
  | 'existing'
  | 'selfReferral'
  | 'other'
  | 'eligibility';
type EntryClass = 'new_user' | 'returning_user';

export type PermanentReferralQaState =
  | 'boot'
  | 'language-setup'
  | 'link-checking'
  | 'landing'
  | 'wallet-required'
  | 'wallet-connected'
  | 'eligibility-checking'
  | 'success-new'
  | 'success-returning'
  | 'error-invalid'
  | 'error-slots-full'
  | 'error-existing'
  | 'error-self'
  | 'error-already-referred'
  | 'error-eligibility';

export type PermanentReferralQaPreview = {
  state: PermanentReferralQaState;
  locale?: SupportedLocale;
};

type StatusResponse = {
  outcome?: 'available' | 'slots_full' | 'invalid_link' | 'server_error';
};

type ClaimResponse = {
  outcome?: string;
  invite?: InviteRecord;
  inviteCode?: string;
  entryClass?: EntryClass | 'active_existing_user';
};

type QaPreviewSeed = {
  languageReady: boolean;
  showLanguageSetup: boolean;
  step: Step;
  errorCode: ErrorCode;
  entryClass: EntryClass;
  walletConnected: boolean;
};

const QA_PREVIEW_WALLET =
  '0x1234567890abcdef1234567890abcdef12345678';

function qaPreviewSeed(state: PermanentReferralQaState): QaPreviewSeed {
  if (state === 'boot') {
    return {
      languageReady: false,
      showLanguageSetup: true,
      step: 'loading',
      errorCode: 'invalidLink',
      entryClass: 'new_user',
      walletConnected: false,
    };
  }

  if (state === 'language-setup') {
    return {
      languageReady: true,
      showLanguageSetup: true,
      step: 'loading',
      errorCode: 'invalidLink',
      entryClass: 'new_user',
      walletConnected: false,
    };
  }

  const base: QaPreviewSeed = {
    languageReady: true,
    showLanguageSetup: false,
    step: 'landing',
    errorCode: 'invalidLink',
    entryClass: 'new_user',
    walletConnected: false,
  };

  if (state === 'link-checking') return { ...base, step: 'loading' };
  if (state === 'landing') return base;
  if (state === 'wallet-required') return { ...base, step: 'wallet' };
  if (state === 'wallet-connected') {
    return { ...base, step: 'wallet', walletConnected: true };
  }
  if (state === 'eligibility-checking') {
    return { ...base, step: 'checking', walletConnected: true };
  }
  if (state === 'success-new') {
    return {
      ...base,
      step: 'success',
      entryClass: 'new_user',
      walletConnected: true,
    };
  }
  if (state === 'success-returning') {
    return {
      ...base,
      step: 'success',
      entryClass: 'returning_user',
      walletConnected: true,
    };
  }

  const errorCode: ErrorCode =
    state === 'error-invalid'
      ? 'invalidLink'
      : state === 'error-slots-full'
        ? 'full'
        : state === 'error-existing'
          ? 'existing'
          : state === 'error-self'
            ? 'selfReferral'
            : state === 'error-already-referred'
              ? 'other'
              : 'eligibility';

  return {
    ...base,
    step: 'error',
    errorCode,
    walletConnected: true,
  };
}

function claimFailureCode(
  response: Response,
  outcome: string | undefined,
): ProductAnalyticsFailureCode {
  if (response.status === 404 || outcome === 'invalid_link') {
    return 'invalid_link';
  }
  if (outcome === 'slots_full') return 'slots_full';
  if (outcome === 'active_existing_user') return 'existing_user';
  if (outcome === 'self_referral') return 'self_referral';
  if (outcome === 'already_referred') return 'already_referred';
  if (response.status >= 500) return 'server';
  return 'eligibility';
}

export function PermanentReferralClient({
  referralKey,
  qaPreview = null,
}: {
  referralKey: string;
  qaPreview?: PermanentReferralQaPreview | null;
}) {
  const liveWallet = useActiveWallet();
  const { open: openConnectModal } = useConnectModal();
  const { setLanguage: setKitLanguage } = useCurrentLanguage();
  const initialQaSeed = qaPreview ? qaPreviewSeed(qaPreview.state) : null;
  const previewMode = qaPreview !== null;
  const wallet = previewMode
    ? initialQaSeed?.walletConnected
      ? QA_PREVIEW_WALLET
      : null
    : liveWallet;
  const [locale, setLocale] = useState<SupportedLocale>(
    qaPreview?.locale ?? 'en',
  );
  const [languageReady, setLanguageReady] = useState(
    initialQaSeed?.languageReady ?? false,
  );
  const [showLanguageSetup, setShowLanguageSetup] = useState(
    initialQaSeed?.showLanguageSetup ?? true,
  );
  const [step, setStep] = useState<Step>(initialQaSeed?.step ?? 'loading');
  const [errorCode, setErrorCode] = useState<ErrorCode>(
    initialQaSeed?.errorCode ?? 'invalidLink',
  );
  const [entryClass, setEntryClass] = useState<EntryClass>(
    initialQaSeed?.entryClass ?? 'new_user',
  );
  const [claimedInviteCode, setClaimedInviteCode] = useState('');
  const t = INVITEE_COPY[locale];
  const referral = REFERRAL_LINK_COPY[locale];

  useEffect(() => {
    if (qaPreview) {
      const seed = qaPreviewSeed(qaPreview.state);
      const previewLocale = qaPreview.locale ?? 'ko';
      setLocale(previewLocale);
      setLanguageReady(seed.languageReady);
      setShowLanguageSetup(seed.showLanguageSetup);
      setStep(seed.step);
      setErrorCode(seed.errorCode);
      setEntryClass(seed.entryClass);
      setClaimedInviteCode(
        seed.step === 'success' ? 'QA1234' : '',
      );
      document.documentElement.lang = previewLocale;
      return;
    }

    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const queryLanguage = new URLSearchParams(window.location.search).get('lang');
    const savedLocale = isLocale(saved) ? saved : null;
    const queryLocale = localeFromLanguageTag(queryLanguage);
    const browserLocale = resolveBrowserLocale(window.navigator.languages, 'en');
    const initialLocale = queryLocale ?? savedLocale ?? browserLocale;

    setLocale(initialLocale);
    setShowLanguageSetup(!savedLocale && !queryLocale);
    document.documentElement.lang = initialLocale;
    setLanguageReady(true);
  }, [qaPreview?.locale, qaPreview?.state]);

  useEffect(() => {
    if (!previewMode && languageReady) setKitLanguage(locale);
  }, [languageReady, locale, previewMode, setKitLanguage]);

  const saveLocale = (nextLocale: SupportedLocale) => {
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale;

    if (previewMode) {
      return;
    }

    setKitLanguage(nextLocale);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    window.dispatchEvent(
      new CustomEvent('veinvite-language-change', { detail: nextLocale }),
    );
  };

  const validateLink = useCallback(async () => {
    if (previewMode) return;

    setStep('loading');
    try {
      const response = await fetch(
        `/api/referral-links/${encodeURIComponent(referralKey)}`,
        { cache: 'no-store' },
      );
      const data = (await response.json()) as StatusResponse;

      if (response.status === 404 || data.outcome === 'invalid_link') {
        setErrorCode('invalidLink');
        setStep('error');
        return;
      }
      if (data.outcome === 'slots_full') {
        setErrorCode('full');
        setStep('error');
        return;
      }
      if (!response.ok || data.outcome !== 'available') {
        setErrorCode('eligibility');
        setStep('error');
        return;
      }
      setStep('landing');
    } catch {
      setErrorCode('eligibility');
      setStep('error');
    }
  }, [previewMode, referralKey]);

  useEffect(() => {
    if (
      !previewMode &&
      languageReady &&
      !showLanguageSetup
    ) {
      void validateLink();
    }
  }, [
    languageReady,
    previewMode,
    showLanguageSetup,
    validateLink,
  ]);

  const confirmLanguage = () => {
    saveLocale(locale);
    setShowLanguageSetup(false);
    if (previewMode) setStep('landing');
  };

  const openWallet = () => {
    if (previewMode) return;

    reportProductAnalyticsEvent({
      eventName: 'wallet_connect_started',
      flowKey: 'permanent_referral',
    });
    openConnectModal();
  };

  const claim = async () => {
    if (!wallet) {
      setStep('wallet');
      return;
    }

    if (previewMode) {
      setStep('checking');
      return;
    }

    reportProductAnalyticsEvent({
      eventName: 'invite_accept_started',
      flowKey: 'permanent_referral',
    });
    setStep('checking');

    let response: Response;
    try {
      response = await fetch(
        `/api/referral-links/${encodeURIComponent(referralKey)}/claim`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteeAddress: wallet }),
        },
      );
    } catch {
      reportProductAnalyticsEvent({
        eventName: 'invite_accept_failed',
        outcome: 'failure',
        failureCode: 'network',
        flowKey: 'permanent_referral',
      });
      setErrorCode('eligibility');
      setStep('error');
      return;
    }

    let data: ClaimResponse;
    try {
      data = (await response.json()) as ClaimResponse;
    } catch {
      reportProductAnalyticsEvent({
        eventName: 'invite_accept_failed',
        outcome: 'failure',
        failureCode: 'malformed_response',
        flowKey: 'permanent_referral',
      });
      setErrorCode('eligibility');
      setStep('error');
      return;
    }

    if (
      response.ok &&
      data.outcome === 'already_claimed' &&
      data.inviteCode
    ) {
      const resumeUrl = new URL(
        `/i/${data.inviteCode}`,
        window.location.origin,
      );
      resumeUrl.searchParams.set('lang', locale);
      window.location.assign(resumeUrl.toString());
      return;
    }

    if (!response.ok) {
      reportProductAnalyticsEvent({
        eventName: 'invite_accept_failed',
        outcome: 'failure',
        failureCode: claimFailureCode(response, data.outcome),
        flowKey: 'permanent_referral',
      });

      if (response.status === 404 || data.outcome === 'invalid_link') {
        setErrorCode('invalidLink');
      } else if (data.outcome === 'slots_full') {
        setErrorCode('full');
      } else if (data.outcome === 'active_existing_user') {
        setErrorCode('existing');
      } else if (data.outcome === 'self_referral') {
        setErrorCode('selfReferral');
      } else if (data.outcome === 'already_referred') {
        setErrorCode('other');
      } else {
        setErrorCode('eligibility');
      }
      setStep('error');
      return;
    }

    if (
      !data.invite?.code ||
      (data.entryClass !== 'new_user' &&
        data.entryClass !== 'returning_user')
    ) {
      reportProductAnalyticsEvent({
        eventName: 'invite_accept_failed',
        outcome: 'failure',
        failureCode: 'malformed_response',
        flowKey: 'permanent_referral',
      });
      setErrorCode('eligibility');
      setStep('error');
      return;
    }

    reportProductAnalyticsEvent({
      eventName: 'invite_accept_succeeded',
      outcome: 'success',
      flowKey: 'permanent_referral',
      entryClass: data.entryClass,
    });
    setClaimedInviteCode(data.invite.code);
    setEntryClass(data.entryClass);
    setStep('success');
  };

  const continueToMissions = () => {
    if (previewMode || !claimedInviteCode) return;
    const url = new URL(
      `/i/${claimedInviteCode}`,
      window.location.origin,
    );
    url.searchParams.set('lang', locale);
    window.location.assign(url.toString());
  };

  if (!languageReady) {
    return <main className="centeredFlow"><Brand compact /></main>;
  }

  if (showLanguageSetup) {
    return (
      <LanguageSelectV2
        locale={locale}
        onSelect={(next) => setLocale(next)}
        onContinue={confirmLanguage}
      />
    );
  }

  if (step === 'loading') {
    return (
      <Centered locale={locale} onLocaleChange={saveLocale}>
        <div className="spinnerLarge" />
        <h1>{t.checkingTitle}</h1>
        <p className="muted">{t.checkingDescription}</p>
      </Centered>
    );
  }

  if (step === 'error') {
    const title = errorCode === 'full'
      ? referral.slotsFullTitle
      : t.errors[errorCode === 'invalidLink'
        ? 'invalidLink'
        : errorCode === 'existing'
          ? 'existing'
          : errorCode === 'selfReferral'
            ? 'selfReferral'
            : errorCode === 'other'
              ? 'other'
              : 'eligibility'];
    const description = errorCode === 'full'
      ? referral.slotsFullHelp
      : errorCode === 'invalidLink'
        ? t.requestNewLink
        : errorCode === 'existing'
          ? t.existingHelp
          : errorCode === 'selfReferral'
            ? t.selfReferralHelp
            : errorCode === 'other'
              ? t.otherHelp
              : t.tryAgain;

    return (
      <Centered locale={locale} onLocaleChange={saveLocale}>
        <div className="errorIcon">×</div>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
        {errorCode === 'full' || errorCode === 'eligibility' ? (
          <button
            type="button"
            className="secondaryButton"
            onClick={() => void validateLink()}
          >
            {referral.retry}
          </button>
        ) : null}
        <Link className="secondaryButton linkButton" href="/">{t.home}</Link>
      </Centered>
    );
  }

  if (step === 'checking') {
    return (
      <Centered locale={locale} onLocaleChange={saveLocale}>
        <div className="spinnerLarge" />
        <h1>{t.checkingTitle}</h1>
        <p className="muted">{t.checkingDescription}</p>
        <div className="checkList">
          <span>○ {t.checkingLink}</span>
          <span>○ {t.checkingHistory}</span>
          <span>○ {t.checkingOtherInvite}</span>
        </div>
      </Centered>
    );
  }

  if (step === 'wallet') {
    return (
      <Centered locale={locale} onLocaleChange={saveLocale}>
        <div className="walletVisual" />
        <h1>{t.connectWalletTitle}</h1>
        <p className="muted">{t.connectWalletDescription}</p>
        {!wallet ? (
          <button
            type="button"
            className="secondaryButton"
            onClick={openWallet}
          >
            {t.connectWallet}
          </button>
        ) : (
          <div className="notice successNotice">
            {t.walletConnected}: {shortAddress(wallet)}
          </div>
        )}
        <button
          type="button"
          className="primaryButton"
          disabled={!wallet}
          onClick={() => void claim()}
        >
          {wallet ? t.checkEligibility : t.connectThenContinue}
        </button>
      </Centered>
    );
  }

  if (step === 'success') {
    const returning = entryClass === 'returning_user';
    return (
      <Centered locale={locale} onLocaleChange={saveLocale}>
        <div className="successCircle">{returning ? '↻' : '✓'}</div>
        <h1>{returning ? t.returningSuccessTitle : t.newSuccessTitle}</h1>
        <p className="muted">
          {returning
            ? t.returningSuccessDescription
            : t.newSuccessDescription}
        </p>
        <button
          type="button"
          className="primaryButton greenButton"
          onClick={continueToMissions}
        >
          {t.viewMissions}
        </button>
      </Centered>
    );
  }

  return (
    <InviteLandingV2
      locale={locale}
      disabled={false}
      demoMode={false}
      demoOutcome="success"
      onLocaleChange={saveLocale}
      onBeginnerStart={() => setStep('wallet')}
      onExistingWallet={() => {
        if (wallet) void claim();
        else setStep('wallet');
      }}
      onDemoOutcomeChange={() => undefined}
    />
  );
}

function Centered({
  children,
  locale,
  onLocaleChange,
}: {
  children: ReactNode;
  locale: SupportedLocale;
  onLocaleChange: (locale: SupportedLocale) => void;
}) {
  return (
    <main className="centeredFlow">
      <LanguageSwitcher locale={locale} onChange={onLocaleChange} />
      <Brand compact />
      {children}
    </main>
  );
}

function LanguageSwitcher({
  locale,
  onChange,
}: {
  locale: SupportedLocale;
  onChange: (locale: SupportedLocale) => void;
}) {
  return (
    <label
      style={{
        position: 'fixed',
        top: '18px',
        right: '18px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 10px',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '12px',
        background: 'rgba(17,20,33,0.92)',
        color: '#f8f7ff',
        zIndex: 20,
      }}
    >
      <span aria-hidden="true">🌐</span>
      <select
        className="languageSelect"
        aria-label={INVITEE_COPY[locale].languageChanged}
        value={locale}
        onChange={(event) =>
          onChange(event.target.value as SupportedLocale)}
        style={{
          border: 0,
          outline: 0,
          maxWidth: '150px',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option
            key={option.locale}
            value={option.locale}
            style={{ color: '#111421' }}
          >
            {option.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}···${address.slice(-6)}`;
}
