'use client';

import { Brand } from './Brand';
import { LanguageFlag } from './LanguageFlag';
import { LANGUAGE_SELECT_COPY } from '@/lib/i18n/languageSelectCopy';
import { LANGUAGE_OPTIONS, type Locale } from '@/lib/i18n/locales';

type LanguageSelectV2Props = {
  locale: Locale;
  onSelect: (locale: Locale) => void;
  onContinue: () => void;
};

export function LanguageSelectV2({ locale, onSelect, onContinue }: LanguageSelectV2Props) {
  const t = LANGUAGE_SELECT_COPY[locale];

  return (
    <main className="screen">
      <header className="topBar"><Brand compact /></header>
      <section className="card">
        <div className="badge">{t.badge}</div>
        <h1>{t.title}</h1>
        <p className="subtitle">{t.subtitle}</p>

        <div className="languageGrid" role="group" aria-label={t.chooseAria}>
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = option.locale === locale;
            return (
              <button
                key={option.locale}
                type="button"
                className={selected ? 'languageCard selected' : 'languageCard'}
                onClick={() => onSelect(option.locale)}
                aria-pressed={selected}
              >
                <span className="symbol" aria-hidden="true"><LanguageFlag locale={option.locale} /></span>
                <span className="languageText"><strong>{option.nativeName}</strong></span>
                <span className="check">{selected ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>

        <button type="button" className="continueButton" onClick={onContinue}>
          {t.continue}<span aria-hidden="true">›</span>
        </button>
        <p className="note">{t.note}</p>
      </section>

      <style jsx>{`
        .screen { min-height:100svh; width:100%; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; padding:20px 18px 32px; color:#fff; background:radial-gradient(circle at 50% 24%,rgba(244,183,40,.17),transparent 36%),#080807; }
        .topBar { width:min(100%,430px); display:flex; align-items:center; margin-bottom:22px; }
        .card { position:relative; overflow:hidden; width:min(100%,430px); box-sizing:border-box; padding:28px 22px 22px; border:1px solid rgba(255,205,80,.25); border-radius:28px; background:linear-gradient(160deg,rgba(54,40,14,.98),rgba(16,16,14,.98) 64%); box-shadow:0 24px 70px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.08); }
        .card::before { content:''; position:absolute; width:220px; height:220px; right:-110px; top:-120px; border-radius:50%; background:rgba(244,183,40,.18); }
        .badge { position:relative; z-index:1; display:inline-flex; align-items:center; min-height:28px; padding:0 11px; border:1px solid rgba(255,205,80,.28); border-radius:999px; background:rgba(244,183,40,.12); color:#ffd66e; font-size:.7rem; font-weight:900; letter-spacing:.08em; }
        h1 { position:relative; z-index:1; margin:28px 0 7px; text-align:center; font-size:clamp(2rem,9vw,2.65rem); line-height:1.08; letter-spacing:-.045em; overflow-wrap:anywhere; }
        .subtitle { position:relative; z-index:1; margin:0 0 20px; text-align:center; color:#b8b3ca; font-size:.92rem; font-weight:700; }
        .languageGrid { position:relative; z-index:1; display:grid; gap:9px; max-height:min(47svh,430px); overflow:auto; padding-right:3px; scrollbar-width:thin; }
        .languageCard { width:100%; min-height:60px; box-sizing:border-box; display:grid; grid-template-columns:42px 1fr 28px; align-items:center; gap:12px; padding:9px 13px; border:1px solid rgba(255,255,255,.1); border-radius:16px; background:rgba(255,255,255,.045); color:#fff; text-align:left; cursor:pointer; }
        .languageCard:hover { border-color:rgba(255,205,80,.36); }
        .languageCard.selected { border-color:#f4b728; background:linear-gradient(135deg,rgba(244,183,40,.22),rgba(244,183,40,.07)); box-shadow:0 0 0 1px rgba(244,183,40,.16); }
        .symbol { width:40px; height:27px; display:grid; place-items:center; overflow:hidden; border-radius:8px; background:#fff; box-shadow:0 0 0 1px rgba(255,255,255,.15); }
        .symbol :global(svg) { width:100%; height:100%; display:block; }
        .languageText { min-width:0; }
        .languageText strong { display:block; font-size:.94rem; font-weight:900; overflow-wrap:anywhere; }
        .check { width:26px; height:26px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.1); border-radius:50%; font-size:.8rem; }
        .selected .check { border-color:#f4b728; background:#f4b728; color:#17120a; }
        .continueButton { position:relative; z-index:1; width:100%; min-height:56px; margin-top:18px; border:0; border-radius:17px; display:flex; align-items:center; justify-content:center; gap:10px; background:linear-gradient(135deg,#ffd24d,#efa718); color:#17120a; font:inherit; font-size:1rem; font-weight:950; cursor:pointer; }
        .continueButton span { font-size:1.6rem; line-height:1; }
        .note { position:relative; z-index:1; margin:12px 0 0; text-align:center; color:#777387; font-size:.72rem; }
      `}</style>
    </main>
  );
}
