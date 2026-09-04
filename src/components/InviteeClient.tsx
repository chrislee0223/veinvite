'use client';

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
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
import {
  LANGUAGE_OPTIONS,
  LANGUAGE_STORAGE_KEY,
  isLocale,
  localeFromLanguageTag,
  resolveBrowserLocale,
  type Locale,
} from '@/lib/i18n/locales';
import type { InviteRecord } from '@/lib/types';

type Step = 'landing' | 'wallet' | 'checking' | 'success' | 'missions' | 'error' | 'review';
type EntryClass = 'new_user' | 'returning_user';
type ErrorCode = 'invalidLink' | 'used' | 'eligibility' | 'existing' | 'selfReferral' | 'other' | 'complete';
type ProgressReadMode = 'read' | 'sync';

type InviteProgress = {
  appsCompleted: number;
  appsRequired: number;
  rewardsReceived: number;
  vot3Converted: boolean;
  vot3MinimumAmountWei: string;
  vot3ConversionAmountWei: string | null;
  voteCompleted: boolean;
  uniqueAppIds: string[];
  activationBlock: number | null;
  latestBlock: number | null;
};

type InviteApiResponse = {
  invite?: InviteRecord;
  progress?: InviteProgress;
  outcome?: string;
  entryClass?: EntryClass | 'active_existing_user';
};

class InviteRequestError extends Error {
  readonly status: number;
  readonly outcome: string | undefined;

  constructor(
    status: number,
    outcome?: string,
  ) {
    super(`Invite request failed with status ${status}.`);
    this.name = 'InviteRequestError';
    this.status = status;
    this.outcome = outcome;
  }
}

const DEFAULT_PROGRESS: InviteProgress = {
  appsCompleted: 0,
  appsRequired: 3,
  rewardsReceived: 0,
  vot3Converted: false,
  vot3MinimumAmountWei: '1',
  vot3ConversionAmountWei: null,
  voteCompleted: false,
  uniqueAppIds: [],
  activationBlock: null,
  latestBlock: null,
};

const VEBETTER_APPS_URL = 'https://governance.vebetterdao.org/apps';
const VEBETTER_ALLOCATION_VOTING_URL =
  'https://governance.vebetterdao.org/allocations';
const RESUME_SYNC_COOLDOWN_MS = 5_000;

async function readInviteResponse(
  response: Response,
): Promise<InviteApiResponse> {
  let data: InviteApiResponse = {};

  try {
    data = (await response.json()) as InviteApiResponse;
  } catch {
    throw new InviteRequestError(
      response.ok ? 502 : response.status,
    );
  }

  if (!response.ok) {
    throw new InviteRequestError(
      response.status,
      data.outcome,
    );
  }

  if (!data.invite || !data.progress) {
    throw new InviteRequestError(502);
  }

  return data;
}

