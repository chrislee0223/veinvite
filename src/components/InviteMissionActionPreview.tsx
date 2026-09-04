'use client';

import type { CSSProperties } from 'react';

import { Brand } from './Brand';
import { INVITEE_COPY } from '@/lib/i18n/inviteeCopy';

const ALLOCATION_URL = 'https://governance.vebetterdao.org/allocations';

const doneStyle: CSSProperties = {
  minWidth: '72px',
  minHeight: '40px',
  padding: '7px 10px',
  borderRadius: '999px',
  border: '1px solid rgba(54,207,130,.24)',
  background: 'rgba(54,207,130,.08)',
  color: '#78e5ac',
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
};

const currentStyle: CSSProperties = {
  ...doneStyle,
  border: '1px solid rgba(244,183,40,.25)',
  background: 'rgba(244,183,40,.08)',
  color: '#ffd66e',
};

export function InviteMissionActionPreview() {
  const t = INVITEE_COPY.ko;

  return (
    <main className="appShell">
      <header className="appHeader">
        <Brand />
        <span className="chip">PREVIEW</span>
      </header>

      <section className="panel missionPanel">
        <span className="eyebrow">{t.myMissions}</span>
        <h1>{t.oneThingToDo}</h1>

        <div className="mission done">
          <span>✓</span>
          <div>
            <b>{t.walletMission}</b>
            <p>{t.walletMissionDescription}</p>
          </div>
          <em style={doneStyle}>{t.complete}</em>
        </div>

        <div className="mission current">
          <span>◎</span>
          <div>
            <b>{t.appMission}</b>
            <p>{t.appMissionDescription}</p>
          </div>
          <em dir="ltr" style={currentStyle}>1/3</em>
        </div>

        <div className="mission done">
          <span>✓</span>
          <div>
            <b>{t.conversionMission}</b>
            <p>{t.conversionMissionDescription}</p>
          </div>
          <em style={doneStyle}>{t.complete}</em>
        </div>

        <div className="mission current">
          <span>◎</span>
          <div>
            <b>{t.voteMission}</b>
            <p>{t.voteMissionDescription}</p>
          </div>
          <a
            href={ALLOCATION_URL}
            aria-label={`${t.voteMission}: ${t.ready}`}
            style={currentStyle}
          >
            <span>{t.ready}</span>
            <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div className="notice">
          이 화면은 Preview 전용 상태입니다. 실제 앱과 동일한 미션 클래스·문구를 사용해 투표 미션이 열린 상태와 링크 동작만 확인합니다.
        </div>
      </section>
    </main>
  );
}
