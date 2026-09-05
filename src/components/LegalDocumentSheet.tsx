'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import {
  SOFT_FOCUS_MOTION_CSS,
} from './SoftFocusMotion';
import {
  LEGAL_COPY,
  type LegalDocumentKind,
} from '@/lib/i18n/legalCopy';
import { PRIVACY_PRODUCT_ANALYTICS_COPY } from '@/lib/i18n/privacyProductAnalyticsCopy';
import { PRIVACY_USAGE_ANALYTICS_COPY } from '@/lib/i18n/privacyUsageAnalyticsCopy';
import { PRIVACY_WALLET_LANGUAGE_COPY } from '@/lib/i18n/privacyWalletLanguageCopy';
import { SETTINGS_COPY } from '@/lib/i18n/settingsCopy';
import {
  getLocaleDirection,
  type SupportedLocale,
} from '@/lib/i18n/locales';

export function LegalDocumentSheet({
  kind,
  locale,
  visible,
  onRequestClose,
}: {
  kind: LegalDocumentKind;
  locale: SupportedLocale;
  visible: boolean;
  onRequestClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const direction = getLocaleDirection(locale);
  const copy = LEGAL_COPY[kind][locale] ?? LEGAL_COPY[kind].en;
  const usageAnalyticsCopy =
    kind === 'privacy' ? PRIVACY_USAGE_ANALYTICS_COPY[locale] : null;
  const productAnalyticsCopy =
    kind === 'privacy' ? PRIVACY_PRODUCT_ANALYTICS_COPY[locale] : null;
  const walletLanguageCopy =
    kind === 'privacy' ? PRIVACY_WALLET_LANGUAGE_COPY[locale] : null;
  const updated =
    productAnalyticsCopy?.updated ??
    walletLanguageCopy?.updated ??
    usageAnalyticsCopy?.updated ??
    copy.updated;
  const closeLabel = SETTINGS_COPY[locale]?.close ?? SETTINGS_COPY.en.close;
  const titleId = `veinvite-legal-sheet-title-${kind}`;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [kind]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const obscuredDialogs = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
      ),
    ).filter((element) => element !== dialogRef.current);
    const previousAriaHidden = obscuredDialogs.map((element) => ({
      element,
      value: element.getAttribute('aria-hidden'),
    }));
    obscuredDialogs.forEach((element) =>
      element.setAttribute('aria-hidden', 'true'),
    );

    const focusFrame = window.requestAnimationFrame(() =>
      closeRef.current?.focus(),
    );

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onRequestClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
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
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousAriaHidden.forEach(({ element, value }) => {
        if (value === null) {
          element.removeAttribute('aria-hidden');
        } else {
          element.setAttribute('aria-hidden', value);
        }
      });
    };
  }, [onRequestClose]);

  return createPortal(
    <div
      className="veinviteLegalSheetBackdrop veinviteSoftFocusBackdrop"
      data-open={visible ? 'true' : 'false'}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="veinviteLegalSheetPanel veinviteSoftFocusPanel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        lang={locale}
        dir={direction}
      >
        <header className="veinviteLegalSheetHeader">
          <h1 id={titleId}>{copy.title}</h1>
          <button
            ref={closeRef}
            type="button"
            className="veinviteLegalSheetClose"
            onClick={onRequestClose}
            aria-label={closeLabel}
          >
            <span
              className="veinviteLegalSheetCloseMark"
              aria-hidden="true"
            />
          </button>
        </header>

        <div
          ref={scrollRef}
          className="veinviteLegalSheetScroll veinviteSoftFocusScroll"
        >
          <article className="veinviteLegalSheetDocument">
            <div className="veinviteLegalSheetMeta">
              <span>{copy.eyebrow}</span>
              <small>{updated}</small>
            </div>

            <p className="veinviteLegalSheetIntro">{copy.intro}</p>

            <div className="veinviteLegalSheetSections">
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
              {productAnalyticsCopy ? (
                <section key="product-analytics-privacy">
                  <h2>{productAnalyticsCopy.heading}</h2>
                  <p>{productAnalyticsCopy.body}</p>
                </section>
              ) : null}
              {walletLanguageCopy ? (
                <section key="wallet-language-privacy">
                  <h2>{walletLanguageCopy.heading}</h2>
                  <p>{walletLanguageCopy.body}</p>
                </section>
              ) : null}
            </div>
          </article>
        </div>
      </div>

      <style>{`
        ${SOFT_FOCUS_MOTION_CSS}
        .veinviteLegalSheetBackdrop {
          position: fixed;
          z-index: 2200;
          inset: 0;
          box-sizing: border-box;
          display: grid;
          place-items: center;
          padding:
            max(12px, env(safe-area-inset-top))
            max(12px, env(safe-area-inset-right))
            max(12px, env(safe-area-inset-bottom))
            max(12px, env(safe-area-inset-left));
          background: rgba(3, 4, 3, .86);
          backdrop-filter: blur(10px);
          overscroll-behavior: none;
        }
        .veinviteLegalSheetPanel {
          width: min(100%, 760px);
          height: min(92dvh, 900px);
          max-height: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(255, 205, 80, .18);
          border-radius: 28px;
          background:
            radial-gradient(circle at 50% 0%, rgba(244, 183, 40, .075), transparent 28%),
            #10110f;
          color: #f8f6ef;
          box-shadow: 0 34px 110px rgba(0, 0, 0, .62);
        }
        .veinviteLegalSheetHeader {
          flex: 0 0 auto;
          min-height: 64px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 14px;
          border-bottom: 1px solid rgba(255, 255, 255, .065);
          background: rgba(16, 17, 15, .94);
        }
        .veinviteLegalSheetHeader h1 {
          min-width: 0;
          flex: 1 1 auto;
          margin: 0;
          color: #f5f1e8;
          font-size: .92rem;
          line-height: 1.3;
          font-weight: 900;
          text-align: start;
          overflow-wrap: anywhere;
        }
        .veinviteLegalSheetClose {
          width: 40px;
          height: 40px;
          flex: 0 0 40px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, .09);
          border-radius: 12px;
          background: rgba(255, 255, 255, .035);
          color: #ded9cf;
          font: inherit;
          line-height: 1;
          cursor: pointer;
        }
        .veinviteLegalSheetCloseMark {
          position: relative;
          width: 14px;
          height: 14px;
          display: block;
          flex: 0 0 14px;
          pointer-events: none;
        }
        .veinviteLegalSheetCloseMark::before,
        .veinviteLegalSheetCloseMark::after {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 14px;
          height: 2px;
          border-radius: 999px;
          background: currentColor;
          transform-origin: center;
        }
        .veinviteLegalSheetCloseMark::before {
          transform: translate(-50%, -50%) rotate(45deg);
        }
        .veinviteLegalSheetCloseMark::after {
          transform: translate(-50%, -50%) rotate(-45deg);
        }
        .veinviteLegalSheetClose:hover,
        .veinviteLegalSheetClose:focus-visible {
          border-color: rgba(244, 183, 40, .42);
          color: #f4c85a;
          outline: none;
          box-shadow: 0 0 0 3px rgba(244, 183, 40, .08);
        }
        .veinviteLegalSheetScroll {
          padding-bottom: env(safe-area-inset-bottom);
          scrollbar-gutter: stable;
        }
        .veinviteLegalSheetDocument {
          width: min(100%, 680px);
          box-sizing: border-box;
          margin: 0 auto;
          padding: 30px 24px 62px;
        }
        .veinviteLegalSheetMeta {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, .075);
        }
        .veinviteLegalSheetMeta > span {
          color: #f4b728;
          font-size: .7rem;
          font-weight: 950;
          letter-spacing: .11em;
        }
        .veinviteLegalSheetMeta > small {
          color: #8f8a80;
          font-size: .72rem;
          text-align: end;
        }
        .veinviteLegalSheetIntro {
          margin: 24px 0 0;
          color: #d4d0c7;
          font-size: .96rem;
          line-height: 1.8;
          text-wrap: pretty;
          overflow-wrap: anywhere;
        }
        .veinviteLegalSheetSections {
          display: grid;
          gap: 27px;
          margin-top: 32px;
        }
        .veinviteLegalSheetSections section {
          min-width: 0;
        }
        .veinviteLegalSheetSections h2 {
          margin: 0;
          color: #f4c85a;
          font-size: 1rem;
          line-height: 1.45;
          text-wrap: balance;
          overflow-wrap: anywhere;
        }
        .veinviteLegalSheetSections p {
          margin: 9px 0 0;
          color: #b7b2a8;
          font-size: .9rem;
          line-height: 1.82;
          text-wrap: pretty;
          overflow-wrap: anywhere;
        }
        @media (max-width: 640px) {
          .veinviteLegalSheetBackdrop {
            padding: 0;
          }
          .veinviteLegalSheetPanel {
            width: 100%;
            height: 100dvh;
            max-height: none;
            border: 0;
            border-radius: 0;
          }
          .veinviteLegalSheetHeader {
            min-height: calc(58px + env(safe-area-inset-top));
            padding:
              calc(8px + env(safe-area-inset-top))
              max(10px, env(safe-area-inset-right))
              8px
              max(10px, env(safe-area-inset-left));
          }
          .veinviteLegalSheetClose {
            width: 40px;
            height: 40px;
            flex-basis: 40px;
          }
          .veinviteLegalSheetDocument {
            padding:
              24px
              max(17px, env(safe-area-inset-right))
              calc(52px + env(safe-area-inset-bottom))
              max(17px, env(safe-area-inset-left));
          }
          .veinviteLegalSheetMeta {
            align-items: flex-start;
            flex-direction: column;
            gap: 8px;
          }
          .veinviteLegalSheetMeta > small {
            text-align: start;
          }
        }
        @media (max-width: 360px) {
          .veinviteLegalSheetHeader h1 {
            font-size: .8rem;
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
