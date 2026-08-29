import type { Locale } from '@/lib/i18n/locales';

type LanguageFlagProps = {
  locale: Locale;
};

const US_DOTS = [
  [3.1, 2.2], [5.2, 2.2], [7.3, 2.2], [9.4, 2.2],
  [4.1, 3.7], [6.2, 3.7], [8.3, 3.7],
  [3.1, 5.2], [5.2, 5.2], [7.3, 5.2], [9.4, 5.2],
] as const;

export function LanguageFlag({ locale }: LanguageFlagProps) {
  const common = {
    viewBox: '0 0 30 20',
    role: 'img',
    'aria-hidden': true,
    focusable: 'false',
    preserveAspectRatio: 'xMidYMid slice',
  } as const;

  if (locale === 'en') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="20" fill="#fff" />
        {Array.from({ length: 7 }, (_, index) => (
          <rect key={index} y={index * (20 / 7)} width="30" height={20 / 14} fill="#b22234" />
        ))}
        <rect width="12" height="8.6" fill="#3c3b6e" />
        {US_DOTS.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r=".45" fill="#fff" />)}
      </svg>
    );
  }

  if (locale === 'ko') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="20" fill="#fff" />
        <path d="M10.5 10a4.5 4.5 0 0 1 9 0z" fill="#cd2e3a" />
        <path d="M10.5 10a4.5 4.5 0 0 0 9 0z" fill="#0047a0" />
        <g fill="#111">
          <rect x="4" y="3.6" width="5" height=".65" transform="rotate(-32 6.5 3.9)" />
          <rect x="4.4" y="5" width="5" height=".65" transform="rotate(-32 6.9 5.3)" />
          <rect x="20.7" y="14.2" width="5" height=".65" transform="rotate(-32 23.2 14.5)" />
          <rect x="20.3" y="15.6" width="5" height=".65" transform="rotate(-32 22.8 15.9)" />
          <rect x="21" y="3.6" width="5" height=".65" transform="rotate(32 23.5 3.9)" />
          <rect x="20.6" y="5" width="5" height=".65" transform="rotate(32 23.1 5.3)" />
          <rect x="4" y="14.2" width="5" height=".65" transform="rotate(32 6.5 14.5)" />
          <rect x="4.4" y="15.6" width="5" height=".65" transform="rotate(32 6.9 15.9)" />
        </g>
      </svg>
    );
  }

  if (locale === 'zh') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="20" fill="#de2910" />
        <polygon points="6,3 7,5.5 9.7,5.5 7.5,7.1 8.3,9.6 6,8.1 3.7,9.6 4.5,7.1 2.3,5.5 5,5.5" fill="#ffde00" />
        <circle cx="11.5" cy="3.3" r=".7" fill="#ffde00" /><circle cx="13.5" cy="5.2" r=".7" fill="#ffde00" /><circle cx="13.4" cy="8" r=".7" fill="#ffde00" /><circle cx="11.2" cy="9.8" r=".7" fill="#ffde00" />
      </svg>
    );
  }

  if (locale === 'hi') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="6.67" fill="#ff9933" /><rect y="6.67" width="30" height="6.66" fill="#fff" /><rect y="13.33" width="30" height="6.67" fill="#138808" />
        <circle cx="15" cy="10" r="2.1" fill="none" stroke="#000080" strokeWidth=".6" />
        <circle cx="15" cy="10" r=".35" fill="#000080" />
        <g stroke="#000080" strokeWidth=".35">{[0,45,90,135].map((angle) => <line key={angle} x1="15" y1="7.9" x2="15" y2="12.1" transform={`rotate(${angle} 15 10)`} />)}</g>
      </svg>
    );
  }

  if (locale === 'es') {
    return <svg {...common} className="flagSvg"><rect width="30" height="20" fill="#aa151b" /><rect y="5" width="30" height="10" fill="#f1bf00" /></svg>;
  }

  if (locale === 'ja') {
    return <svg {...common} className="flagSvg"><rect width="30" height="20" fill="#fff" /><circle cx="15" cy="10" r="5.1" fill="#bc002d" /></svg>;
  }

  if (locale === 'it') {
    return <svg {...common} className="flagSvg"><rect width="10" height="20" fill="#009246" /><rect x="10" width="10" height="20" fill="#fff" /><rect x="20" width="10" height="20" fill="#ce2b37" /></svg>;
  }

  if (locale === 'tr') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="20" fill="#e30a17" />
        <circle cx="12.2" cy="10" r="5.1" fill="#fff" /><circle cx="14" cy="9.2" r="4.2" fill="#e30a17" />
        <polygon points="19.2,7.6 20.1,9.3 22,9.4 20.5,10.6 21,12.5 19.2,11.5 17.6,12.5 18,10.6 16.6,9.4 18.4,9.3" fill="#fff" />
      </svg>
    );
  }

  if (locale === 'nl') {
    return <svg {...common} className="flagSvg"><rect width="30" height="6.67" fill="#ae1c28" /><rect y="6.67" width="30" height="6.66" fill="#fff" /><rect y="13.33" width="30" height="6.67" fill="#21468b" /></svg>;
  }

  if (locale === 'de') {
    return <svg {...common} className="flagSvg"><rect width="30" height="6.67" fill="#000" /><rect y="6.67" width="30" height="6.66" fill="#dd0000" /><rect y="13.33" width="30" height="6.67" fill="#ffce00" /></svg>;
  }

  return <svg {...common} className="flagSvg"><rect width="10" height="20" fill="#0055a4" /><rect x="10" width="10" height="20" fill="#fff" /><rect x="20" width="10" height="20" fill="#ef4135" /></svg>;
}
