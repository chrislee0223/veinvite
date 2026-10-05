'use client';

import { Brand } from './Brand';
import { InAppInviteNotifications } from './InAppInviteNotifications';
import {
  LANGUAGE_OPTIONS,
  type SupportedLocale,
} from '@/lib/i18n/locales';

function VoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7.25 10.25 8.7 4.5h6.6l1.45 5.75"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m10.2 7.15 1.35 1.35 2.45-2.65"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="4"
        y="10.25"
        width="16"
        height="9.25"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M7.25 14h9.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"
      />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21.3 3.7 3.6 10.55c-1.2.48-1.2 1.14-.22 1.44l4.55 1.42 1.76 5.47c.22.62.11.87.77.87.51 0 .74-.23 1.03-.51l2.2-2.13 4.58 3.39c.84.46 1.45.22 1.66-.78L22.9 5.6c.31-1.25-.48-1.82-1.6-1.9Z"
        fill="currentColor"
      />
      <path
        d="m8.15 13.27 9.98-6.3c.5-.31.96-.14.58.2l-8.24 7.43-.32 3.45-2-4.78Z"
        fill="#141625"
      />
    </svg>
  );
}

const EXTERNAL_LINKS = [
  {
    href: 'https://governance.vebetterdao.org/allocations/vote',
    label: 'VeBetterDAO Vote',
    icon: <VoteIcon />,
  },
  {
    href: 'https://x.com/Veinvite',
    label: 'VeInvite on X',
    icon: <XIcon />,
  },
  {
    href: 'https://t.me/Veinvite_vet',
    label: 'VeInvite Telegram',
    icon: <TelegramIcon />,
  },
] as const;

export function AppHeader({
  locale,
  wallet,
  rewardShareUrl,
  languageAria,
  walletAria,
  onLocaleChange,
  onWalletOpen,
}: {
  locale: SupportedLocale;
  wallet: string | null;
  rewardShareUrl: string;
  languageAria: string;
  walletAria: string;
  onLocaleChange: (locale: SupportedLocale) => void;
  onWalletOpen: () => void;
}) {
  return (
    <header className="topBar">
      <Brand />
      <div className="topActions">
        <div className="utilityActions">
          <nav className="externalLinkActions" aria-label="VeInvite external links">
            {EXTERNAL_LINKS.map((link) => (
              <a
                key={link.href}
                className="headerIconLink"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                title={link.label}
              >
                {link.icon}
              </a>
            ))}
          </nav>
          <InAppInviteNotifications
            locale={locale}
            rewardShareUrl={rewardShareUrl}
          />
          <select
            className="languageSelect"
            value={locale}
            onChange={(event) =>
              onLocaleChange(event.target.value as SupportedLocale)}
            aria-label={languageAria}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.locale} value={option.locale}>
                {option.nativeName}
              </option>
            ))}
          </select>
        </div>
        {wallet ? (
          <button
            type="button"
            className="accountChip"
            onClick={onWalletOpen}
            aria-label={walletAria}
          >
            <span className="accountDot" />
            {wallet.slice(0, 6)}···{wallet.slice(-4)}
          </button>
        ) : null}
      </div>

      <style jsx>{`
        .topBar{width:min(100%,720px);margin:0 auto 26px;display:flex;align-items:center;justify-content:space-between;gap:16px}
        .topActions{min-width:0;display:flex;align-items:center;gap:8px}
        .utilityActions{min-width:0;display:flex;align-items:center;justify-content:flex-end;gap:8px}
        .externalLinkActions{display:flex;align-items:center;gap:8px}
        .headerIconLink{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;box-sizing:border-box;padding:0;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#141625;color:#b6b2bf;text-decoration:none;cursor:pointer;transition:background-color .15s ease,border-color .15s ease,color .15s ease,transform .15s ease}
        .headerIconLink :global(svg){width:20px;height:20px;display:block}
        .headerIconLink:focus-visible,.accountChip:focus-visible{outline:2px solid rgba(255,208,74,.8);outline-offset:2px}
        .headerIconLink:active,.accountChip:active{transform:translateY(0) scale(.97)}
        .languageSelect{max-width:155px;height:40px;padding:0 28px 0 11px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#141625;color:#fff;font:inherit;font-size:.76rem;font-weight:800;cursor:pointer}
        .accountChip{min-height:40px;padding:0 13px;display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#141625;color:#fff;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer;transition:background-color .15s ease,border-color .15s ease,color .15s ease,transform .15s ease}
        .accountDot{width:9px;height:9px;border-radius:50%;background:#f4b728;box-shadow:0 0 14px rgba(244,183,40,.68)}
        @media (hover:hover) and (pointer:fine){
          .headerIconLink:hover,.accountChip:hover{border-color:rgba(255,205,80,.28);background:#1a1b29;transform:translateY(-1px)}
          .headerIconLink:hover{color:#ffd04a}
          .headerIconLink:active,.accountChip:active{transform:translateY(0) scale(.97)}
        }
        @media (max-width:640px){
          .topBar{align-items:flex-start;gap:10px}
          .topBar :global(.brand span){display:none}
          .topActions{flex:1 1 auto;flex-direction:column;align-items:flex-end;gap:7px}
        }
        @media (max-width:560px){
          .utilityActions,.externalLinkActions{gap:6px}
          .headerIconLink{width:34px;height:34px;flex-basis:34px;border-radius:11px}
          .headerIconLink :global(svg){width:18px;height:18px}
          .languageSelect{max-width:108px;height:34px;padding:0 24px 0 9px;border-radius:11px;font-size:.7rem}
          .accountChip{min-height:34px;padding:0 10px;border-radius:11px;font-size:.68rem}
        }
        @media (max-width:360px){
          .topBar{display:grid;grid-template-columns:1fr;gap:8px}
          .topBar :global(.brand){justify-self:start}
          .topActions{width:100%;align-items:stretch}
          .utilityActions{justify-content:space-between}
          .accountChip{justify-self:end;align-self:flex-end}
          .languageSelect{width:96px;max-width:96px}
        }
        @media (prefers-reduced-motion:reduce){
          .headerIconLink,.accountChip{transition:none}
          .headerIconLink:hover,.headerIconLink:active,.accountChip:hover,.accountChip:active{transform:none!important}
        }
      `}</style>
    </header>
  );
}
