'use client';

import '@/lib/i18n/networkNativeReview';

import { NETWORK_CANARY_UI_COPY } from '@/lib/i18n/networkCanaryUiCopy';
import { NETWORK_CANVAS_CONTROL_COPY } from '@/lib/i18n/networkCanvasControlCopy';
import { NETWORK_EXPERIENCE_COPY } from '@/lib/i18n/networkExperienceCopy';
import { NETWORK_EXPLORE_COPY } from '@/lib/i18n/networkExploreCopy';
import { NETWORK_WORKSPACE_COPY } from '@/lib/i18n/networkWorkspaceCopy';
import {
  getLocaleDirection,
  type SupportedLocale,
} from '@/lib/i18n/locales';

export type QaNetworkI18nStateId =
  | 'NETWORK-I18N-MY'
  | 'NETWORK-I18N-GROUPS'
  | 'NETWORK-I18N-PUBLIC';

function countLabel(template: string, count: number): string {
  return template.replace('{count}', String(count));
}

function QaToolbar({ locale }: { locale: SupportedLocale }) {
  const c = NETWORK_CANVAS_CONTROL_COPY[locale];
  return (
    <div className="qaToolbar">
      <button type="button" aria-label={c.centerNetwork}>⌾</button>
      <button type="button" aria-label={c.zoomOut}>−</button>
      <button type="button" aria-label={c.zoomIn}>＋</button>
    </div>
  );
}

function MyNetworkState({ locale }: { locale: SupportedLocale }) {
  const t = NETWORK_EXPERIENCE_COPY[locale];
  const u = NETWORK_CANARY_UI_COPY[locale];

  return (
    <>
      <header className="qaNetworkHeader">
        <strong>{t.title}</strong>
        <QaToolbar locale={locale} />
      </header>
      <div className="qaStage">
        <div className="qaNode qaRoot">
          <span>YOU</span>
          <small>0x12…89ab</small>
        </div>
        <div className="qaNode qaPending">
          <span>…</span>
          <small>{t.pendingAcceptance}</small>
        </div>
        <div className="qaNode qaProgress">
          <span>2/4</span>
          <small>{t.inProgress}</small>
        </div>
        <div className="qaNode qaAvailable">
          <span>＋</span>
          <small>{u.available}</small>
        </div>
      </div>
    </>
  );
}

function GroupsState({ locale }: { locale: SupportedLocale }) {
  const u = NETWORK_CANARY_UI_COPY[locale];
  const w = NETWORK_WORKSPACE_COPY[locale];

  return (
    <>
      <header className="qaNetworkHeader">
        <strong>{NETWORK_EXPERIENCE_COPY[locale].title}</strong>
        <QaToolbar locale={locale} />
      </header>
      <div className="qaStage qaGroupsStage">
        <div className="qaGroupNode">
          <strong>{w.group}</strong>
          <small>{countLabel(u.peopleCount, 3)}</small>
        </div>
        <aside className="qaGroupsPanel">
          <div className="qaPanelHead">
            <strong>{w.myGroups}</strong>
            <button
              type="button"
              aria-label={NETWORK_CANVAS_CONTROL_COPY[locale].close}
            >
              ×
            </button>
          </div>
          <button type="button" className="qaGroupRow">
            <span>{w.group}</span>
            <small>{countLabel(u.peopleCount, 1)}</small>
          </button>
          <button type="button" className="qaGroupRow">
            <span>{w.groupName}</span>
            <small>{countLabel(u.peopleCount, 7)}</small>
          </button>
          <button type="button" className="qaCreateGroup">
            {w.createGroup}
          </button>
        </aside>
      </div>
    </>
  );
}

