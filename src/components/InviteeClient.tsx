'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useConnectModal, useCurrentLanguage } from '@vechain/vechain-kit';
import { Brand } from './Brand';
import { InviteLandingV2 } from './InviteLandingV2';
import { LanguageSelectV2 } from './LanguageSelectV2';
import { useActiveWallet } from './WalletControl';
import type { InviteRecord } from '@/lib/types';

type Step =
  | 'landing'
  | 'wallet'
  | 'checking'
  | 'success'
  | 'missions'
  | 'error'
  | 'review';

type Locale = 'ko' | 'en';

type ErrorCode =
  | 'invalidLink'
  | 'eligibility'
  | 'existing'
  | 'other'
  | 'complete';

const LANGUAGE_STORAGE_KEY = 'veinvite-language';

const COPY = {
  ko: {
    languageContinue: '한국어로 계속',
    languageChanged: '한국어',
    invitationLabel: '친구 초대',
    landingTitle1: '친구가 보낸',
    landingTitle2: 'VeInvite',
    landingDescription:
      '지갑을 연결하고 첫 미션을 완료하면 나도 친구 한 명을 초대할 수 있어요.',
    eligibilityTitle: '누가 시작할 수 있나요?',
    eligibilityDescription:
      'VeBetterDAO를 아직 시작하지 않았다면 기존 VeChain 지갑으로도 참여할 수 있어요.',
    start: '시작하기',
    connectWalletTitle: '지갑을 연결하고 시작하세요',
    connectWalletDescription:
      '지갑을 연결하면 초대가 이어지고 첫 미션이 열려요.',
    connectWallet: '지갑 연결',
    walletConnected: '연결된 지갑',
    checkEligibility: '퀘스트 시작',
    connectThenContinue: '지갑을 연결해 주세요',
    checkingTitle: '퀘스트를 준비하고 있어요',
    checkingDescription:
      '초대 링크와 지갑을 확인하고 미션을 불러오는 중이에요.',
    checkingLink: '초대 링크 확인',
    checkingHistory: '지갑 연결 확인',
    checkingOtherInvite: '미션 준비',
    reviewTitle: '조금 더 확인이 필요해요',
    reviewDescription:
      '확인이 끝나면 이 화면에서 바로 이어서 시작할 수 있어요.',
    successTitle: '퀘스트가 시작됐어요',
    successDescription:
      '미션을 하나씩 완료하면 마지막에 보상이 열려요.',
    walletMission: '지갑 연결',
    appMission: 'VeBetter 앱 3개 체험',
    voteMission: '첫 투표 참여',
    viewMissions: '미션 시작',
    invitedFriend: '초대받은 친구',
    myMissions: '나의 퀘스트',
    allMissionsComplete: '모든 미션 완료!',
    oneThingToDo: '다음 미션',
    walletMissionDescription: '시작 준비가 끝났어요.',
    appMissionDescription:
      '서로 다른 앱 3개에서 활동하고 B3TR를 받아보세요.',
    voteMissionDescription:
      'B3TR를 VOT3로 바꾸고 한 번 투표하세요.',
    complete: '완료',
    inProgress: '진행 중',
    locked: '잠김',
    demoComplete: '데모: 미션 완료 보기',
    autoProgress:
      '미션 진행 상황은 실제 활동 후 자동으로 반영돼요.',
    activationConfirmed:
      '모든 미션 완료! 이제 초대 1회가 열렸어요.',
    requestNewLink: '친구에게 새 초대 링크를 요청해 주세요.',
    existingHelp:
      '이 지갑은 초대 없이도 VeBetterDAO를 계속 이용할 수 있어요.',
    otherHelp:
      '먼저 연결된 초대에서 미션을 계속해 주세요.',
    tryAgain: '잠시 후 다시 시도해 주세요.',
    home: '홈으로',
    demoResult: '데모 결과',
    demoSuccess: '시작 가능',
    demoExisting: '이미 시작한 지갑',
    demoOther: '다른 초대에 연결됨',
    demoReview: '추가 확인',
    errors: {
      invalidLink: '이 링크는 더 이상 사용할 수 없어요.',
      eligibility: '지금은 이 초대를 시작할 수 없어요.',
      existing: '이 지갑은 이미 VeBetterDAO를 시작했어요.',
      other: '이 지갑은 이미 다른 초대와 연결돼 있어요.',
      complete: '미션 완료 상태를 불러오지 못했어요.',
    },
  },
  en: {
    languageContinue: 'Continue in English',
    languageChanged: 'English',
    invitationLabel: 'Friend Invite',
    landingTitle1: 'Your friend sent',
    landingTitle2: 'a VeInvite',
    landingDescription:
      'Connect your wallet and finish the first mission to unlock one invite of your own.',
    eligibilityTitle: 'Who can start?',
    eligibilityDescription:
      'You can use an existing VeChain wallet if you have not started VeBetterDAO yet.',
    start: 'Start',
    connectWalletTitle: 'Connect your wallet to start',
    connectWalletDescription:
      'Connect your wallet to continue the invite and unlock your first mission.',
    connectWallet: 'Connect Wallet',
    walletConnected: 'Connected wallet',
    checkEligibility: 'Start Quest',
    connectThenContinue: 'Connect your wallet first',
    checkingTitle: 'Preparing your quest',
    checkingDescription:
      'We are checking the invite link, connecting your wallet, and loading the missions.',
    checkingLink: 'Checking invite link',
    checkingHistory: 'Connecting wallet',
    checkingOtherInvite: 'Preparing missions',
    reviewTitle: 'One more check is needed',
    reviewDescription:
      'You can continue from this screen as soon as the check is complete.',
    successTitle: 'Quest started!',
    successDescription:
      'Complete each mission to unlock the reward at the end.',
    walletMission: 'Connect wallet',
    appMission: 'Try 3 VeBetter apps',
    voteMission: 'Cast your first vote',
    viewMissions: 'Start Missions',
    invitedFriend: 'Invited Friend',
    myMissions: 'My Quest',
    allMissionsComplete: 'All missions complete!',
    oneThingToDo: 'Next Mission',
    walletMissionDescription: 'You are ready to begin.',
    appMissionDescription:
      'Use three different apps and collect B3TR.',
    voteMissionDescription:
      'Convert B3TR to VOT3 and cast one vote.',
    complete: 'Complete',
    inProgress: 'In progress',
    locked: 'Locked',
    demoComplete: 'Demo: Show mission completion',
    autoProgress:
      'Mission progress updates automatically after your activity.',
    activationConfirmed:
      'Quest complete! You have unlocked one invite.',
    requestNewLink: 'Ask your friend for a new invite link.',
    existingHelp:
      'You can keep using VeBetterDAO without this invite.',
    otherHelp:
      'Continue the mission from the invite already connected to this wallet.',
    tryAgain: 'Please try again in a moment.',
    home: 'Home',
    demoResult: 'Demo result',
    demoSuccess: 'Ready to start',
    demoExisting: 'Already started',
    demoOther: 'Connected to another invite',
    demoReview: 'Extra check',
    errors: {
      invalidLink: 'This link is no longer available.',
      eligibility: 'This invite cannot be started right now.',
      existing: 'This wallet has already started VeBetterDAO.',
      other: 'This wallet is already connected to another invite.',
      complete: 'We could not load the mission result.',
    },
  },
} as const;

