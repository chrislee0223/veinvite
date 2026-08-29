import { NAV_COPY } from '@/lib/i18n/navCopy';
import type { Locale } from '@/lib/i18n/locales';

export type AppTab = 'home' | 'guide' | 'leaderboard' | 'settings';

const TABS: AppTab[] = ['home', 'guide', 'leaderboard', 'settings'];

export function AppBottomNavigation({
  activeTab,
  locale,
  onChange,
}: {
  activeTab: AppTab;
  locale: Locale;
  onChange: (tab: AppTab) => void;
}) {
  const labels = NAV_COPY[locale];

  return (
    <nav className="bottomNavigation" data-veinvite-active-tab={activeTab} aria-label={labels.ariaLabel}>
      <div>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? 'active' : ''}
            aria-current={activeTab === tab ? 'page' : undefined}
            onClick={() => onChange(tab)}
          >
            <NavIcon name={tab} />
            <span>{labels[tab]}</span>
          </button>
        ))}
      </div>

      <style jsx>{`
        .bottomNavigation { position: fixed; z-index: 90; right: 0; bottom: 0; left: 0; padding: 0 12px calc(10px + env(safe-area-inset-bottom)); pointer-events: none; background: linear-gradient(to top,rgba(7,7,7,.98) 58%,transparent); }
        .bottomNavigation > div { width: min(100%,540px); min-height: 70px; margin: 0 auto; padding: 6px; display: grid; grid-template-columns: repeat(4,1fr); border: 1px solid rgba(255,205,80,.16); border-radius: 23px; background: rgba(22,22,20,.96); box-shadow: 0 18px 55px rgba(0,0,0,.5); backdrop-filter: blur(18px); pointer-events: auto; }
        button { min-width: 0; min-height: 56px; padding: 6px 3px; display: grid; place-items: center; align-content: center; gap: 4px; border: 0; border-radius: 17px; background: transparent; color: #77736c; font: inherit; font-size: .6rem; font-weight: 850; cursor: pointer; }
        button span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        button.active { background: rgba(255,201,61,.1); color: #ffd45f; }
        button :global(svg) { width: 21px; height: 21px; }
        @media (max-width: 360px) { button { font-size: .53rem; } }
      `}</style>
    </nav>
  );
}

function NavIcon({ name }: { name: AppTab }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (name === 'home') {
    return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></svg>;
  }
  if (name === 'guide') {
    return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></svg>;
  }
  if (name === 'leaderboard') {
    return <svg {...common}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a4 4 0 0 0 4 4" /><path d="M17 6h3v1a4 4 0 0 1-4 4" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21H9.55v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H2.4V9.55h.1A1.7 1.7 0 0 0 4.1 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.56 3.7l.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V2.4h4.05v.1A1.7 1.7 0 0 0 15 4.1a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.5a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1 .4h.1v4.05H21a1.7 1.7 0 0 0-1.6 1.05Z" /></svg>;
}