function PublicState({ locale }: { locale: SupportedLocale }) {
  const t = NETWORK_EXPERIENCE_COPY[locale];
  const c = NETWORK_CANVAS_CONTROL_COPY[locale];
  const e = NETWORK_EXPLORE_COPY[locale];
  const direction = getLocaleDirection(locale);

  return (
    <>
      <header className="qaNetworkHeader">
        <strong>{e.visibleNetwork}</strong>
        <QaToolbar locale={locale} />
      </header>
      <div className="qaStage qaPublicStage">
        <nav className="qaBreadcrumbs">
          <span>0x11…aaaa</span>
          <b>{direction === 'rtl' ? '‹' : '›'}</b>
          <span>0x22…bbbb</span>
        </nav>
        <div className="qaSearch">
          <span>{e.walletPlaceholder}</span>
          <button type="button">{e.openNetwork}</button>
        </div>
        <div className="qaPublicResult">
          <strong>friend.vet</strong>
          <small>{e.visibleNetwork}</small>
        </div>
        <button type="button" className="qaParentReturn">
          {direction === 'rtl' ? '›' : '‹'} {t.invitedBy}
        </button>
        <aside className="qaInspector">
          <strong>friend.vet</strong>
          <small>0x2222…bbbb</small>
          <div className="qaStats">
            <span><b>28</b>{t.networkSize}</span>
            <span><b>4</b>{t.direct}</span>
          </div>
          <button type="button">{c.expandBranch}</button>
        </aside>
      </div>
    </>
  );
}

