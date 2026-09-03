'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { InviteGuideContent } from './AppGuide';
import { InfoCircleIcon } from './InfoCircleIcon';
import { GUIDE_COPY } from '@/lib/i18n/guideCopy';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import type { Locale } from '@/lib/i18n/locales';

export function HomeGuideInfoPortal({ locale }: { locale: Locale }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const guide = GUIDE_COPY[locale];

  useEffect(() => {
    const target = document.querySelector<HTMLElement>('.missionCard');
    setHost(target);
    return () => setHost(null);
  }, []);

  const closeGuide = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeGuide();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], select, [tabindex]:not([tabindex="-1"])',
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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, closeGuide]);

  const launcher = host
    ? createPortal(
        <>
          <style>{`
            .missionCard > .missionCopy {
              box-sizing: border-box;
              padding-right: 44px;
            }
            .veinviteGuideInfoButton {
              position: absolute;
              z-index: 4;
              top: 32px;
              right: 24px;
              width: 32px;
              height: 32px;
              display: grid;
              place-items: center;
              padding: 0;
              border: 1px solid rgba(255,211,92,.2);
              border-radius: 11px;
              background: rgba(255,205,80,.06);
              color: #f6ca59;
              line-height: 0;
              cursor: pointer;
            }
            .veinviteGuideInfoButton:hover,
            .veinviteGuideInfoButton:focus-visible {
              border-color: rgba(255,211,92,.46);
              outline: none;
              box-shadow: 0 0 0 3px rgba(244,183,40,.08);
            }
            .veinviteGuideInfoButton svg {
              display: block;
            }
            @media (max-width: 560px) {
              .missionCard > .missionCopy { padding-right: 40px; }
              .veinviteGuideInfoButton {
                top: 26px;
                right: 18px;
                width: 30px;
                height: 30px;
                border-radius: 10px;
              }
            }
          `}</style>
          <button
            ref={triggerRef}
            type="button"
            className="veinviteGuideInfoButton"
            aria-label={guide.title}
            title={guide.title}
            onClick={() => setOpen(true)}
          >
            <InfoCircleIcon size={18} />
          </button>
        </>,
        host,
      )
    : null;

  const dialog = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="veinviteGuideBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeGuide();
          }}
        >
          <div
            ref={dialogRef}
            className="veinviteGuideDialog"
            role="dialog"
            aria-modal="true"
            aria-label={guide.title}
          >
            <div className="veinviteGuideDialogTop">
              <button
                ref={closeRef}
                type="button"
                className="veinviteGuideCloseButton"
                onClick={closeGuide}
                aria-label={NOTIFICATION_COPY[locale].closeAria}
              >
                ×
              </button>
            </div>
            <InviteGuideContent locale={locale} />
          </div>
          <style>{`
            .veinviteGuideBackdrop {
              position: fixed;
              z-index: 140;
              inset: 0;
              display: grid;
              place-items: center;
              padding: 16px;
              background: rgba(2,3,8,.84);
              backdrop-filter: blur(10px);
            }
            .veinviteGuideDialog {
              width: min(100%,600px);
              max-height: min(88svh,820px);
              overflow: auto;
              box-sizing: border-box;
              padding: 20px 22px 24px;
              border: 1px solid rgba(255,205,80,.2);
              border-radius: 26px;
              background: #11120f;
              color: #fff;
              box-shadow: 0 30px 90px rgba(0,0,0,.58);
            }
            .veinviteGuideDialogTop {
              display: flex;
              justify-content: flex-end;
              margin-bottom: 2px;
            }
            .veinviteGuideCloseButton {
              width: 40px;
              height: 40px;
              display: grid;
              place-items: center;
              padding: 0;
              border: 1px solid rgba(255,255,255,.1);
              border-radius: 13px;
              background: rgba(255,255,255,.04);
              color: #fff;
              font: inherit;
              font-size: 1.25rem;
              cursor: pointer;
            }
            .veinviteGuideCloseButton:focus-visible {
              outline: none;
              box-shadow: 0 0 0 3px rgba(244,183,40,.1);
            }
            @media (max-width: 560px) {
              .veinviteGuideDialog {
                padding: 16px 17px 20px;
                border-radius: 22px;
              }
            }
          `}</style>
        </div>,
        document.body,
      )
    : null;

  return <>{launcher}{dialog}</>;
}