export function InviteeClient({ code }: { code: string }) {
  const wallet = useActiveWallet();
  const { open: openConnectModal } = useConnectModal();
  const { setLanguage: setKitLanguage } = useCurrentLanguage();

  const [invite, setInvite] = useState<InviteRecord | null>(null);
  const [step, setStep] = useState<Step>('landing');
  const [errorCode, setErrorCode] = useState<ErrorCode>('invalidLink');
  const [demoOutcome, setDemoOutcome] = useState<
    'success' | 'existing' | 'other' | 'review'
  >('success');

  const [locale, setLocale] = useState<Locale>('en');
  const [languageReady, setLanguageReady] = useState(false);
  const [showLanguageSetup, setShowLanguageSetup] = useState(true);

  const t = COPY[locale];
  const demoMode =
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  useEffect(() => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const queryLanguage = new URLSearchParams(window.location.search).get('lang');

    const savedLocale: Locale | null =
      saved === 'ko' || saved === 'en' ? saved : null;
    const queryLocale: Locale | null =
      queryLanguage === 'ko' || queryLanguage === 'en'
        ? queryLanguage
        : null;
    const browserLocale: Locale = window.navigator.language
      .toLowerCase()
      .startsWith('ko')
      ? 'ko'
      : 'en';

    const initialLocale = queryLocale ?? savedLocale ?? browserLocale;

    setLocale(initialLocale);
    setShowLanguageSetup(!savedLocale && !queryLocale);
    document.documentElement.lang = initialLocale;
    setLanguageReady(true);
  }, []);

  useEffect(() => {
    if (!languageReady) {
      return;
    }

    setKitLanguage(locale);
  }, [languageReady, locale, setKitLanguage]);

  useEffect(() => {
    void fetch(`/api/invites/${code}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();

        if (!response.ok) {
          throw new Error('INVALID_INVITE');
        }

        setInvite(data.invite);
      })
      .catch(() => {
        setErrorCode('invalidLink');
        setStep('error');
      });
  }, [code]);

  const saveLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    setKitLanguage(nextLocale);
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
    window.dispatchEvent(
      new CustomEvent('veinvite-language-change', {
        detail: nextLocale,
      }),
    );
  };

  const confirmLanguage = () => {
    saveLocale(locale);
    setShowLanguageSetup(false);
  };

  const changeLocale = (nextLocale: Locale) => {
    saveLocale(nextLocale);
  };

  const claim = async () => {
    if (!wallet) {
      setStep('wallet');
      return;
    }

    setStep('checking');
    await new Promise((resolve) => setTimeout(resolve, 850));

    const response = await fetch(`/api/invites/${code}/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inviteeAddress: wallet,
        demoOutcome: demoOutcome === 'success' ? undefined : demoOutcome,
      }),
    });

    const data = await response.json();

    if (response.status === 202 || data.outcome === 'review') {
      setStep('review');
      return;
    }

    if (!response.ok) {
      if (demoOutcome === 'existing') {
        setErrorCode('existing');
      } else if (demoOutcome === 'other') {
        setErrorCode('other');
      } else {
        setErrorCode('eligibility');
      }

      setStep('error');
      return;
    }

    setInvite(data.invite);
    setStep('success');
  };

  const completeMissions = async () => {
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
  };

  if (!languageReady) {
    return (
      <main className="centeredFlow">
        <Brand compact />
      </main>
    );
  }

  if (showLanguageSetup) {
    return (
      <LanguageSelectV2
        locale={locale}
        onSelect={setLocale}
        onContinue={confirmLanguage}
      />
    );
  }

  if (step === 'error') {
    return (
      <Centered locale={locale} onLocaleChange={changeLocale}>
        <div className="errorIcon">×</div>
        <h1>{t.errors[errorCode]}</h1>
        <p className="muted">
          {errorCode === 'invalidLink'
            ? t.requestNewLink
            : errorCode === 'existing'
              ? t.existingHelp
              : errorCode === 'other'
                ? t.otherHelp
                : t.tryAgain}
        </p>
        <Link className="secondaryButton linkButton" href="/">
          {t.home}
        </Link>
      </Centered>
    );
  }

  if (step === 'review') {
    return (
      <Centered locale={locale} onLocaleChange={changeLocale}>
        <div className="reviewIcon">◷</div>
        <h1>{t.reviewTitle}</h1>
        <p className="muted">{t.reviewDescription}</p>
      </Centered>
    );
  }

  if (step === 'checking') {
    return (
      <Centered locale={locale} onLocaleChange={changeLocale}>
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
      <Centered locale={locale} onLocaleChange={changeLocale}>
        <div className="walletVisual" />
        <h1>{t.connectWalletTitle}</h1>
        <p className="muted">{t.connectWalletDescription}</p>

        {!wallet ? (
          <button
            type="button"
            className="secondaryButton"
            onClick={() => openConnectModal()}
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
    return (
      <Centered locale={locale} onLocaleChange={changeLocale}>
        <div className="successCircle">✓</div>
        <h1>{t.successTitle}</h1>
        <p className="muted">{t.successDescription}</p>

        <div className="missionSummary">
          <span>✓ {t.walletMission}</span>
          <span>2. {t.appMission}</span>
          <span>3. {t.voteMission}</span>
        </div>

        <button
          type="button"
          className="primaryButton greenButton"
          onClick={() => setStep('missions')}
        >
          {t.viewMissions}
        </button>
      </Centered>
    );
  }

  if (step === 'missions') {
    const completed = invite?.status === 'COMPLETED';

    return (
      <main className="appShell">
        <header className="appHeader">
          <Brand />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span className="chip">{t.invitedFriend}</span>
            <LanguageSwitcher
              locale={locale}
              onChange={changeLocale}
              inline
            />
          </div>
        </header>

        <section className="panel missionPanel">
          <span className="eyebrow">{t.myMissions}</span>
          <h1>
            {completed ? t.allMissionsComplete : t.oneThingToDo}
          </h1>

          <div className="mission done">
            <span>✓</span>
            <div>
              <b>{t.walletMission}</b>
              <p>{t.walletMissionDescription}</p>
            </div>
            <em>{t.complete}</em>
          </div>

          <div
            className={`mission ${completed ? 'done' : 'current'}`}
          >
            <span>{completed ? '✓' : '◎'}</span>
            <div>
              <b>{t.appMission}</b>
              <p>{t.appMissionDescription}</p>
            </div>
            <em>{completed ? t.complete : t.inProgress}</em>
          </div>

          <div
            className={`mission ${completed ? 'done' : 'locked'}`}
          >
            <span>{completed ? '✓' : '◇'}</span>
            <div>
              <b>{t.voteMission}</b>
              <p>{t.voteMissionDescription}</p>
            </div>
            <em>{completed ? t.complete : t.locked}</em>
          </div>

          {!completed && demoMode ? (
            <button
              type="button"
              className="secondaryButton"
              onClick={() => void completeMissions()}
            >
              {t.demoComplete}
            </button>
          ) : !completed ? (
            <div className="notice">
              {t.autoProgress}
            </div>
          ) : (
            <div className="notice successNotice">
              {t.activationConfirmed}
            </div>
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
      onLocaleChange={changeLocale}
      onBeginnerStart={() => {
        setStep('wallet');
      }}
      onExistingWallet={() => {
        if (wallet) {
          void claim();
        } else {
          setStep('wallet');
        }
      }}
      onDemoOutcomeChange={setDemoOutcome}
    />
  );
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
      <LanguageSwitcher
        locale={locale}
        onChange={onLocaleChange}
      />
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
      style={
        inline
          ? {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 10px',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.06)',
              color: '#f8f7ff',
              zIndex: 20,
            }
          : {
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
            }
      }
    >
      <span aria-hidden="true">🌐</span>

      <select
        aria-label="Language"
        value={locale}
        onChange={(event) =>
          onChange(event.target.value as Locale)
        }
        style={{
          border: 0,
          outline: 0,
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        <option value="ko" style={{ color: '#111421' }}>
          한국어
        </option>
        <option value="en" style={{ color: '#111421' }}>
          English
        </option>
      </select>
    </label>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 8)}···${address.slice(-6)}`;
}
