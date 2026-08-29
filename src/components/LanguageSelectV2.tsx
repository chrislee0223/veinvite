'use client';

import { Brand } from './Brand';

type Locale = 'ko' | 'en';

type LanguageSelectV2Props = {
  locale: Locale;
  onSelect: (locale: Locale) => void;
  onContinue: () => void;
};

const COPY = {
  ko: {
    badge: 'STEP 1',
    title: '언어 선택',
    subtitle: '편한 언어로 시작하세요',
    korean: '한국어',
    koreanHint: '한국어로 이용',
    english: 'English',
    englishHint: 'Use in English',
    continue: '한국어로 시작하기',
    note: '언어는 나중에도 바꿀 수 있어요',
  },
  en: {
    badge: 'STEP 1',
    title: 'Choose language',
    subtitle: 'Pick the language you prefer',
    korean: '한국어',
    koreanHint: '한국어로 이용',
    english: 'English',
    englishHint: 'Use in English',
    continue: 'Continue in English',
    note: 'You can change this later',
  },
} as const;

export function LanguageSelectV2({
  locale,
  onSelect,
  onContinue,
}: LanguageSelectV2Props) {
  const t = COPY[locale];

  return (
    <main className="screen">
      <header className="topBar">
        <Brand compact />
      </header>

      <section className="card">
        <div className="badge">{t.badge}</div>

        <h1>{t.title}</h1>
        <p className="subtitle">{t.subtitle}</p>

        <div className="languageGrid">
          <button
            type="button"
            className={
              locale === 'ko'
                ? 'languageCard selected'
                : 'languageCard'
            }
            onClick={() => onSelect('ko')}
            aria-pressed={locale === 'ko'}
          >
            <span className="symbol">가</span>

            <span className="languageText">
              <strong>{t.korean}</strong>
              <small>{t.koreanHint}</small>
            </span>

            <span className="check">
              {locale === 'ko' ? '✓' : ''}
            </span>
          </button>

          <button
            type="button"
            className={
              locale === 'en'
                ? 'languageCard selected'
                : 'languageCard'
            }
            onClick={() => onSelect('en')}
            aria-pressed={locale === 'en'}
          >
            <span className="symbol">A</span>

            <span className="languageText">
              <strong>{t.english}</strong>
              <small>{t.englishHint}</small>
            </span>

            <span className="check">
              {locale === 'en' ? '✓' : ''}
            </span>
          </button>
        </div>

        <button
          type="button"
          className="continueButton"
          onClick={onContinue}
        >
          {t.continue}
          <span aria-hidden="true">›</span>
        </button>

        <p className="note">{t.note}</p>
      </section>

      <style jsx>{`
        .screen {
          min-height: 100svh;
          width: 100%;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 20px 18px 32px;
          color: #ffffff;
          background:
            radial-gradient(
              circle at 50% 24%,
              rgba(244, 183, 40, 0.17),
              transparent 36%
            ),
            #080807;
        }

        .topBar {
          width: min(100%, 430px);
          display: flex;
          align-items: center;
          justify-content: flex-start;
          margin-bottom: 22px;
        }

        .card {
          position: relative;
          overflow: hidden;
          width: min(100%, 430px);
          box-sizing: border-box;
          padding: 28px 22px 22px;
          border: 1px solid rgba(255, 205, 80, 0.25);
          border-radius: 28px;
          background:
            linear-gradient(
              160deg,
              rgba(54, 40, 14, 0.98),
              rgba(16, 16, 14, 0.98) 64%
            );
          box-shadow:
            0 24px 70px rgba(0, 0, 0, 0.42),
            inset 0 1px 0 rgba(255, 255, 255, 0.08);
        }

        .card::before {
          content: '';
          position: absolute;
          width: 220px;
          height: 220px;
          right: -110px;
          top: -120px;
          border-radius: 50%;
          background: rgba(244, 183, 40, 0.18);
        }

        .badge {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          height: 28px;
          padding: 0 11px;
          border: 1px solid rgba(255, 205, 80, 0.28);
          border-radius: 999px;
          background: rgba(244, 183, 40, 0.12);
          color: #ffd66e;
          font-size: 0.7rem;
          font-weight: 900;
          letter-spacing: 0.12em;
        }

        h1 {
          position: relative;
          z-index: 1;
          margin: 34px 0 7px;
          text-align: center;
          font-size: clamp(2.1rem, 9vw, 2.75rem);
          line-height: 1.05;
          letter-spacing: -0.055em;
        }

        .subtitle {
          position: relative;
          z-index: 1;
          margin: 0 0 24px;
          text-align: center;
          color: #b8b3ca;
          font-size: 0.95rem;
          font-weight: 700;
        }

        .languageGrid {
          position: relative;
          z-index: 1;
          display: grid;
          gap: 12px;
        }

        .languageCard {
          width: 100%;
          min-height: 78px;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: 48px 1fr 28px;
          align-items: center;
          gap: 13px;
          padding: 12px 15px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.045);
          color: #ffffff;
          text-align: left;
          cursor: pointer;
          transition:
            transform 150ms ease,
            border-color 150ms ease,
            background 150ms ease;
        }

        .languageCard:hover {
          transform: translateY(-1px);
          border-color: rgba(255, 205, 80, 0.36);
        }

        .languageCard.selected {
          border-color: #f4b728;
          background:
            linear-gradient(
              135deg,
              rgba(244, 183, 40, 0.22),
              rgba(244, 183, 40, 0.07)
            );
          box-shadow:
            0 0 0 1px rgba(244, 183, 40, 0.16),
            0 12px 30px rgba(190, 126, 12, 0.16);
        }

        .symbol {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          background: rgba(244, 183, 40, 0.14);
          color: #ffd66e;
          font-size: 1.25rem;
          font-weight: 950;
        }

        .selected .symbol {
          background: #f4b728;
          color: #17120a;
          box-shadow: 0 0 20px rgba(244, 183, 40, 0.34);
        }

        .languageText {
          display: grid;
          gap: 4px;
        }

        .languageText strong {
          font-size: 1rem;
          font-weight: 900;
        }

        .languageText small {
          color: #8f8a9e;
          font-size: 0.73rem;
          font-weight: 700;
        }

        .selected .languageText small {
          color: #d9c68e;
        }

        .check {
          width: 26px;
          height: 26px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          color: #ffffff;
          font-size: 0.8rem;
          font-weight: 950;
        }

        .selected .check {
          border-color: #f4b728;
          background: #f4b728;
          color: #17120a;
        }

        .continueButton {
          position: relative;
          z-index: 1;
          width: 100%;
          min-height: 58px;
          margin-top: 18px;
          border: 0;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          background:
            linear-gradient(
              135deg,
              #ffd24d,
              #efa718
            );
          color: #17120a;
          font: inherit;
          font-size: 1.05rem;
          font-weight: 950;
          cursor: pointer;
          box-shadow:
            0 15px 34px rgba(190, 126, 12, 0.28),
            inset 0 1px 0 rgba(255, 255, 255, 0.22);
        }

        .continueButton span {
          font-size: 1.7rem;
          line-height: 1;
          margin-top: -2px;
        }

        .continueButton:hover {
          filter: brightness(1.06);
        }

        .continueButton:active {
          transform: translateY(1px);
        }

        .note {
          position: relative;
          z-index: 1;
          margin: 13px 0 0;
          text-align: center;
          color: #777387;
          font-size: 0.72rem;
          font-weight: 700;
        }

        @media (max-width: 380px) {
          .screen {
            padding-inline: 14px;
          }

          .card {
            padding-inline: 18px;
          }
        }
      `}</style>
    </main>
  );
}
