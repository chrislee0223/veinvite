'use client';

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { useSearchParams } from 'next/navigation';

import { Brand } from './Brand';
import { INVITEE_COPY } from '@/lib/i18n/inviteeCopy';
import {
  LANGUAGE_OPTIONS,
  isLocale,
  localeFromLanguageTag,
  type Locale,
} from '@/lib/i18n/locales';

const VEBETTER_APPS_URL = 'https://governance.vebetterdao.org/apps';

export function MissionProgressLivePreview() {
  const searchParams = useSearchParams();
  const [locale, setLocale] = useState<Locale>('ko');

  useEffect(() => {
    const requested = searchParams.get('lang');
    const resolved = localeFromLanguageTag(requested);
    const nextLocale = resolved && isLocale(resolved) ? resolved : 'ko';
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale;
  }, [searchParams]);

  const appsCompleted = useMemo(() => {
    const raw = Number(searchParams.get('progress') ?? '0');
    if (!Number.isFinite(raw)) return 0;
    return Math.min(3, Math.max(0, Math.floor(raw)));
  }, [searchParams]);

  const t = INVITEE_COPY[locale];
  const appsRequired = 3;
  const appsDone = appsCompleted >= appsRequired;
  const firstAppDone = appsCompleted >= 1;
  const conversionDone = false;
  const conversionUnlocked = firstAppDone || conversionDone;
  const voteDone = false;
  const voteUnlocked = conversionDone || voteDone;
  const appProgressStatus = `${appsCompleted}/${appsRequired}${appsDone ? ' ✓' : ''}`;

  const saveLocale = (nextLocale: Locale) => {
    setLocale(nextLocale);
    document.documentElement.lang = nextLocale;
  };

  return (
    <main className="appShell">
      <header className="appHeader">
        <Brand />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="chip">{t.invitedFriend}</span>
          <LanguageSwitcher locale={locale} onChange={saveLocale} />
        </div>
      </header>

      <section className="panel missionPanel">
        <span className="eyebrow">{t.myMissions}</span>
        <h1>{t.oneThingToDo}</h1>

        <MissionCard
          state="done"
          title={t.walletMission}
          description={t.walletMissionDescription}
          status={t.complete}
        />

        <MissionCard
          state={appsDone ? 'done' : 'current'}
          title={t.appMission}
          description={t.appMissionDescription}
          status={appProgressStatus}
          statusDirection="ltr"
          actionHref={appsDone ? undefined : VEBETTER_APPS_URL}
        />

        <MissionCard
          state={conversionDone ? 'done' : conversionUnlocked ? 'current' : 'locked'}
          title={t.conversionMission}
          description={t.conversionMissionDescription}
          status={conversionDone ? t.complete : conversionUnlocked ? t.ready : t.locked}
        />

        <MissionCard
          state={voteDone ? 'done' : voteUnlocked ? 'current' : 'locked'}
          title={t.voteMission}
          description={t.voteMissionDescription}
          status={voteDone ? t.complete : voteUnlocked ? t.ready : t.locked}
        />

        <div className="notice">{t.autoProgress}</div>
      </section>
    </main>
  );
}

function MissionCard({
  state,
  title,
  description,
  status,
  statusDirection,
  actionHref,
}: {
  state: 'done' | 'current' | 'locked';
  title: string;
  description: string;
  status: string;
  statusDirection?: 'ltr' | 'rtl';
  actionHref?: string;
}) {
  return (
    <div className={`mission ${state}`}>
      <span>{state === 'done' ? '✓' : state === 'current' ? '◎' : '◇'}</span>
      <div><b>{title}</b><p>{description}</p></div>
      <MissionStatus
        state={state}
        status={status}
        direction={statusDirection}
        href={actionHref}
        label={actionHref ? `${title}: ${status}` : undefined}
      />
    </div>
  );
}

function MissionStatus({
  state,
  status,
  direction,
  href,
  label,
}: {
  state: 'done' | 'current' | 'locked';
  status: string;
  direction?: 'ltr' | 'rtl';
  href?: string;
  label?: string;
}) {
  const style = missionStatusStyle(state, Boolean(href));

  if (href) {
    return (
      <a
        href={href}
        aria-label={label}
        dir={direction}
        style={style}
      >
        <span>{status}</span>
        <span aria-hidden="true">↗</span>
      </a>
    );
  }

  return <em dir={direction} style={style}>{status}</em>;
}

function missionStatusStyle(
  state: 'done' | 'current' | 'locked',
  actionable: boolean,
): CSSProperties {
  const palette = state === 'done'
    ? {
        color: '#78e5ac',
        borderColor: 'rgba(54,207,130,.24)',
        background: 'rgba(54,207,130,.08)',
      }
    : state === 'locked'
      ? {
          color: '#aaa69d',
          borderColor: 'rgba(255,255,255,.10)',
          background: 'rgba(255,255,255,.035)',
        }
      : {
          color: '#ffd66e',
          borderColor: 'rgba(244,183,40,.25)',
          background: 'rgba(244,183,40,.08)',
        };

  return {
    minWidth: '72px',
    minHeight: '40px',
    padding: '7px 10px',
    borderRadius: '999px',
    border: `1px solid ${palette.borderColor}`,
    background: palette.background,
    color: palette.color,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    flex: '0 0 auto',
    whiteSpace: 'nowrap',
    fontSize: '10px',
    fontStyle: 'normal',
    fontWeight: 800,
    lineHeight: 1,
    textDecoration: 'none',
    cursor: actionable ? 'pointer' : 'default',
    unicodeBidi: 'isolate',
  };
}

function LanguageSwitcher({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 10px',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.06)',
        color: '#f8f7ff',
        zIndex: 20,
      }}
    >
      <span aria-hidden="true">🌐</span>
      <select
        className="languageSelect"
        aria-label={INVITEE_COPY[locale].languageChanged}
        value={locale}
        onChange={(event) => onChange(event.target.value as Locale)}
        style={{
          border: 0,
          outline: 0,
          maxWidth: '120px',
          background: 'transparent',
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option
            key={option.locale}
            value={option.locale}
            style={{ color: '#111421' }}
          >
            {option.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
