'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { LanguageFlag } from './LanguageFlag';
import {
  LANGUAGE_OPTIONS,
  isLocale,
  type Locale,
} from '@/lib/i18n/locales';

type HostState = {
  mount: HTMLSpanElement;
  select: HTMLSelectElement;
};

export function HeaderLanguagePickerPortal() {
  const [host, setHost] = useState<HostState | null>(null);
  const [locale, setLocale] = useState<Locale>('en');
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    let activeSelect: HTMLSelectElement | null = null;
    let activeMount: HTMLSpanElement | null = null;

    const detach = () => {
      if (activeSelect) {
        activeSelect.classList.remove('languageSelectNativeEnhanced');
        activeSelect.removeAttribute('aria-hidden');
        activeSelect.removeAttribute('tabindex');
      }
      activeMount?.remove();
      activeSelect = null;
      activeMount = null;
      setHost(null);
      setOpen(false);
    };

    const attach = () => {
      const select = document.querySelector<HTMLSelectElement>('select.languageSelect');
      if (!select || select === activeSelect) return;

      detach();
      const mount = document.createElement('span');
      mount.className = 'headerLanguagePickerMount';
      select.insertAdjacentElement('afterend', mount);
      select.classList.add('languageSelectNativeEnhanced');
      select.setAttribute('aria-hidden', 'true');
      select.setAttribute('tabindex', '-1');
      activeSelect = select;
      activeMount = mount;
      setLocale(isLocale(select.value) ? select.value : 'en');
      setHost({ mount, select });
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      detach();
    };
  }, []);

  useEffect(() => {
    if (!host) return;

    const sync = () => {
      if (isLocale(host.select.value)) setLocale(host.select.value);
    };
    const syncFromGlobal = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (isLocale(detail)) setLocale(detail);
    };

    host.select.addEventListener('change', sync);
    window.addEventListener('veinvite-language-change', syncFromGlobal);
    return () => {
      host.select.removeEventListener('change', sync);
      window.removeEventListener('veinvite-language-change', syncFromGlobal);
    };
  }, [host]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const chooseLocale = useCallback((nextLocale: Locale) => {
    if (!host) return;
    host.select.value = nextLocale;
    host.select.dispatchEvent(new Event('change', { bubbles: true }));
    setLocale(nextLocale);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [host]);

  if (!host) return null;

  const current = LANGUAGE_OPTIONS.find((option) => option.locale === locale)
    ?? LANGUAGE_OPTIONS[0];
  const ariaLabel = host.select.getAttribute('aria-label') ?? 'Select language';

  return createPortal(
    <div ref={pickerRef} className="headerLanguagePicker">
      <button
        ref={triggerRef}
        type="button"
        className="headerLanguageTrigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="headerLanguageFlag" aria-hidden="true">
          <LanguageFlag locale={current.locale} />
        </span>
        <span className="headerLanguageName">{current.nativeName}</span>
        <span className="headerLanguageChevron" aria-hidden="true">⌄</span>
      </button>

      {open ? (
        <div className="headerLanguageMenu" role="listbox" aria-label={ariaLabel}>
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = option.locale === locale;
            return (
              <button
                key={option.locale}
                type="button"
                role="option"
                aria-selected={selected}
                className={selected ? 'headerLanguageOption selected' : 'headerLanguageOption'}
                onClick={() => chooseLocale(option.locale)}
              >
                <span className="headerLanguageOptionFlag" aria-hidden="true">
                  <LanguageFlag locale={option.locale} />
                </span>
                <span>{option.nativeName}</span>
                <span className="headerLanguageCheck" aria-hidden="true">{selected ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <style jsx global>{`
        select.languageSelect.languageSelectNativeEnhanced {
          position:absolute !important;
          width:1px !important;
          height:1px !important;
          margin:-1px !important;
          padding:0 !important;
          overflow:hidden !important;
          clip:rect(0 0 0 0) !important;
          clip-path:inset(50%) !important;
          white-space:nowrap !important;
          border:0 !important;
        }
        .headerLanguagePickerMount { position:relative; display:inline-flex; width:155px; max-width:100%; }
        .headerLanguagePicker { position:relative; width:155px; max-width:100%; font:inherit; }
        .headerLanguageTrigger { width:100%; height:40px; box-sizing:border-box; display:grid; grid-template-columns:24px minmax(0,1fr) 14px; align-items:center; gap:8px; padding:0 10px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:.76rem; font-weight:800; cursor:pointer; text-align:left; }
        .headerLanguageTrigger:hover,.headerLanguageTrigger:focus-visible { border-color:rgba(244,183,40,.55); outline:none; box-shadow:0 0 0 3px rgba(244,183,40,.1); }
        .headerLanguageFlag,.headerLanguageOptionFlag { overflow:hidden; display:grid; place-items:center; border-radius:4px; background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.22); }
        .headerLanguageFlag { width:24px; height:16px; }
        .headerLanguageOptionFlag { width:30px; height:20px; }
        .headerLanguageFlag .flagSvg,.headerLanguageOptionFlag .flagSvg { width:100%; height:100%; object-fit:contain; display:block; }
        .headerLanguageName { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .headerLanguageChevron { color:#9892a5; font-size:.9rem; line-height:1; text-align:right; transform:translateY(-1px); }
        .headerLanguageMenu { position:absolute; z-index:350; top:calc(100% + 8px); right:0; width:min(265px,calc(100vw - 28px)); max-height:min(480px,68vh); overflow:auto; box-sizing:border-box; padding:7px; border:1px solid rgba(255,255,255,.1); border-radius:16px; background:#171a29; box-shadow:0 22px 70px rgba(0,0,0,.5); scrollbar-width:thin; }
        .headerLanguageOption { width:100%; min-height:44px; box-sizing:border-box; display:grid; grid-template-columns:30px minmax(0,1fr) 20px; align-items:center; gap:11px; padding:7px 9px; border:1px solid transparent; border-radius:11px; background:transparent; color:#fff; font:inherit; font-size:.86rem; font-weight:800; text-align:left; cursor:pointer; }
        .headerLanguageOption:hover,.headerLanguageOption:focus-visible { background:rgba(255,255,255,.06); outline:none; }
        .headerLanguageOption.selected { border-color:rgba(244,183,40,.32); background:rgba(244,183,40,.11); color:#ffd66e; }
        .headerLanguageCheck { text-align:center; font-weight:950; }
        @media (max-width:560px) {
          .headerLanguagePickerMount,.headerLanguagePicker { width:155px; max-width:100%; }
          .headerLanguageTrigger { height:34px; border-radius:11px; font-size:.68rem; grid-template-columns:22px minmax(0,1fr) 12px; gap:7px; padding:0 9px; }
          .headerLanguageFlag { width:22px; height:15px; }
          .headerLanguageMenu { top:calc(100% + 7px); }
        }
      `}</style>
    </div>,
    host.mount,
  );
}
