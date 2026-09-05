'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
} from 'react';
import Link from 'next/link';

import { LanguageFlag } from './LanguageFlag';
import {
  TransientSnackbar,
  type TransientFeedback,
} from './TransientSnackbar';
import { getLanguagePickerCopy } from '@/lib/i18n/languagePickerCopy';
import { SETTINGS_COPY } from '@/lib/i18n/settingsCopy';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import {
  LANGUAGE_OPTIONS,
  getLanguageOption,
  type LanguageOption,
  type Locale,
  type SupportedLocale,
} from '@/lib/i18n/locales';

const LANGUAGE_MODAL_CLOSE_FALLBACK_MS = 280;

function maskWallet(address: string): string {
  return `${address.slice(0, 8)}···${address.slice(-6)}`;
}

function normalizeLanguageSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function compareLanguageOptions(
  left: LanguageOption,
  right: LanguageOption,
): number {
  const byNativeName = left.nativeName.localeCompare(
    right.nativeName,
    'en',
    { sensitivity: 'base' },
  );

  if (byNativeName !== 0) {
    return byNativeName;
  }

  return left.englishName.localeCompare(
    right.englishName,
    'en',
    { sensitivity: 'base' },
  );
}

type WalletConfirmation = 'switch' | 'disconnect' | null;

