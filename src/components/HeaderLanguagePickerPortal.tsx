'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
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
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let activeSelect: HTMLSelectElement | null = null;
    let activeMount: HTMLSpanElement | null = null;
    let attachFrame: number | null = null;

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

    const findEligibleSelect = () => {
      const selects = Array.from(
        document.querySelectorAll<HTMLSelectElement>(
          'select.languageSelect',
        ),
      );

      // The main app keeps language selection in Settings. Its old native
      // select remains temporarily in HomeClient for compatibility, but must
      // not be enhanced back into a visible header picker. Direct invite
      // flows do not expose the main Settings tab, so their language controls
      // remain eligible for this flag-based picker.
      return (
        selects.find(
          (select) => !select.closest('.utilityActions'),
        ) ?? null
      );
    };

    const attach = () => {
      const select = findEligibleSelect();

      if (!select) {
        if (activeSelect) detach();
        return;
      }

      if (select === activeSelect) return;

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

    const scheduleAttach = () => {
      if (attachFrame !== null) return;
      attachFrame = window.requestAnimationFrame(() => {
        attachFrame = null;
        attach();
      });
    };

    attach();
    const observer = new MutationObserver(scheduleAttach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (attachFrame !== null) {
        window.cancelAnimationFrame(attachFrame);
      }
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

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      const selected = menuRef.current?.querySelector<HTMLButtonElement>(
        '.headerLanguageOption[aria-selected="true"]',
      );
      selected?.focus();
    });
  }, [open]);

  const chooseLocale = useCallback((nextLocale: Locale) => {
    if (!host) return;
    host.select.value = nextLocale;
    host.select.dispatchEvent(new Event('change', { bubbles: true }));
    setLocale(nextLocale);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [host]);

  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    setOpen(true);
  };

  const handleMenuKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const options = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '.headerLanguageOption',
      ) ?? [],
    );
    if (options.length === 0) return;

    event.preventDefault();
    const currentIndex = Math.max(
      0,
      options.indexOf(document.activeElement as HTMLButtonElement),
    );
    let nextIndex = currentIndex;

    if (event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % options.length;
    }
    if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + options.length) % options.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = options.length - 1;

    options[nextIndex]?.focus();
  };

  if (!host) return null;

  const current = LANGUAGE_OPTIONS.find(
    (option) => option.locale === locale,
  ) ?? LANGUAGE_OPTIONS[0];
  const ariaLabel =
    host.select.getAttribute('aria-label') ?? 'Select language';

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
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="headerLanguageFlag" aria-hidden="true">
          <LanguageFlag locale={current.locale} />
        </span>
        <span className="headerLanguageName">{current.nativeName}</span>
        <span className="headerLanguageChevron" aria-hidden="true" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          className="headerLanguageMenu"
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleMenuKeyDown}
        >
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = option.locale === locale;
            return (
              <button
                key={option.locale}
                type="button"
                role="option"
                aria-selected={selected}
                className={
                  selected
                    ? 'headerLanguageOption selected'
                    : 'headerLanguageOption'
                }
                onClick={() => chooseLocale(option.locale)}
              >
                <span
                  className="headerLanguageOptionFlag"
                  aria-hidden="true"
                >
                  <LanguageFlag locale={option.locale} />
                </span>
                <span>{option.nativeName}</span>
                <span className="headerLanguageCheck" aria-hidden="true">
                  {selected ? '✓' : ''}
                </span>
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
        .headerLanguageTrigger { width:100%; min-height:48px; box-sizing:border-box; display:grid; grid-template-columns:24px minmax(0,1fr) 14px; align-items:center; gap:9px; padding:7px 14px 7px 12px; border:1px solid rgba(255,255,255,.1); border-radius:13px; background:#141625; color:#fff; font:inherit; font-size:.76rem; font-weight:800; cursor:pointer; text-align:left; }
        .headerLanguageTrigger:hover,.headerLanguageTrigger:focus-visible { border-color:rgba(244,183,40,.55); outline:none; box-shadow:0 0 0 3px rgba(244,183,40,.1); }
        .headerLanguageFlag,.headerLanguageOptionFlag { overflow:hidden; display:grid; place-items:center; border-radius:4px; background:transparent; box-shadow:0 0 0 1px rgba(255,255,255,.14); }
        .headerLanguageFlag { width:24px; height:16px; }
        .headerLanguageOptionFlag { width:30px; height:20px; }
        .headerLanguageFlag .flagSvg,.headerLanguageOptionFlag .flagSvg { width:100%; height:100%; object-fit:contain; display:block; }
        .headerLanguageName { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .headerLanguageChevron { width:8px; height:8px; justify-self:end; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; color:#9892a5; transform:translateY(-2px) rotate(45deg); }
        .headerLanguageMenu { position:absolute; z-index:350; top:calc(100% + 8px); right:0; width:min(265px,calc(100vw - 28px)); max-height:min(480px,68vh); overflow:auto; box-sizing:border-box; padding:7px; border:1px solid rgba(255,255,255,.1); border-radius:16px; background:#171a29; box-shadow:0 22px 70px rgba(0,0,0,.5); scrollbar-width:thin; }
        .headerLanguageOption { width:100%; min-height:44px; box-sizing:border-box; display:grid; grid-template-columns:30px minmax(0,1fr) 20px; align-items:center; gap:11px; padding:7px 9px; border:1px solid transparent; border-radius:11px; background:transparent; color:#fff; font:inherit; font-size:.86rem; font-weight:800; text-align:left; cursor:pointer; }
        .headerLanguageOption:hover,.headerLanguageOption:focus-visible { background:rgba(255,255,255,.06); outline:none; }
        .headerLanguageOption.selected { border-color:rgba(244,183,40,.32); background:rgba(244,183,40,.11); color:#ffd66e; }
        .headerLanguageCheck { text-align:center; font-weight:950; }
        @media (max-width:560px) {
          .headerLanguagePickerMount,.headerLanguagePicker { width:155px; max-width:100%; }
          .headerLanguageTrigger { min-height:48px; border-radius:13px; font-size:.76rem; grid-template-columns:24px minmax(0,1fr) 14px; gap:9px; padding:7px 14px 7px 12px; }
          .headerLanguageFlag { width:24px; height:16px; }
          .headerLanguageChevron { width:8px; height:8px; }
          .headerLanguageMenu { top:calc(100% + 8px); }
        }
      `}</style>
    </div>,
    host.mount,
  );
}
