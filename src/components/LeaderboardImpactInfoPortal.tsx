'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { GUIDE_COPY } from '@/lib/i18n/guideCopy';
import { LEADERBOARD_COPY } from '@/lib/i18n/leaderboardCopy';
import type { Locale } from '@/lib/i18n/locales';
import { InfoCircleIcon } from './InfoCircleIcon';
import {
  SOFT_FOCUS_MOTION_CSS,
  softFocusCloseDelay,
} from './SoftFocusMotion';

export function LeaderboardImpactInfoPortal({ locale }: { locale: Locale }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [dialogMounted, setDialogMounted] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const t = LEADERBOARD_COPY[locale];
  const guide = GUIDE_COPY[locale];

  useEffect(() => {
    let frame: number | null = null;

    const attach = () => {
      const target = document.querySelector<HTMLElement>(
        '.leaderboardPage .impactCard',
      );
      setHost((current) => (current === target ? current : target));
    };

    const scheduleAttach = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        attach();
      });
    };

    attach();
    const observer = new MutationObserver(scheduleAttach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      setHost(null);
    };
  }, []);

  const openInfo = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setDialogMounted(true);
  }, []);

  useEffect(() => {
    if (!dialogMounted) return;
    const frame = window.requestAnimationFrame(() => setDialogVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [dialogMounted]);

  const closeInfo = useCallback(() => {
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
        closeInfo();
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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [dialogMounted, closeInfo]);

  const launcher = host
    ? createPortal(
        <>
          <style>{`
            .leaderboardPage .impactCard {
              position: relative;
            }
            .leaderboardPage .impactCard > h2 {
              box-sizing: border-box;
              padding-right: 42px;
            }
            .leaderboardPage .impactCard > .impactNote {
              display: none;
            }
            .veinviteImpactInfoButton {
              position: absolute;
              z-index: 4;
              top: 15px;
              right: 18px;
              width: 30px;
              height: 30px;
              display: grid;
              place-items: center;
              padding: 0;
              border: 1px solid rgba(255,211,92,.2);
              border-radius: 10px;
              background: rgba(255,205,80,.06);
              color: #f6ca59;
              line-height: 0;
              cursor: pointer;
            }
            .veinviteImpactInfoButton:hover,
            .veinviteImpactInfoButton:focus-visible {
              border-color: rgba(255,211,92,.46);
              outline: none;
              box-shadow: 0 0 0 3px rgba(244,183,40,.08);
            }
            .veinviteImpactInfoButton svg {
              display: block;
            }
            @media (max-width: 420px) {
              .leaderboardPage .impactCard > h2 { padding-right: 38px; }
              .veinviteImpactInfoButton {
                top: 13px;
                right: 15px;
                width: 28px;
                height: 28px;
                border-radius: 9px;
              }
            }
          `}</style>
          <button
            ref={triggerRef}
            type="button"
            className="veinviteImpactInfoButton"
            aria-label={guide.countTitle}
            title={guide.countTitle}
            onClick={openInfo}
          >
            <InfoCircleIcon size={17} />
          </button>
        </>,
        host,
      )
    : null;

  const dialog = dialogMounted && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="veinviteImpactInfoBackdrop veinviteSoftFocusBackdrop"
          data-open={dialogVisible ? 'true' : 'false'}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeInfo();
          }}
        >
          <div
            ref={dialogRef}
            className="veinviteImpactInfoDialog veinviteSoftFocusPanel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="veinvite-impact-info-title"
          >
            <button
              ref={closeRef}
              type="button"
              className="veinviteSoftFocusClose"
              onClick={closeInfo}
              aria-label={t.close}
            />
            <div className="veinviteImpactInfoTop">
              <div>
                <span>{t.impactTitle}</span>
                <h2 id="veinvite-impact-info-title">{guide.countTitle}</h2>
              </div>
            </div>
            <p>{t.impactNote}</p>
          </div>
          <style>{`
            ${SOFT_FOCUS_MOTION_CSS}
            .veinviteImpactInfoBackdrop {
              position: fixed;
              z-index: 145;
              inset: 0;
              display: grid;
              place-items: center;
              padding: 16px;
              background: rgba(2,3,8,.84);
              backdrop-filter: blur(10px);
            }
            .veinviteImpactInfoDialog {
              width: min(100%,440px);
              box-sizing: border-box;
              padding: 20px;
              border: 1px solid rgba(255,205,80,.2);
              border-radius: 24px;
              background: #11120f;
              color: #fff;
              box-shadow: 0 30px 90px rgba(0,0,0,.58);
            }
            .veinviteImpactInfoTop {
              padding-right: 54px;
            }
            .veinviteImpactInfoTop span {
              color: #f4bd35;
              font-size: .68rem;
              font-weight: 900;
            }
            .veinviteImpactInfoTop h2 {
              margin: 5px 0 0;
              font-size: 1.15rem;
              letter-spacing: -.025em;
            }
            .veinviteImpactInfoDialog p {
              margin: 16px 0 0;
              color: #aaa69d;
              font-size: .82rem;
              line-height: 1.6;
              overflow-wrap: anywhere;
            }
          `}</style>
        </div>,
        document.body,
      )
    : null;

  return <>{launcher}{dialog}</>;
}
