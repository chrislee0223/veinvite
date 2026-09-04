'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { LEGAL_RETURN_STORAGE_KEY } from './LegalNavigationMemory';
import '@/lib/i18n/localePacks/registerExpandedLocales';
import { LEGAL_BACK_LABEL } from '@/lib/i18n/legalNavigationCopy';
import {
  LEGAL_COPY,
  type LegalDocumentKind,
} from '@/lib/i18n/legalCopy';
import { PRIVACY_USAGE_ANALYTICS_COPY } from '@/lib/i18n/privacyUsageAnalyticsCopy';
import { PRIVACY_WALLET_LANGUAGE_COPY } from '@/lib/i18n/privacyWalletLanguageCopy';
import {
  LANGUAGE_STORAGE_KEY,
  getLocaleDirection,
  getLocaleTypography,
  isLocale,
  resolveBrowserLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';

function resolveInitialLocale(): SupportedLocale {
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLocale(saved)
    ? saved
    : resolveBrowserLocale(window.navigator.languages, 'en');
}

export function LocalizedLegalPage({
  kind,
}: {
  kind: LegalDocumentKind;
}) {
  const [locale, setLocale] = useState<SupportedLocale>('en');

  useEffect(() => {
    const applyLocale = (value?: unknown) => {
      const nextLocale = isLocale(value)
        ? value
        : resolveInitialLocale();
      setLocale(nextLocale);
      document.documentElement.lang = nextLocale;
      document.documentElement.dir = getLocaleDirection(nextLocale);
      document.documentElement.dataset.localeTypography =
        getLocaleTypography(nextLocale);
    };

    applyLocale();

    const handleLanguageChange = (event: Event) => {
      applyLocale((event as CustomEvent<unknown>).detail);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_STORAGE_KEY) return;
      applyLocale(event.newValue);
    };

    window.addEventListener(
      'veinvite-language-change',
      handleLanguageChange,
    );
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(
        'veinvite-language-change',
        handleLanguageChange,
      );
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const handleBack = () => {
    const returnOrigin = window.sessionStorage.getItem(
      LEGAL_RETURN_STORAGE_KEY,
    );
    window.sessionStorage.removeItem(LEGAL_RETURN_STORAGE_KEY);

    if (returnOrigin && window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.assign('/');
  };

  const copy = LEGAL_COPY[kind][locale] ?? LEGAL_COPY[kind].en;
  const usageAnalyticsCopy =
    kind === 'privacy' ? PRIVACY_USAGE_ANALYTICS_COPY[locale] : null;
  const walletLanguageCopy =
    kind === 'privacy' ? PRIVACY_WALLET_LANGUAGE_COPY[locale] : null;
  const backLabel = LEGAL_BACK_LABEL[locale];
  const backArrow = getLocaleDirection(locale) === 'rtl' ? '→' : '←';

  return (
    <main className="legalPage" lang={locale} dir={getLocaleDirection(locale)}>
      <button
        type="button"
        className="legalBackTop"
        onClick={handleBack}
        aria-label={backLabel}
      >
        <span aria-hidden="true">{backArrow}</span>
        {backLabel}
      </button>

      <header className="legalHeader">
        <span>{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{walletLanguageCopy?.updated ?? usageAnalyticsCopy?.updated ?? copy.updated}</p>
      </header>

      <p className="legalIntro">{copy.intro}</p>

      <div className="legalSections">
        {copy.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            <p>{section.body}</p>
          </section>
        ))}
        {usageAnalyticsCopy ? (
          <section key="usage-analytics-privacy">
            <h2>{usageAnalyticsCopy.heading}</h2>
            <p>{usageAnalyticsCopy.body}</p>
          </section>
        ) : null}
        {walletLanguageCopy ? (
          <section key="wallet-language-privacy">
            <h2>{walletLanguageCopy.heading}</h2>
            <p>{walletLanguageCopy.body}</p>
          </section>
        ) : null}
      </div>

      <Link
        className="legalBack"
        href="/"
        onClick={() =>
          window.sessionStorage.removeItem(LEGAL_RETURN_STORAGE_KEY)
        }
      >
        <span aria-hidden="true">{backArrow}</span>
        {copy.back}
      </Link>

      <style jsx>{`
        .legalPage {
          width:min(100%,760px);
          min-height:100svh;
          box-sizing:border-box;
          margin:0 auto;
          padding:34px 22px 72px;
          color:#f8f6ef;
        }
        .legalBackTop {
          min-height:44px;
          padding:0 13px;
          display:inline-flex;
          align-items:center;
          gap:8px;
          border:1px solid rgba(255,255,255,.09);
          border-radius:13px;
          background:rgba(255,255,255,.035);
          color:#d9d4c8;
          font:inherit;
          font-size:.8rem;
          font-weight:850;
          cursor:pointer;
        }
        .legalBackTop:hover,.legalBackTop:focus-visible {
          border-color:rgba(244,183,40,.42);
          color:#f4c85a;
          outline:none;
          box-shadow:0 0 0 3px rgba(244,183,40,.08);
        }
        .legalBackTop span {
          color:#f4c85a;
          font-size:1rem;
        }
        .legalHeader {
          margin-top:24px;
          padding-bottom:22px;
          border-bottom:1px solid rgba(255,255,255,.09);
        }
        .legalHeader > span {
          color:#f4b728;
          font-size:.72rem;
          font-weight:950;
          letter-spacing:.12em;
        }
        .legalHeader h1 {
          margin:9px 0 0;
          font-size:clamp(2rem,7vw,3rem);
          line-height:1.08;
          letter-spacing:-.045em;
          text-wrap:balance;
        }
        .legalHeader p {
          margin:10px 0 0;
          color:#8f8a80;
          font-size:.78rem;
        }
        .legalIntro {
          margin:26px 0 0;
          color:#d4d0c7;
          font-size:.98rem;
          line-height:1.8;
          text-wrap:pretty;
        }
        .legalSections {
          display:grid;
          gap:27px;
          margin-top:34px;
        }
        .legalSections section {
          padding:0;
        }
        .legalSections h2 {
          margin:0;
          color:#f4c85a;
          font-size:1.02rem;
          line-height:1.4;
          text-wrap:balance;
        }
        .legalSections p {
          margin:9px 0 0;
          color:#b7b2a8;
          font-size:.91rem;
          line-height:1.82;
          text-wrap:pretty;
        }
        .legalBack {
          width:max-content;
          max-width:100%;
          min-height:46px;
          margin-top:38px;
          padding:0 14px;
          display:inline-flex;
          align-items:center;
          gap:8px;
          border:1px solid rgba(244,183,40,.22);
          border-radius:13px;
          background:rgba(244,183,40,.07);
          color:#f4c85a;
          font-size:.81rem;
          font-weight:850;
          text-decoration:none;
        }
        .legalBack:hover,.legalBack:focus-visible {
          border-color:rgba(244,183,40,.5);
          outline:none;
          box-shadow:0 0 0 3px rgba(244,183,40,.08);
        }
        @media (max-width:560px) {
          .legalPage {
            padding:20px 16px 58px;
          }
          .legalHeader {
            margin-top:20px;
          }
        }
      `}</style>
    </main>
  );
}
