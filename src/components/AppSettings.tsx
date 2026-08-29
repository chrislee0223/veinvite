'use client';

import { useState } from 'react';
import Link from 'next/link';

import { SETTINGS_COPY } from '@/lib/i18n/settingsCopy';
import {
  LANGUAGE_OPTIONS,
  type Locale,
} from '@/lib/i18n/locales';

function maskWallet(address: string): string {
  return `${address.slice(0, 8)}···${address.slice(-6)}`;
}

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
  onLocaleChange: (locale: Locale) => void;
  onConnect: () => void;
  onConnectAnother: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const t = SETTINGS_COPY[locale];

  const runWalletAction = async (action: () => Promise<void>) => {
    setError('');
    try {
      await action();
    } catch (actionError) {
      console.error('Wallet settings action failed:', actionError);
      setError(t.actionError);
    }
  };

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
              <button type="button" className="primarySettingAction" disabled={isWalletActionPending} onClick={() => void runWalletAction(onConnectAnother)}>
                {isWalletActionPending ? t.working : t.connectAnother}
              </button>
              <button type="button" className="secondarySettingAction" disabled={isWalletActionPending} onClick={() => void runWalletAction(onDisconnect)}>
                {t.disconnect}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>{t.notConnected}</p>
            <button type="button" className="primarySettingAction" onClick={onConnect}>{t.connect}</button>
          </>
        )}
        {error ? <p className="errorMessage" role="alert">{error}</p> : null}
      </section>

      <section className="settingsCard">
        <h2>{t.languageTitle}</h2>
        <p>{t.languageNote}</p>
        <div className="languageButtons">
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.locale}
              type="button"
              className={locale === option.locale ? 'selected' : ''}
              aria-pressed={locale === option.locale}
              onClick={() => onLocaleChange(option.locale)}
            >
              <span aria-hidden="true">{option.symbol}</span>
              {option.nativeName}
            </button>
          ))}
        </div>
      </section>

      <section className="settingsCard legalCard">
        <h2>{t.legalTitle}</h2>
        <Link href="/privacy">{t.privacy}<span aria-hidden="true">›</span></Link>
        <Link href="/terms">{t.terms}<span aria-hidden="true">›</span></Link>
      </section>

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
        .errorMessage { color:#ff8d9d; }
        .languageButtons { margin-top:14px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; max-height:330px; overflow:auto; padding-right:2px; }
        .languageButtons button { min-width:0; min-height:48px; padding:8px 10px; display:flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,.09); border-radius:14px; background:rgba(255,255,255,.035); color:#aaa69d; font:inherit; font-size:.75rem; font-weight:850; cursor:pointer; overflow-wrap:anywhere; text-align:left; }
        .languageButtons button > span { flex:0 0 auto; width:25px; height:25px; display:grid; place-items:center; border-radius:8px; background:rgba(255,201,61,.09); color:#f4c54b; font-size:.65rem; }
        .languageButtons button.selected { border-color:rgba(255,205,80,.45); background:rgba(255,201,61,.1); color:#ffd45f; }
        .legalCard :global(a) { min-height:48px; display:flex; align-items:center; justify-content:space-between; gap:12px; border-top:1px solid rgba(255,255,255,.06); color:#e7e3d8; font-size:.78rem; font-weight:800; text-decoration:none; }
        .legalCard h2 { margin-bottom:8px; }
        @media (max-width:390px) { .languageButtons { grid-template-columns:1fr; max-height:310px; } }
      `}</style>
    </section>
  );
}
