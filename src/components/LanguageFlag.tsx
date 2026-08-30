import type { Locale } from '@/lib/i18n/locales';

type LanguageFlagProps = {
  locale: Locale;
};

type FlagStarProps = {
  cx: number;
  cy: number;
  radius: number;
  rotation?: number;
  fill: string;
};

type TrigramProps = {
  x: number;
  y: number;
  rotation: number;
  pattern: readonly [boolean, boolean, boolean];
};

function FlagStar({
  cx,
  cy,
  radius,
  rotation = 0,
  fill,
}: FlagStarProps) {
  const innerRadius = radius * 0.382;
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle =
      ((rotation - 90 + index * 36) * Math.PI) /
      180;
    const pointRadius =
      index % 2 === 0 ? radius : innerRadius;

    return `${cx + Math.cos(angle) * pointRadius},${cy + Math.sin(angle) * pointRadius}`;
  }).join(' ');

  return <polygon points={points} fill={fill} />;
}

function Trigram({
  x,
  y,
  rotation,
  pattern,
}: TrigramProps) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation})`} fill="#111">
      {pattern.map((solid, index) => {
        const barY = -1.18 + index * 1.18;

        if (solid) {
          return (
            <rect
              key={index}
              x="-2.45"
              y={barY}
              width="4.9"
              height=".58"
              rx=".06"
            />
          );
        }

        return (
          <g key={index}>
            <rect
              x="-2.45"
              y={barY}
              width="1.95"
              height=".58"
              rx=".06"
            />
            <rect
              x=".5"
              y={barY}
              width="1.95"
              height=".58"
              rx=".06"
            />
          </g>
        );
      })}
    </g>
  );
}

export function LanguageFlag({ locale }: LanguageFlagProps) {
  const common = {
    viewBox: '0 0 30 20',
    role: 'img',
    'aria-hidden': true,
    focusable: 'false',
    preserveAspectRatio: 'xMidYMid slice',
    shapeRendering: 'geometricPrecision',
  } as const;

  if (locale === 'en') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="20" fill="#fff" />
        {Array.from({ length: 7 }, (_, index) => (
          <rect
            key={index}
            y={index * (40 / 13)}
            width="30"
            height={20 / 13}
            fill="#b31942"
          />
        ))}
        <rect width="12.2" height={140 / 13} fill="#0a3161" />
        {Array.from({ length: 9 }, (_, row) => {
          const sixStarRow = row % 2 === 0;
          const count = sixStarRow ? 6 : 5;
          const startX = sixStarRow ? 1.05 : 2.02;

          return Array.from({ length: count }, (_, column) => (
            <circle
              key={`${row}-${column}`}
              cx={startX + column * 1.92}
              cy={1.02 + row * 1.08}
              r=".23"
              fill="#fff"
            />
          ));
        })}
      </svg>
    );
  }

  if (locale === 'ko') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="20" fill="#fff" />

        <g transform="rotate(-8 15 10)">
          <path
            d="M11.25 10a3.75 3.75 0 0 1 7.5 0h-7.5z"
            fill="#cd2e3a"
          />
          <path
            d="M11.25 10a3.75 3.75 0 0 0 7.5 0h-7.5z"
            fill="#0047a0"
          />
          <circle cx="13.125" cy="10" r="1.875" fill="#cd2e3a" />
          <circle cx="16.875" cy="10" r="1.875" fill="#0047a0" />
        </g>

        <Trigram
          x={6.3}
          y={4.5}
          rotation={-33}
          pattern={[true, true, true]}
        />
        <Trigram
          x={23.7}
          y={15.5}
          rotation={-33}
          pattern={[false, false, false]}
        />
        <Trigram
          x={23.7}
          y={4.5}
          rotation={33}
          pattern={[false, true, false]}
        />
        <Trigram
          x={6.3}
          y={15.5}
          rotation={33}
          pattern={[true, false, true]}
        />
      </svg>
    );
  }

  if (locale === 'zh') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="20" fill="#de2910" />
        <FlagStar cx={5.3} cy={5.2} radius={2.65} fill="#ffde00" />
        <FlagStar cx={10.2} cy={2.55} radius={.82} rotation={23} fill="#ffde00" />
        <FlagStar cx={12.05} cy={4.65} radius={.82} rotation={45} fill="#ffde00" />
        <FlagStar cx={11.85} cy={7.5} radius={.82} rotation={63} fill="#ffde00" />
        <FlagStar cx={9.85} cy={9.65} radius={.82} rotation={82} fill="#ffde00" />
      </svg>
    );
  }

  if (locale === 'hi') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="6.67" fill="#ff671f" />
        <rect y="6.67" width="30" height="6.66" fill="#fff" />
        <rect y="13.33" width="30" height="6.67" fill="#046a38" />
        <circle
          cx="15"
          cy="10"
          r="2.12"
          fill="none"
          stroke="#06038d"
          strokeWidth=".42"
        />
        <circle cx="15" cy="10" r=".28" fill="#06038d" />
        <g stroke="#06038d" strokeWidth=".16">
          {Array.from({ length: 12 }, (_, index) => (
            <line
              key={index}
              x1="15"
              y1="7.95"
              x2="15"
              y2="12.05"
              transform={`rotate(${index * 15} 15 10)`}
            />
          ))}
        </g>
      </svg>
    );
  }

  if (locale === 'es') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="20" fill="#aa151b" />
        <rect y="5" width="30" height="10" fill="#f1bf00" />
        <g transform="translate(9.2 10)">
          <rect x="-1.05" y="-2.1" width="2.1" height="3.35" rx=".25" fill="#aa151b" opacity=".92" />
          <rect x="-1.35" y="1.1" width="2.7" height=".48" rx=".18" fill="#aa151b" />
          <circle cx="0" cy="-2.45" r=".55" fill="#f1bf00" stroke="#aa151b" strokeWidth=".22" />
        </g>
      </svg>
    );
  }

  if (locale === 'ja') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="20" fill="#fff" />
        <circle cx="15" cy="10" r="6" fill="#bc002d" />
      </svg>
    );
  }

  if (locale === 'it') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="10" height="20" fill="#009246" />
        <rect x="10" width="10" height="20" fill="#fff" />
        <rect x="20" width="10" height="20" fill="#ce2b37" />
      </svg>
    );
  }

  if (locale === 'tr') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="20" fill="#e30a17" />
        <circle cx="12" cy="10" r="5.25" fill="#fff" />
        <circle cx="14" cy="10" r="4.25" fill="#e30a17" />
        <FlagStar cx={19.3} cy={10} radius={2.05} rotation={18} fill="#fff" />
      </svg>
    );
  }

  if (locale === 'nl') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="6.67" fill="#ae1c28" />
        <rect y="6.67" width="30" height="6.66" fill="#fff" />
        <rect y="13.33" width="30" height="6.67" fill="#21468b" />
      </svg>
    );
  }

  if (locale === 'de') {
    return (
      <svg {...common} className="flagSvg">
        <rect width="30" height="6.67" fill="#000" />
        <rect y="6.67" width="30" height="6.66" fill="#dd0000" />
        <rect y="13.33" width="30" height="6.67" fill="#ffce00" />
      </svg>
    );
  }

  return (
    <svg {...common} className="flagSvg">
      <rect width="10" height="20" fill="#0055a4" />
      <rect x="10" width="10" height="20" fill="#fff" />
      <rect x="20" width="10" height="20" fill="#ef4135" />
    </svg>
  );
}
