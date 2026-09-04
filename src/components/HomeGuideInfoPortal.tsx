'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { InviteGuideContent } from './AppGuide';
import { InfoCircleIcon } from './InfoCircleIcon';
import {
  SOFT_FOCUS_MOTION_CSS,
  softFocusCloseDelay,
} from './SoftFocusMotion';
import { GUIDE_COPY } from '@/lib/i18n/guideCopy';
import { NOTIFICATION_COPY } from '@/lib/i18n/notificationCopy';
import type { Locale } from '@/lib/i18n/locales';

export function HomeGuideInfoPortal({ locale }: { locale: Locale }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [dialogMounted, setDialogMounted] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const guide = GUIDE_COPY[locale];

  useEffect(() => {
    const target = document.querySelector<HTMLElement>('.missionCard');
    setHost(target);
    return () => setHost(null);
  }, []);

  const openGuide = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setDialogMounted(true);
  }, []);

  useEffect(() => {
    if (!dialogMounted) return;

    let revealFrame: number | null = null;
    const mountFrame = window.requestAnimationFrame(() => {
      revealFrame = window.requestAnimationFrame(() => setDialogVisible(true));
    });

    return () => {
      window.cancelAnimationFrame(mountFrame);
      if (revealFrame !== null) window.cancelAnimationFrame(revealFrame);
    };
  }, [dialogMounted]);

  const closeGuide = useCallback(() => {
    setDialogVisible(false);
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      setDialogMounted(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }, softFocusCloseDelay());
  }, []);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!dialogMounted) return;

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
  }, [dialogMounted, closeGuide]);

  const launcher = host
    ? createPortal(
        <>
          <style>{`
            .missionCard {
              overflow: hidden;
              overflow: clip;
            }
            .missionCard > .cardGlow {
              background: radial-gradient(
                circle,
                rgba(244,183,40,.18) 0%,
                rgba(244,183,40,.13) 44%,
                rgba(244,183,40,.05) 68%,
                transparent 76%
              );
              filter: none;
            }
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
            onClick={openGuide}
          >
            <InfoCircleIcon size={18} />
          </button>
        </>,
        host,
      )
    : null;

  const dialog = dialogMounted && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="veinviteGuideBackdrop veinviteSoftFocusBackdrop"
          data-open={dialogVisible ? 'true' : 'false'}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeGuide();
          }}
        >
          <div
            ref={dialogRef}
            className="veinviteGuideDialog veinviteSoftFocusPanel"
            role="dialog"
            aria-modal="true"
            aria-label={guide.title}
          >
            <div className="veinviteSoftFocusHeader">
              <button
                ref={closeRef}
                type="button"
                className="veinviteSoftFocusClose"
                onClick={closeGuide}
                aria-label={NOTIFICATION_COPY[locale].closeAria}
              />
            </div>
            <div className="veinviteSoftFocusScroll veinviteGuideScroll">
              <InviteGuideContent locale={locale} />
            </div>
          </div>
          <style>{`
            ${SOFT_FOCUS_MOTION_CSS}
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
              box-sizing: border-box;
              padding: 0;
              border: 1px solid rgba(255,205,80,.2);
              border-radius: 26px;
              background: #11120f;
              color: #fff;
              box-shadow: 0 30px 90px rgba(0,0,0,.58);
            }
            .veinviteGuideDialog > .veinviteSoftFocusHeader {
              border-bottom: 0;
              background: transparent;
            }
            .veinviteGuideScroll {
              padding: 0 22px 24px;
            }
            @media (max-width: 560px) {
              .veinviteGuideDialog {
                border-radius: 22px;
              }
              .veinviteGuideScroll {
                padding: 0 17px 20px;
              }
            }
          `}</style>
        </div>,
        document.body,
      )
    : null;

  return <>{launcher}{dialog}</>;
}