export function InviteeClient({ code }: { code: string }) {
  const wallet = useActiveWallet();
  const { open: openConnectModal } = useConnectModal();
  const { setLanguage: setKitLanguage } = useCurrentLanguage();

  const [invite, setInvite] = useState<InviteRecord | null>(null);
  const [progress, setProgress] = useState<InviteProgress>(DEFAULT_PROGRESS);
  const [step, setStep] = useState<Step>('landing');
  const [errorCode, setErrorCode] = useState<ErrorCode>('invalidLink');
  const [entryClass, setEntryClass] = useState<EntryClass>('new_user');
  const [demoOutcome, setDemoOutcome] = useState<'success' | 'existing' | 'other' | 'review'>('success');
  const [locale, setLocale] = useState<Locale>('en');
  const [languageReady, setLanguageReady] = useState(false);
  const [showLanguageSetup, setShowLanguageSetup] = useState(true);
  const [claimedThisSession, setClaimedThisSession] = useState(false);

  const t = INVITEE_COPY[locale];
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  const loadInviteProgress = useCallback(async (
    mode: ProgressReadMode = 'read',
  ) => {
    try {
      const response = await fetch(`/api/invites/${code}`, {
        method: mode === 'sync' ? 'POST' : 'GET',
        cache: 'no-store',
      });
      const data = await readInviteResponse(response);
      setInvite(data.invite!);
      setProgress(data.progress!);
      return data;
    } catch (error) {
      console.error('Failed to load invite progress:', error);
      throw error;
    }
  }, [code]);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (languageReady) setKitLanguage(locale);
  }, [languageReady, locale, setKitLanguage]);

  useEffect(() => {
    void loadInviteProgress('read').catch((error: unknown) => {
      const status = error instanceof InviteRequestError
        ? error.status
        : null;
      const outcome = error instanceof InviteRequestError
        ? error.outcome
        : undefined;

      // A system-closed ineligible invite keeps its explicit participation
      // result when the old link is reopened. Only a real 404/410 means the
      // invitation is unavailable. Temporary database, throttling, or network
      // failures must not tell the user that a valid invite has expired.
      setErrorCode(
        outcome === 'active_existing_user'
          ? 'existing'
          : status === 404 || status === 410
            ? 'invalidLink'
            : 'eligibility',
      );
      setStep('error');
    });
  }, [loadInviteProgress]);

  useEffect(() => {
    if (!wallet || !invite?.inviteeAddress) return;
    if (invite.inviteeAddress.toLowerCase() !== wallet.toLowerCase()) return;

    if (invite.status === 'UNDER_REVIEW') {
      setStep('review');
      return;
    }

    if (step === 'review' && (invite.status === 'ACTIVATING' || invite.status === 'COMPLETED')) {
      setStep('missions');
      return;
    }

    if (claimedThisSession) return;
    if (invite.status === 'ACTIVATING' || invite.status === 'COMPLETED') setStep('missions');
  }, [claimedThisSession, invite, step, wallet]);

  useEffect(() => {
    const shouldPollMissions =
      step === 'missions' &&
      invite?.status !== 'COMPLETED' &&
      invite?.status !== 'UNDER_REVIEW';
    const shouldPollReview = step === 'review';
    const shouldRecoverCompleted =
      step === 'missions' &&
      invite?.status === 'COMPLETED' &&
      invite.rewardEligibility !== 'PAID' &&
      invite.rewardEligibility !== 'FORFEITED';

    if (
      !shouldPollMissions &&
      !shouldPollReview &&
      !shouldRecoverCompleted
    ) {
      return;
    }

    // Preserve the existing one-shot recovery even if the page was opened in
    // the background. Active/review polling below is visibility-aware.
    if (shouldRecoverCompleted) {
      void loadInviteProgress('sync').catch(() => undefined);
      return;
    }

    let syncInFlight = false;
    let lastSyncAt = 0;

    const reconcile = () => {
      if (document.visibilityState !== 'visible') return;

      const now = Date.now();
      if (
        syncInFlight ||
        now - lastSyncAt < RESUME_SYNC_COOLDOWN_MS
      ) {
        return;
      }

      syncInFlight = true;
      lastSyncAt = now;
      void loadInviteProgress('sync')
        .catch(() => undefined)
        .finally(() => {
          syncInFlight = false;
        });
    };

    const reconcileOnResume = () => {
      if (document.visibilityState === 'visible') reconcile();
    };

    // Keep the existing low-frequency reconciliation, but refresh once when
    // the user returns from a VeBetterDAO mission. The cooldown and in-flight
    // guard prevent focus/pageshow/visibility events from creating duplicates.
    reconcile();

    const intervalId = window.setInterval(reconcile, 30_000);
    document.addEventListener('visibilitychange', reconcileOnResume);
    window.addEventListener('focus', reconcileOnResume);
    window.addEventListener('pageshow', reconcileOnResume);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', reconcileOnResume);
      window.removeEventListener('focus', reconcileOnResume);
      window.removeEventListener('pageshow', reconcileOnResume);
    };
  }, [
    step,
    invite?.status,
    invite?.rewardEligibility,
    loadInviteProgress,
  ]);

  const saveLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    setKitLanguage(nextLocale);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
    window.dispatchEvent(new CustomEvent('veinvite-language-change', { detail: nextLocale }));
  };

  const confirmLanguage = () => {
    saveLocale(locale);
    setShowLanguageSetup(false);
  };

  const claim = async () => {
    if (!wallet) {
      setStep('wallet');
      return;
    }

    setStep('checking');
    await new Promise((resolve) => setTimeout(resolve, 850));

    try {
      const response = await fetch(`/api/invites/${code}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteeAddress: wallet,
          demoOutcome: demoOutcome === 'success' ? undefined : demoOutcome,
        }),
      });

      let data: InviteApiResponse;
      try {
        data = (await response.json()) as InviteApiResponse;
      } catch {
        throw new Error('Malformed invite claim response.');
      }

      if (response.status === 202 || data.outcome === 'review') {
        setStep('review');
        return;
      }

      if (!response.ok) {
        if (response.status === 404) setErrorCode('invalidLink');
        else if (response.status === 409 || data.outcome === 'already_used') setErrorCode('used');
        else if (data.outcome === 'active_existing_user') setErrorCode('existing');
        else if (data.outcome === 'self_referral') setErrorCode('selfReferral');
        else if (data.outcome === 'already_referred') setErrorCode('other');
        else if (demoOutcome === 'existing') setErrorCode('existing');
        else if (demoOutcome === 'other') setErrorCode('other');
        else setErrorCode('eligibility');
        setStep('error');
        return;
      }

      if (
        !data.invite ||
        (data.entryClass !== 'new_user' &&
          data.entryClass !== 'returning_user')
      ) {
        throw new Error('Incomplete invite claim response.');
      }

      setClaimedThisSession(true);
      setEntryClass(data.entryClass);
      setInvite(data.invite);
      setProgress(DEFAULT_PROGRESS);
      setStep('success');
    } catch (error) {
      console.error('Failed to claim invite:', error);
      setErrorCode('eligibility');
      setStep('error');
    }
  };

  const completeMissions = async () => {
    try {
      const response = await fetch(`/api/invites/${code}/complete`, {
        method: 'POST',
      });
      const data = await response.json();
      if (!response.ok) {
        setErrorCode('complete');
        setStep('error');
        return;
      }
      setInvite(data.invite);
      setProgress({
        ...DEFAULT_PROGRESS,
        appsCompleted: 3,
        rewardsReceived: 3,
        vot3Converted: true,
        vot3ConversionAmountWei: DEFAULT_PROGRESS.vot3MinimumAmountWei,
        voteCompleted: true,
      });
    } catch (error) {
      console.error('Failed to complete demo missions:', error);
      setErrorCode('complete');
      setStep('error');
    }
  };

  if (!languageReady) {
    return <main className="centeredFlow"><Brand compact /></main>;
  }

  if (showLanguageSetup) {
    return <LanguageSelectV2 locale={locale} onSelect={setLocale} onContinue={confirmLanguage} />;
  }

  if (step === 'error') {
    return (
      <Centered locale={locale} onLocaleChange={saveLocale}>
        <div className="errorIcon">×</div>
        <h1>{t.errors[errorCode]}</h1>
        <p className="muted">
          {errorCode === 'invalidLink' || errorCode === 'used'
            ? t.requestNewLink
            : errorCode === 'existing'
              ? t.existingHelp
              : errorCode === 'selfReferral'
                ? t.selfReferralHelp
                : errorCode === 'other'
                  ? t.otherHelp
                  : t.tryAgain}
        </p>
        <Link className="secondaryButton linkButton" href="/">{t.home}</Link>
      </Centered>
    );
  }

  if (step === 'review') {
    return (
      <Centered locale={locale} onLocaleChange={saveLocale}>
        <div className="reviewIcon">◷</div>
        <h1>{t.reviewTitle}</h1>
        <p className="muted">{t.reviewDescription}</p>
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
          <button type="button" className="secondaryButton" onClick={() => openConnectModal()}>{t.connectWallet}</button>
        ) : (
          <div className="notice successNotice">{t.walletConnected}: {shortAddress(wallet)}</div>
        )}
        <button type="button" className="primaryButton" disabled={!wallet} onClick={() => void claim()}>
          {wallet ? t.checkEligibility : t.connectThenContinue}
        </button>
      </Centered>
    );
  }

  if (step === 'success') {
    const isReturning = entryClass === 'returning_user';
    return (
      <Centered locale={locale} onLocaleChange={saveLocale}>
        <div className="successCircle">{isReturning ? '↻' : '✓'}</div>
        <h1>{isReturning ? t.returningSuccessTitle : t.newSuccessTitle}</h1>
        <p className="muted">{isReturning ? t.returningSuccessDescription : t.newSuccessDescription}</p>
        <div className="missionSummary">
          <span>✓ {t.walletMission}</span>
          <span>2. {t.appMission}</span>
          <span>3. {t.conversionMission}</span>
          <span>4. {t.voteMission}</span>
        </div>
        <button type="button" className="primaryButton greenButton" onClick={() => setStep('missions')}>{t.viewMissions}</button>
      </Centered>
    );
  }

  if (step === 'missions') {
    const appsCompleted = Math.min(progress.appsCompleted, progress.appsRequired);
    const appsDone = appsCompleted >= progress.appsRequired;
    const firstAppDone = appsCompleted >= 1;
    const conversionDone = progress.vot3Converted;
    const conversionUnlocked = firstAppDone || conversionDone;
    const voteDone = progress.voteCompleted;
    const voteUnlocked = conversionDone || voteDone;
    const completed = appsDone && conversionDone && voteDone;
    const legacyIncomplete =
      invite?.status === 'COMPLETED' && !completed;
    const appProgressStatus =
      `${appsCompleted}/${progress.appsRequired}${appsDone ? ' ✓' : ''}`;

    return (
      <main className="appShell">
        <header className="appHeader">
          <Brand />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="chip">{t.invitedFriend}</span>
            <LanguageSwitcher locale={locale} onChange={saveLocale} inline />
          </div>
        </header>

        <section className="panel missionPanel">
          <span className="eyebrow">{t.myMissions}</span>
          <h1>{completed ? t.allMissionsComplete : t.oneThingToDo}</h1>
          <MissionCard state="done" title={t.walletMission} description={t.walletMissionDescription} status={t.complete} />
          <MissionCard
            state={appsDone ? 'done' : 'current'}
            title={t.appMission}
            description={t.appMissionDescription}
            status={appProgressStatus}
            statusDirection="ltr"
            actionHref={appsDone ? undefined : VEBETTER_APPS_URL}
          />
          <MissionCard state={conversionDone ? 'done' : conversionUnlocked ? 'current' : 'locked'} title={t.conversionMission} description={t.conversionMissionDescription} status={conversionDone ? t.complete : conversionUnlocked ? t.ready : t.locked} />
          <MissionCard
            state={voteDone ? 'done' : voteUnlocked ? 'current' : 'locked'}
            title={t.voteMission}
            description={t.voteMissionDescription}
            status={voteDone ? t.complete : voteUnlocked ? t.ready : t.locked}
            actionHref={!voteDone && voteUnlocked ? VEBETTER_ALLOCATION_VOTING_URL : undefined}
          />
          {!completed && demoMode ? (
            <button type="button" className="secondaryButton" onClick={() => void completeMissions()}>{t.demoComplete}</button>
          ) : legacyIncomplete ? (
            <div className="notice">{t.errors.complete}</div>
          ) : !completed ? (
            <div className="notice">{t.autoProgress}</div>
          ) : (
            <div className="notice successNotice">{t.activationConfirmed}</div>
          )}
        </section>
      </main>
    );
  }

  return (
    <InviteLandingV2
      locale={locale}
      disabled={!invite}
      demoMode={demoMode}
      demoOutcome={demoOutcome}
      onLocaleChange={saveLocale}
      onBeginnerStart={() => setStep('wallet')}
      onExistingWallet={() => { if (wallet) void claim(); else setStep('wallet'); }}
      onDemoOutcomeChange={setDemoOutcome}
    />
  );
}

function MissionCard({
  state,
  title,
  description,
  status,
  statusDirection,
  actionHref,
}: {
  state: 'done' | 'current' | 'locked';
  title: string;
  description: string;
  status: string;
  statusDirection?: 'ltr' | 'rtl';
  actionHref?: string;
}) {
  return (
    <div className={`mission ${state}`}>
      <span>{state === 'done' ? '✓' : state === 'current' ? '◎' : '◇'}</span>
      <div><b>{title}</b><p>{description}</p></div>
      <MissionStatus
        state={state}
        status={status}
        direction={statusDirection}
        href={actionHref}
        label={actionHref ? `${title}: ${status}` : undefined}
      />
    </div>
  );
}

function MissionStatus({
  state,
  status,
  direction,
  href,
  label,
}: {
  state: 'done' | 'current' | 'locked';
  status: string;
  direction?: 'ltr' | 'rtl';
  href?: string;
  label?: string;
}) {
  const style = missionStatusStyle(state, Boolean(href));

  if (href) {
    return (
      <a
        href={href}
        aria-label={label}
        dir={direction}
        style={style}
      >
        <span>{status}</span>
        <span aria-hidden="true">↗</span>
      </a>
    );
  }

  return (
    <em dir={direction} style={style}>{status}</em>
  );
}

function missionStatusStyle(
  state: 'done' | 'current' | 'locked',
  actionable: boolean,
): CSSProperties {
  const palette = state === 'done'
    ? {
        color: '#78e5ac',
        borderColor: 'rgba(54,207,130,.24)',
        background: 'rgba(54,207,130,.08)',
      }
    : state === 'locked'
      ? {
          color: '#aaa69d',
          borderColor: 'rgba(255,255,255,.10)',
          background: 'rgba(255,255,255,.035)',
        }
      : {
          color: '#ffd66e',
          borderColor: 'rgba(244,183,40,.25)',
          background: 'rgba(244,183,40,.08)',
        };

  return {
    minWidth: '72px',
    minHeight: '40px',
    padding: '7px 10px',
    borderRadius: '999px',
    border: `1px solid ${palette.borderColor}`,
    background: palette.background,
    color: palette.color,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    flex: '0 0 auto',
    whiteSpace: 'nowrap',
    fontSize: '10px',
    fontStyle: 'normal',
    fontWeight: 800,
    lineHeight: 1,
    textDecoration: 'none',
    cursor: actionable ? 'pointer' : 'default',
    unicodeBidi: 'isolate',
  };
}

function Centered({
  children,
  locale,
  onLocaleChange,
}: {
  children: ReactNode;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
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
  inline = false,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
  inline?: boolean;
}) {
  return (
    <label
      style={inline ? {
        display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 10px',
        border: '1px solid rgba(255,255,255,0.14)', borderRadius: '12px',
        background: 'rgba(255,255,255,0.06)', color: '#f8f7ff', zIndex: 20,
      } : {
        position: 'fixed', top: '18px', right: '18px', display: 'inline-flex',
        alignItems: 'center', gap: '6px', padding: '8px 10px',
        border: '1px solid rgba(255,255,255,0.14)', borderRadius: '12px',
        background: 'rgba(17,20,33,0.92)', color: '#f8f7ff', zIndex: 20,
      }}
    >
      <span aria-hidden="true">🌐</span>
      <select
        className="languageSelect"
        aria-label={INVITEE_COPY[locale].languageChanged}
        value={locale}
        onChange={(event) => onChange(event.target.value as Locale)}
        style={{ border: 0, outline: 0, maxWidth: inline ? '120px' : '150px', background: 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' }}
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.locale} value={option.locale} style={{ color: '#111421' }}>{option.nativeName}</option>
        ))}
      </select>
    </label>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}···${address.slice(-6)}`;
}
