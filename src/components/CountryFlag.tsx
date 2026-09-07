import { LOCALE_DEFINITIONS } from '@/lib/i18n/locales';

const APP_COUNTRY_FLAG_SOURCE = LOCALE_DEFINITIONS.reduce<Record<string, string>>(
  (sources, definition) => {
    const match = definition.flagSource.match(/\/flags\/([a-z]{2})\.svg$/i);
    if (match?.[1]) {
      sources[match[1].toUpperCase()] = definition.flagSource;
    }
    return sources;
  },
  {},
);

function countryFlagEmoji(countryCode: string): string {
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return '🌐';

  return String.fromCodePoint(
    ...Array.from(normalized, (letter) => 127397 + letter.charCodeAt(0)),
  );
}

export function CountryFlag({ countryCode }: { countryCode: string }) {
  const normalized = countryCode.trim().toUpperCase();
  const source = APP_COUNTRY_FLAG_SOURCE[normalized];

  return (
    <span className="countryFlag" aria-hidden="true">
      {source ? (
        <img
          className="countryFlagImage"
          src={source}
          alt=""
          draggable={false}
        />
      ) : (
        <span className="countryFlagEmoji">{countryFlagEmoji(normalized)}</span>
      )}

      <style jsx>{`
        .countryFlag {
          width:28px;
          height:19px;
          flex:0 0 28px;
          display:grid;
          place-items:center;
          overflow:hidden;
          border-radius:4px;
          background:transparent;
          box-shadow:0 0 0 1px rgba(255,255,255,.12);
        }
        .countryFlagImage {
          width:100%;
          height:100%;
          display:block;
          object-fit:cover;
        }
        .countryFlagEmoji {
          display:block;
          font-size:1rem;
          line-height:1;
        }
        @media (max-width:430px) {
          .countryFlag {
            width:25px;
            height:17px;
            flex-basis:25px;
          }
          .countryFlagEmoji {
            font-size:.92rem;
          }
        }
      `}</style>
    </span>
  );
}