export function QaNetworkI18nStateHarness({
  stateId,
  locale,
}: {
  stateId: QaNetworkI18nStateId;
  locale: SupportedLocale;
}) {
  const direction = getLocaleDirection(locale);

  return (
    <main className="qaNetworkPage" dir={direction}>
      <section className="qaNetworkCard">
        {stateId === 'NETWORK-I18N-MY' ? <MyNetworkState locale={locale} /> : null}
        {stateId === 'NETWORK-I18N-GROUPS' ? <GroupsState locale={locale} /> : null}
        {stateId === 'NETWORK-I18N-PUBLIC' ? <PublicState locale={locale} /> : null}
      </section>

      <style jsx>{`
        .qaNetworkPage{min-height:100dvh;box-sizing:border-box;padding:14px;background:#080807;color:#f8f6ef;font-family:system-ui,sans-serif}
        .qaNetworkCard{width:min(100%,520px);height:min(620px,calc(100dvh - 28px));min-height:520px;margin:0 auto;display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.06);border-radius:18px;background:#090907}
        .qaNetworkHeader{min-height:44px;padding-inline:10px 7px;display:flex;align-items:center;gap:8px;border-bottom:1px solid rgba(255,255,255,.05)}
        .qaNetworkHeader>strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d8d3ca;font-size:.68rem}
        .qaToolbar{margin-inline-start:auto;display:flex;gap:3px}
        .qaToolbar button{width:28px;height:29px;padding:0;border:1px solid rgba(255,205,80,.13);border-radius:8px;background:rgba(18,18,15,.92);color:#bbb5aa}
        .qaStage{position:relative;flex:1;min-height:0;overflow:hidden;background:radial-gradient(ellipse at 50% 50%,rgba(244,183,40,.036),transparent 36%),#080807}
        .qaNode{position:absolute;width:52px;height:52px;display:grid;place-items:center;border:1px solid rgba(210,174,65,.38);border-radius:50%;background:#0d0d0b;color:#c79f36;transform:translate(-50%,-50%)}
        .qaNode>span{font-size:.62rem;font-weight:900}
        .qaNode>small{position:absolute;top:calc(100% + 6px);left:50%;width:92px;transform:translateX(-50%);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;color:#b28c32;font-size:.48rem;font-weight:850}
        .qaRoot{left:50%;top:35%;width:74px;height:74px}.qaRoot>small{width:110px;color:#89837a}
        .qaPending{left:30%;top:70%}.qaProgress{left:50%;top:74%}.qaAvailable{left:70%;top:70%}
        .qaGroupsStage{padding:10px;box-sizing:border-box}
        .qaGroupNode{position:absolute;left:25%;top:42%;width:74px;min-height:58px;padding:8px;box-sizing:border-box;display:grid;place-items:center;border:1px solid rgba(244,183,40,.18);border-radius:13px;background:#12110e;text-align:center}
        .qaGroupNode strong{font-size:.58rem}.qaGroupNode small{font-size:.46rem;color:#8f8060}
        .qaGroupsPanel{position:absolute;inset-inline-end:0;top:8px;width:min(232px,calc(100vw - 28px));box-sizing:border-box;padding:11px;border:1px solid rgba(244,183,40,.17);border-radius:15px;background:rgba(14,14,12,.985);box-shadow:0 18px 40px rgba(0,0,0,.42)}
        .qaPanelHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.qaPanelHead strong{font-size:.62rem}.qaPanelHead button{width:27px;height:27px;border:0;background:transparent;color:#817c73}
        .qaGroupRow{width:100%;margin-top:6px;padding:7px 8px;display:block;border:1px solid rgba(255,255,255,.06);border-radius:9px;background:rgba(255,255,255,.025);color:#aaa398;text-align:start}
        .qaGroupRow span,.qaGroupRow small{display:block}.qaGroupRow span{font-size:.54rem;font-weight:900}.qaGroupRow small{margin-top:2px;color:#746e64;font-size:.46rem;white-space:normal}
        .qaCreateGroup{width:100%;min-height:33px;margin-top:8px;padding:5px 8px;border:0;border-radius:9px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font-size:.53rem;font-weight:950;white-space:normal}
        .qaPublicStage{padding-top:44px;box-sizing:border-box}
        .qaBreadcrumbs{position:absolute;inset-inline-start:8px;top:8px;max-width:calc(100% - 16px);padding:4px 6px;display:flex;gap:4px;align-items:center;overflow:hidden;border:1px solid rgba(255,205,80,.08);border-radius:8px;background:#0d0d0b;color:#8c867b;font-size:.52rem;white-space:nowrap}
        .qaBreadcrumbs span{max-width:72px;overflow:hidden;text-overflow:ellipsis}.qaBreadcrumbs b{color:#5e5749}
        .qaSearch{margin:0 6px;padding:5px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;border:1px solid rgba(255,205,80,.13);border-radius:12px;background:#0b0b09}
        .qaSearch span{min-width:0;padding:9px;border-radius:8px;background:#11110f;color:#77736c;font-size:.58rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .qaSearch button{min-height:34px;padding-inline:10px;border:0;border-radius:8px;background:#f4b728;color:#17120a;font-size:.56rem;font-weight:900;white-space:normal}
        .qaPublicResult{margin:7px 6px 0;padding:9px;display:grid;gap:3px;border:1px solid rgba(255,255,255,.05);border-radius:10px;background:#11110f}
        .qaPublicResult strong{font-size:.62rem}.qaPublicResult small{font-size:.52rem;color:#77736c}
        .qaParentReturn{position:absolute;inset-inline-start:8px;bottom:8px;min-height:34px;max-width:calc(100% - 16px);padding:4px 11px;border:1px solid rgba(255,205,80,.12);border-radius:10px;background:#12120f;color:#a89c7b;font-size:.55rem;font-weight:850;white-space:normal}
        .qaInspector{position:absolute;inset-inline:8px;bottom:52px;padding:9px;border:1px solid rgba(255,205,80,.15);border-radius:14px;background:rgba(15,15,13,.975)}
        .qaInspector>strong{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.66rem}
        .qaInspector>small{display:block;margin-top:4px;color:#67635d;font-size:.48rem;direction:ltr;unicode-bidi:isolate}
        .qaStats{margin-top:7px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}
        .qaStats span{min-width:0;padding:5px 6px;border:1px solid rgba(255,255,255,.045);border-radius:8px;color:#68645e;font-size:.46rem;overflow-wrap:anywhere}
        .qaStats b{display:block;color:#d6d0c5;font-size:.59rem}
        .qaInspector>button{width:100%;min-height:32px;margin-top:6px;padding:4px 10px;border:0;border-radius:9px;background:linear-gradient(135deg,#ffd24d,#efa718);color:#17120a;font-size:.54rem;font-weight:950;white-space:normal}
        @media(max-width:360px){.qaNetworkPage{padding:8px}.qaNetworkCard{height:calc(100dvh - 16px);min-height:500px}.qaSearch{grid-template-columns:1fr}.qaGroupsPanel{width:min(232px,calc(100vw - 16px))}}
      `}</style>
    </main>
  );
}