export function AppSettings({
  locale,
  wallet,
  isWalletActionPending,
  onLocaleChange,
  onConnect,
  onConnectAnother,
  onDisconnect,
}: {
  locale: Locale;
  wallet: string | null;
  isWalletActionPending: boolean;
  onLocaleChange: (locale: SupportedLocale) => void;
  onConnect: () => void;
  onConnectAnother: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const [feedback, setFeedback] = useState<TransientFeedback | null>(null);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageClosing, setLanguageClosing] = useState(false);
  const [languageQuery, setLanguageQuery] = useState('');
  const [walletConfirmation, setWalletConfirmation] =
    useState<WalletConfirmation>(null);
  const feedbackIdRef = useRef(0);
  const languageTriggerRef = useRef<HTMLButtonElement | null>(null);
  const languageDialogRef = useRef<HTMLDivElement | null>(null);
  const selectedLanguageRef = useRef<HTMLButtonElement | null>(null);
  const languageCloseFallbackRef = useRef<number | null>(null);
  const pendingLanguageRef = useRef<SupportedLocale | null>(null);
  const walletConfirmationDialogRef = useRef<HTMLDivElement | null>(null);
  const walletConfirmationCancelRef = useRef<HTMLButtonElement | null>(null);
  const walletConfirmationOpenerRef = useRef<HTMLButtonElement | null>(null);
  const t = SETTINGS_COPY[locale];
  const languageCopy = getLanguagePickerCopy(locale);
  const currentLanguage = getLanguageOption(locale);
  const normalizedLanguageQuery =
    normalizeLanguageSearch(languageQuery);
  const visibleLanguageOptions = LANGUAGE_OPTIONS
    .filter(
      (option) =>
        option.locale !== currentLanguage.locale,
    )
    .filter((option) => {
      if (!normalizedLanguageQuery) {
        return true;
      }

      return [
        option.nativeName,
        option.englishName,
        option.locale,
      ].some((value) =>
        normalizeLanguageSearch(value).includes(
          normalizedLanguageQuery,
        ),
      );
    })
    .sort(compareLanguageOptions);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const showWalletError = useCallback((text: string) => {
    feedbackIdRef.current += 1;
    setFeedback({
      id: feedbackIdRef.current,
      kind: 'error',
      text,
    });
  }, []);

  const runWalletAction = async (action: () => Promise<void>) => {
    clearFeedback();
    try {
      await action();
    } catch (actionError) {
      console.error('Wallet settings action failed:', actionError);
      showWalletError(t.actionError);
    }
  };

  const clearLanguageCloseFallback = useCallback(() => {
    if (languageCloseFallbackRef.current === null) return;
    window.clearTimeout(languageCloseFallbackRef.current);
    languageCloseFallbackRef.current = null;
  }, []);

  const finishLanguagePickerClose = useCallback(() => {
    clearLanguageCloseFallback();
    const nextLocale = pendingLanguageRef.current;
    pendingLanguageRef.current = null;
    setLanguageOpen(false);
    setLanguageClosing(false);
    setLanguageQuery('');

    if (
      nextLocale &&
      nextLocale !== currentLanguage.locale
    ) {
      onLocaleChange(nextLocale);
    }

    window.requestAnimationFrame(() =>
      languageTriggerRef.current?.focus(),
    );
  }, [
    clearLanguageCloseFallback,
    currentLanguage.locale,
    onLocaleChange,
  ]);

  const closeLanguagePicker = useCallback((
    nextLocale: SupportedLocale | null = null,
  ) => {
    if (!languageOpen || languageClosing) return;

    pendingLanguageRef.current =
      nextLocale && nextLocale !== currentLanguage.locale
        ? nextLocale
        : null;

    if (
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      finishLanguagePickerClose();
      return;
    }

    clearLanguageCloseFallback();
    setLanguageClosing(true);
    languageCloseFallbackRef.current = window.setTimeout(
      finishLanguagePickerClose,
      LANGUAGE_MODAL_CLOSE_FALLBACK_MS,
    );
  }, [
    clearLanguageCloseFallback,
    currentLanguage.locale,
    finishLanguagePickerClose,
    languageClosing,
    languageOpen,
  ]);

  const openLanguagePicker = useCallback(() => {
    clearFeedback();
    clearLanguageCloseFallback();
    pendingLanguageRef.current = null;
    setLanguageClosing(false);
    setLanguageOpen(true);
  }, [clearFeedback, clearLanguageCloseFallback]);

  const closeWalletConfirmation = useCallback(() => {
    setWalletConfirmation(null);
    window.requestAnimationFrame(() =>
      walletConfirmationOpenerRef.current?.focus(),
    );
  }, []);

  const openWalletConfirmation = (
    action: Exclude<WalletConfirmation, null>,
    opener: HTMLButtonElement,
  ) => {
    clearFeedback();
    walletConfirmationOpenerRef.current = opener;
    setWalletConfirmation(action);
  };

  useEffect(() => () => {
    clearLanguageCloseFallback();
  }, [clearLanguageCloseFallback]);

  useEffect(() => {
    if (!languageOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [languageOpen]);

  useEffect(() => {
    if (!languageOpen) return;
    const focusFrame = window.requestAnimationFrame(() =>
      selectedLanguageRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(focusFrame);
  }, [languageOpen]);

  useEffect(() => {
    if (!languageOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLanguagePicker();
        return;
      }

      if (event.key !== 'Tab' || !languageDialogRef.current) return;

      const focusable = Array.from(
        languageDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length < 1) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [languageOpen, closeLanguagePicker]);

  useEffect(() => {
    if (!walletConfirmation) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() =>
      walletConfirmationCancelRef.current?.focus(),
    );

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeWalletConfirmation();
        return;
      }

      if (
        event.key !== 'Tab' ||
        !walletConfirmationDialogRef.current
      ) {
        return;
      }

      const focusable = Array.from(
        walletConfirmationDialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );

      if (focusable.length < 1) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [walletConfirmation, closeWalletConfirmation]);

  const handleLanguageModalAnimationEnd = (
    event: ReactAnimationEvent<HTMLDivElement>,
  ) => {
    if (
      event.target !== event.currentTarget ||
      !languageClosing
    ) {
      return;
    }
    finishLanguagePickerClose();
  };

  const confirmWalletAction = async () => {
    const action = walletConfirmation;
    if (!action) return;

    setWalletConfirmation(null);
    if (action === 'switch') {
      await runWalletAction(onConnectAnother);
      return;
    }
    await runWalletAction(onDisconnect);
  };

  const switchConfirmation = walletConfirmation === 'switch';

  return (
    <section className="settingsPage">
      <header><span>{t.eyebrow}</span><h1>{t.title}</h1></header>

      <section className="settingsCard">
        <div className="cardHeading">
          <h2>{t.walletTitle}</h2>
          {wallet ? <span className="connectedBadge"><i />{t.connected}</span> : null}
        </div>

        {wallet ? (
          <>
            <code>{maskWallet(wallet)}</code>
            <p>{t.walletNote}</p>
            <p>{t.switchNote}</p>
            <div className="walletActions">
              <button
                type="button"
                className="primarySettingAction"
                disabled={isWalletActionPending}
                onClick={(event) =>
                  openWalletConfirmation('switch', event.currentTarget)
                }
              >
                {isWalletActionPending ? t.working : t.connectAnother}
              </button>
              <button
                type="button"
                className="secondarySettingAction"
                disabled={isWalletActionPending}
                onClick={(event) =>
                  openWalletConfirmation('disconnect', event.currentTarget)
                }
              >
                {t.disconnect}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>{t.notConnected}</p>
            <button
              type="button"
              className="primarySettingAction"
              onClick={() => {
                clearFeedback();
                onConnect();
              }}
            >
              {t.connect}
            </button>
          </>
        )}
      </section>

      <section className="settingsCard languageCard">
        <h2>{t.languageTitle}</h2>
        <button
          ref={languageTriggerRef}
          type="button"
          className="languagePickerTrigger"
          aria-haspopup="dialog"
          aria-expanded={languageOpen}
          aria-controls="settings-language-dialog"
          onClick={openLanguagePicker}
        >
          <span className="languageSymbol" aria-hidden="true"><LanguageFlag locale={currentLanguage.locale} /></span>
          <span className="languagePickerCopy">
            <strong dir={currentLanguage.direction}>{currentLanguage.nativeName}</strong>
            <small>{t.languageNote}</small>
          </span>
          <span className="languageChevron" aria-hidden="true">›</span>
        </button>
      </section>

      <section className="settingsCard legalCard">
        <h2>{t.legalTitle}</h2>
        <Link href="/privacy">{t.privacy}<span aria-hidden="true">›</span></Link>
        <Link href="/terms">{t.terms}<span aria-hidden="true">›</span></Link>
      </section>

      {walletConfirmation ? (
        <div
          className="confirmationBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeWalletConfirmation();
            }
          }}
        >
          <div
            ref={walletConfirmationDialogRef}
            className="confirmationModal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="wallet-confirmation-title"
            aria-describedby="wallet-confirmation-body"
          >
            <div className="confirmationIcon" aria-hidden="true">
              {switchConfirmation ? '↔' : '⏻'}
            </div>
            <h2 id="wallet-confirmation-title">
              {switchConfirmation
                ? t.switchConfirmTitle
                : t.disconnectConfirmTitle}
            </h2>
            <p id="wallet-confirmation-body">
              {switchConfirmation
                ? t.switchConfirmBody
                : t.disconnectConfirmBody}
            </p>
            <div className="confirmationActions">
              <button
                ref={walletConfirmationCancelRef}
                type="button"
                className="confirmationCancel"
                onClick={closeWalletConfirmation}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                className={
                  switchConfirmation
                    ? 'confirmationConfirm'
                    : 'confirmationConfirm disconnectConfirm'
                }
                disabled={isWalletActionPending}
                onClick={() => void confirmWalletAction()}
              >
                {isWalletActionPending
                  ? t.working
                  : switchConfirmation
                    ? t.switchConfirmAction
                    : t.disconnectConfirmAction}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {languageOpen ? (
        <div
          className={
            languageClosing
              ? 'languageModalBackdrop closing'
              : 'languageModalBackdrop'
          }
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              closeLanguagePicker();
            }
          }}
        >
          <div
            id="settings-language-dialog"
            ref={languageDialogRef}
            className={
              languageClosing
                ? 'languageModal closing'
                : 'languageModal'
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-language-dialog-title"
            aria-describedby="settings-language-dialog-note"
            onAnimationEnd={handleLanguageModalAnimationEnd}
          >
            <div className="languageModalHeader">
              <div>
                <h2 id="settings-language-dialog-title">{t.languageTitle}</h2>
                <p id="settings-language-dialog-note">{t.languageNote}</p>
              </div>
              <button type="button" className="languageClose" aria-label={t.close} onClick={() => closeLanguagePicker()}>×</button>
            </div>

            <div className="selectedLanguageBlock">
              <button
                ref={selectedLanguageRef}
                type="button"
                className="languageOption selected"
                aria-pressed="true"
                onClick={() => closeLanguagePicker()}
              >
                <span className="languageOptionSymbol" aria-hidden="true"><LanguageFlag locale={currentLanguage.locale} /></span>
                <span className="languageOptionCopy">
                  <strong dir={currentLanguage.direction}>{currentLanguage.nativeName}</strong>
                  {currentLanguage.englishName !== currentLanguage.nativeName ? (
                    <small dir="ltr">{currentLanguage.englishName}</small>
                  ) : null}
                </span>
                <span className="languageCheck" aria-hidden="true">✓</span>
              </button>
            </div>

            <label className="languageSearch">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={languageQuery}
                onChange={(event) => setLanguageQuery(event.target.value)}
                placeholder={languageCopy.searchPlaceholder}
                aria-label={languageCopy.searchPlaceholder}
                autoComplete="off"
                spellCheck={false}
                dir="auto"
              />
            </label>

            <div className="languageOptionList" role="group" aria-label={t.languageTitle}>
              {visibleLanguageOptions.length > 0 ? (
                visibleLanguageOptions.map((option) => (
                  <button
                    key={option.locale}
                    type="button"
                    className="languageOption"
                    aria-pressed="false"
                    onClick={() => closeLanguagePicker(option.locale)}
                  >
                    <span className="languageOptionSymbol" aria-hidden="true"><LanguageFlag locale={option.locale} /></span>
                    <span className="languageOptionCopy">
                      <strong dir={option.direction}>{option.nativeName}</strong>
                      {option.englishName !== option.nativeName ? (
                        <small dir="ltr">{option.englishName}</small>
                      ) : null}
                    </span>
                    <span className="languageCheck" aria-hidden="true" />
                  </button>
                ))
              ) : (
                <div className="languageNoResults" role="status">
                  {languageCopy.noResults}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <TransientSnackbar
        feedback={feedback}
        closeLabel={NOTIFICATION_COPY[locale].closeAria}
        onDismiss={clearFeedback}
      />

      <style jsx>{`
        .settingsPage { width:min(100%,560px); margin:0 auto; padding-bottom:12px; }
        header > span { color:#f8bc2e; font-size:.7rem; font-weight:950; letter-spacing:.12em; }
        h1 { margin:8px 0 0; font-size:clamp(2rem,8vw,2.75rem); line-height:1.05; letter-spacing:-.05em; overflow-wrap:anywhere; }
        .settingsCard { box-sizing:border-box; margin-top:18px; padding:19px; border:1px solid rgba(255,205,80,.14); border-radius:21px; background:rgba(255,255,255,.035); }
        .cardHeading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        h2 { margin:0; font-size:1rem; letter-spacing:-.02em; }
        p { margin:9px 0 0; color:#8f8b83; font-size:.76rem; line-height:1.55; overflow-wrap:anywhere; }
        code { display:block; margin-top:14px; padding:12px 13px; border-radius:13px; background:#11120f; color:#f4ca5a; font-size:.78rem; overflow-wrap:anywhere; }
        .connectedBadge { min-height:25px; padding:0 9px; display:inline-flex; align-items:center; gap:6px; border:1px solid rgba(69,218,151,.18); border-radius:999px; color:#71e9ae; font-size:.65rem; font-weight:900; }
        .connectedBadge i { width:6px; height:6px; border-radius:50%; background:#5ae6a5; }
        .walletActions { margin-top:15px; display:grid; gap:9px; }
        .primarySettingAction,.secondarySettingAction { width:100%; min-height:46px; border-radius:14px; font:inherit; font-size:.78rem; font-weight:900; cursor:pointer; }
        .primarySettingAction { margin-top:15px; border:0; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; }
        .walletActions .primarySettingAction { margin-top:0; }
        .secondarySettingAction { border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.04); color:#ddd9cf; }
        button:disabled { opacity:.48; cursor:not-allowed; }
        .languageCard { padding-bottom:16px; }
        .languagePickerTrigger { width:100%; min-height:66px; margin-top:13px; padding:10px 12px; display:grid; grid-template-columns:34px minmax(0,1fr) 24px; align-items:center; gap:11px; border:1px solid rgba(255,255,255,.09); border-radius:15px; background:rgba(255,255,255,.035); color:#f5f2e9; font:inherit; cursor:pointer; text-align:left; }
        .languagePickerTrigger:hover { border-color:rgba(255,205,80,.3); background:rgba(255,201,61,.055); }
        .languagePickerTrigger:focus-visible { outline:2px solid rgba(255,205,80,.75); outline-offset:2px; }
        .languageSymbol,.languageOptionSymbol { display:grid; place-items:center; overflow:hidden; border-radius:7px; background:transparent; box-shadow:0 0 0 1px rgba(255,255,255,.14); }
        .languageSymbol { width:34px; height:23px; }
        .languageOptionSymbol { width:32px; height:22px; }
        .languageSymbol :global(svg),.languageOptionSymbol :global(svg),.languageSymbol :global(img),.languageOptionSymbol :global(img) { width:100%; height:100%; display:block; object-fit:contain; }
        .languagePickerCopy { min-width:0; display:grid; gap:3px; text-align:left; }
        .languagePickerCopy strong { font-size:.82rem; overflow-wrap:anywhere; unicode-bidi:isolate; }
        .languagePickerCopy small { color:#8e897f; font-size:.67rem; line-height:1.35; overflow-wrap:anywhere; }
        .languageChevron { color:#a49f94; font-size:1.45rem; line-height:1; text-align:center; }
        .legalCard :global(a) { min-height:48px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-top:1px solid rgba(255,255,255,.06); color:#e7e3d8; font-size:.78rem; font-weight:800; text-decoration:none; }
        .legalCard h2 { margin-bottom:8px; }
        .confirmationBackdrop,.languageModalBackdrop { position:fixed; z-index:1450; inset:0; box-sizing:border-box; display:grid; place-items:center; padding:20px; background:rgba(0,0,0,.72); backdrop-filter:blur(8px); }
        .languageModalBackdrop { animation:languageBackdropIn 180ms ease-out both; }
        .languageModalBackdrop.closing { animation:languageBackdropOut 140ms ease-in both; }
        .confirmationModal { width:min(100%,410px); box-sizing:border-box; padding:22px; border:1px solid rgba(255,205,80,.24); border-radius:24px; background:linear-gradient(155deg,#241b0d,#11110f 56%); box-shadow:0 30px 90px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.06); text-align:center; }
        .confirmationIcon { width:42px; height:42px; margin:0 auto 13px; display:grid; place-items:center; border:1px solid rgba(255,205,80,.25); border-radius:13px; background:rgba(244,183,40,.09); color:#f4bd35; font-size:1.1rem; font-weight:900; }
        .confirmationModal h2 { font-size:1.05rem; }
        .confirmationModal p { max-width:330px; margin:9px auto 0; color:#969188; }
        .confirmationActions { margin-top:18px; display:grid; grid-template-columns:1fr 1.25fr; gap:9px; }
        .confirmationCancel,.confirmationConfirm { min-height:46px; border-radius:14px; font:inherit; font-size:.75rem; font-weight:900; cursor:pointer; }
        .confirmationCancel { border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.04); color:#d8d4ca; }
        .confirmationConfirm { border:0; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; }
        .confirmationConfirm.disconnectConfirm { border:1px solid rgba(255,170,120,.28); background:rgba(255,130,80,.11); color:#ffc19a; }
        .confirmationCancel:focus-visible,.confirmationConfirm:focus-visible { outline:2px solid rgba(255,205,80,.75); outline-offset:2px; }
        .languageModal { --language-modal-offset:8px; width:min(100%,430px); max-height:min(78dvh,680px); min-height:0; box-sizing:border-box; padding:20px; display:flex; flex-direction:column; overflow:hidden; border:1px solid rgba(255,205,80,.24); border-radius:24px; background:linear-gradient(155deg,#241b0d,#11110f 56%); box-shadow:0 30px 90px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.06); animation:languageModalIn 180ms cubic-bezier(.2,.8,.2,1) both; }
        .languageModal.closing { animation:languageModalOut 140ms ease-in both; }
        .languageModalHeader { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
        .languageModalHeader > div { min-width:0; }
        .languageModalHeader p { margin-top:6px; }
        .languageClose { flex:0 0 auto; width:36px; height:36px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.1); border-radius:11px; background:rgba(255,255,255,.04); color:#d9d4ca; font:inherit; font-size:1.2rem; cursor:pointer; }
        .languageClose:focus-visible,.languageOption:focus-visible,.languageSearch:focus-within { outline:2px solid rgba(255,205,80,.75); outline-offset:2px; }
        .selectedLanguageBlock { margin-top:16px; padding-bottom:9px; border-bottom:1px solid rgba(255,255,255,.07); }
        .languageSearch { min-height:46px; margin-top:9px; padding:0 11px; display:grid; grid-template-columns:20px minmax(0,1fr); align-items:center; gap:8px; border:1px solid rgba(255,255,255,.13); border-radius:13px; background:rgba(0,0,0,.19); color:#aaa59b; }
        .languageSearch > span { text-align:center; font-size:1.02rem; line-height:1; }
        .languageSearch input { width:100%; min-width:0; border:0; outline:0; background:transparent; color:#f0ece3; font:inherit; font-size:1rem; line-height:1.25; }
        .languageSearch input::placeholder { color:#98938a; opacity:1; }
        .languageSearch input::-webkit-search-cancel-button { opacity:.72; }
        .languageOptionList { min-height:0; margin-top:9px; display:grid; gap:7px; overflow:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; padding:0 3px 3px 0; scrollbar-width:thin; }
        .languageOption { width:100%; min-height:52px; padding:7px 10px; display:grid; grid-template-columns:32px minmax(0,1fr) 26px; align-items:center; gap:10px; border:1px solid rgba(255,255,255,.09); border-radius:14px; background:rgba(255,255,255,.035); color:#c7c2b9; font:inherit; text-align:left; cursor:pointer; }
        .languageOption:hover { border-color:rgba(255,205,80,.28); }
        .languageOption.selected { border-color:rgba(255,205,80,.52); background:rgba(255,201,61,.11); color:#ffd45f; }
        .languageOptionCopy { min-width:0; display:grid; gap:2px; text-align:left; }
        .languageOptionCopy strong { min-width:0; font-size:.8rem; line-height:1.25; overflow-wrap:anywhere; unicode-bidi:isolate; }
        .languageOptionCopy small { color:#918c82; font-size:.65rem; line-height:1.25; overflow-wrap:anywhere; unicode-bidi:isolate; }
        .languageOption.selected .languageOptionCopy small { color:#b89546; }
        .languageCheck { width:24px; height:24px; display:grid; place-items:center; border-radius:50%; color:#17120a; font-size:.72rem; font-weight:950; }
        .languageOption.selected .languageCheck { background:#f4b728; }
        .languageNoResults { min-height:76px; display:grid; place-items:center; padding:16px; color:#aaa59b; font-size:.78rem; line-height:1.45; text-align:center; }
        @keyframes languageBackdropIn { from { opacity:0; } to { opacity:1; } }
        @keyframes languageBackdropOut { from { opacity:1; } to { opacity:0; } }
        @keyframes languageModalIn { from { opacity:0; transform:translateY(var(--language-modal-offset)); } to { opacity:1; transform:translateY(0); } }
        @keyframes languageModalOut { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(var(--language-modal-offset)); } }
        @media (max-width:560px) {
          .confirmationBackdrop,.languageModalBackdrop { place-items:end center; padding:0; }
          .confirmationModal,.languageModal { width:100%; padding:20px 18px calc(20px + env(safe-area-inset-bottom)); border-radius:26px 26px 0 0; border-bottom:0; }
          .languageModal { --language-modal-offset:14px; max-height:min(82dvh,680px); }
          .confirmationActions { grid-template-columns:1fr; }
          .confirmationCancel { order:2; }
        }
        @media (prefers-reduced-motion: reduce) {
          .languageModalBackdrop,.languageModal { animation:none !important; }
        }
      `}</style>
    </section>
  );
}
