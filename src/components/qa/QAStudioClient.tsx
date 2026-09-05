'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  LANGUAGE_OPTIONS,
  isLocale,
  type SupportedLocale,
} from '@/lib/i18n/locales';
import {
  QA_SCENARIOS,
  QA_SURFACE_COVERAGE,
  QA_VIEWPORTS,
  getQaScenario,
  getQaViewport,
  type QaViewportId,
} from '@/qa/scenarioRegistry';

type StudioView = 'inspect' | 'gallery' | 'coverage';

type QAStudioClientProps = {
  environment: string;
  commitSha: string;
};

type ActionLogEntry = {
  scenarioId: string;
  action: string;
  detail?: string;
  timestamp: string;
};

export function QAStudioClient({
  environment,
  commitSha,
}: QAStudioClientProps) {
  const [scenarioId, setScenarioId] = useState(QA_SCENARIOS[0].id);
  const [locale, setLocale] = useState<SupportedLocale>('ko');
  const [viewportId, setViewportId] = useState<QaViewportId>('iphone');
  const [view, setView] = useState<StudioView>('inspect');
  const [compare, setCompare] = useState(false);
  const [compareLocale, setCompareLocale] = useState<SupportedLocale>('en');
  const [filter, setFilter] = useState('');
  const [queryReady, setQueryReady] = useState(false);
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);

  const scenario = getQaScenario(scenarioId);
  const viewport = getQaViewport(viewportId);

  const filteredScenarios = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return QA_SCENARIOS;

    return QA_SCENARIOS.filter((item) =>
      [item.id, item.title, item.description, ...item.tags]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [filter]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialScenario = getQaScenario(params.get('scenario'));
    const initialViewport = getQaViewport(params.get('viewport'));
    const requestedLocale = params.get('locale');
    const requestedCompareLocale = params.get('compareLocale');
    const requestedView = params.get('view');

    setScenarioId(initialScenario.id);
    setViewportId(initialViewport.id);
    setLocale(isLocale(requestedLocale) ? requestedLocale : initialScenario.defaultLocale);
    setCompareLocale(isLocale(requestedCompareLocale) ? requestedCompareLocale : 'en');
    setCompare(params.get('compare') === '1');
    setView(
      requestedView === 'gallery' || requestedView === 'coverage'
        ? requestedView
        : 'inspect',
    );
    setQueryReady(true);
  }, []);

  useEffect(() => {
    if (!queryReady) return;

    const params = new URLSearchParams(window.location.search);
    params.set('scenario', scenarioId);
    params.set('locale', locale);
    params.set('viewport', viewportId);
    params.set('view', view);

    if (compare) {
      params.set('compare', '1');
      params.set('compareLocale', compareLocale);
    } else {
      params.delete('compare');
      params.delete('compareLocale');
    }

    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [compare, compareLocale, locale, queryReady, scenarioId, view, viewportId]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as Partial<ActionLogEntry> & {
        source?: string;
        type?: string;
      };

      if (
        data.source !== 'veinvite-qa' ||
        data.type !== 'action' ||
        typeof data.scenarioId !== 'string' ||
        typeof data.action !== 'string' ||
        typeof data.timestamp !== 'string'
      ) {
        return;
      }

      setActionLog((current) => [
        {
          scenarioId: data.scenarioId as string,
          action: data.action as string,
          detail: typeof data.detail === 'string' ? data.detail : undefined,
          timestamp: data.timestamp as string,
        },
        ...current,
      ].slice(0, 40));
    };

    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  const renderUrl = (id: string, selectedLocale: SupportedLocale) =>
    `/qa/render?scenario=${encodeURIComponent(id)}&locale=${encodeURIComponent(selectedLocale)}`;

  const coveredCount = QA_SURFACE_COVERAGE.filter((item) => item.status === 'covered').length;

  return (
    <main className="qaStudio">
      <header className="studioHeader">
        <div>
          <div className="eyebrowRow">
            <span className="environmentBadge">SIMULATION · {environment.toUpperCase()}</span>
            <span className="commitBadge">{commitSha}</span>
          </div>
          <h1>VeInvite QA Studio</h1>
          <p>실제 VeInvite 컴포넌트를 격리된 Preview viewport에서 재현하고 액션·상태·다국어를 검증합니다.</p>
        </div>
        <div className="healthStrip" aria-label="QA coverage summary">
          <span><b>{QA_SCENARIOS.length}</b> 등록 시나리오</span>
          <span><b>{coveredCount}</b> 커버된 영역</span>
          <span><b>{LANGUAGE_OPTIONS.length}</b> 언어</span>
          <span className="safe"><b>BLOCKED</b> Production</span>
        </div>
      </header>

      <nav className="viewTabs" aria-label="QA Studio 보기">
        <button type="button" className={view === 'inspect' ? 'active' : ''} onClick={() => setView('inspect')}>Scenario Lab</button>
        <button type="button" className={view === 'gallery' ? 'active' : ''} onClick={() => setView('gallery')}>State Gallery</button>
        <button type="button" className={view === 'coverage' ? 'active' : ''} onClick={() => setView('coverage')}>Coverage</button>
      </nav>

      {view === 'inspect' ? (
        <section className="studioGrid">
          <aside className="controlPanel">
            <div className="panelTitle">
              <div><span>SCENARIO</span><strong>상황 선택</strong></div>
              <em>{filteredScenarios.length}</em>
            </div>

            <label className="searchField">
              <span>시나리오 검색</span>
              <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="초대, loading, network…" />
            </label>

            <div className="scenarioList">
              {filteredScenarios.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={item.id === scenario.id ? 'selected' : ''}
                  onClick={() => {
                    setScenarioId(item.id);
                    setActionLog([]);
                  }}
                >
                  <span className={`risk risk-${item.risk}`}>{item.risk}</span>
                  <strong>{item.title}</strong>
                  <small>{item.id}</small>
                </button>
              ))}
            </div>

            <div className="fieldGrid">
              <label>
                <span>언어</span>
                <select value={locale} onChange={(event) => setLocale(event.target.value as SupportedLocale)}>
                  {LANGUAGE_OPTIONS.map((option) => <option key={option.locale} value={option.locale}>{option.nativeName}</option>)}
                </select>
              </label>
              <label>
                <span>기기 viewport</span>
                <select value={viewportId} onChange={(event) => setViewportId(event.target.value as QaViewportId)}>
                  {QA_VIEWPORTS.map((option) => <option key={option.id} value={option.id}>{option.label} · {option.width}×{option.height}</option>)}
                </select>
              </label>
            </div>

            <label className="compareToggle">
              <input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} />
              <span><strong>A/B 언어 비교</strong><small>같은 상태를 실제 viewport 두 개로 동시에 확인</small></span>
            </label>

            {compare ? (
              <label className="compareLanguage">
                <span>비교 언어</span>
                <select value={compareLocale} onChange={(event) => setCompareLocale(event.target.value as SupportedLocale)}>
                  {LANGUAGE_OPTIONS.map((option) => <option key={option.locale} value={option.locale}>{option.nativeName}</option>)}
                </select>
              </label>
            ) : null}
          </aside>

          <section className="previewPanel">
            <header className="previewToolbar">
              <div><span>LIVE RENDER</span><strong>{scenario.title}</strong></div>
              <div className="viewportMeta"><b>{viewport.width}×{viewport.height}</b><span>{viewport.note}</span></div>
            </header>
            <div className={`previewScroller ${compare ? 'isCompare' : ''}`}>
              <QaFrame title={`${scenario.title} · ${locale}`} src={renderUrl(scenario.id, locale)} viewport={viewport} label={locale.toUpperCase()} />
              {compare ? <QaFrame title={`${scenario.title} · ${compareLocale}`} src={renderUrl(scenario.id, compareLocale)} viewport={viewport} label={compareLocale.toUpperCase()} /> : null}
            </div>
            <p className="viewportNote">iframe 자체의 viewport 크기를 바꾸므로 실제 CSS media query도 해당 기기 폭으로 실행됩니다. 단순히 화면을 축소한 모형이 아닙니다.</p>
          </section>

          <aside className="inspectorPanel">
            <div className="panelTitle"><div><span>INSPECTOR</span><strong>상태 · 예상 결과</strong></div></div>
            <dl className="scenarioMeta">
              <div><dt>ID</dt><dd>{scenario.id}</dd></div>
              <div><dt>Renderer</dt><dd>{scenario.renderer}</dd></div>
              <div><dt>Contract</dt><dd>v{scenario.contractVersion}</dd></div>
              <div><dt>Risk</dt><dd>{scenario.risk}</dd></div>
            </dl>
            <p className="scenarioDescription">{scenario.description}</p>

            <section className="expectations">
              <h2>Expected result</h2>
              <ul>{scenario.expected.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>

            <section className="actionInspector">
              <header><h2>Action timeline</h2><button type="button" onClick={() => setActionLog([])}>지우기</button></header>
              {actionLog.length === 0 ? (
                <p>미리보기 안에서 버튼이나 언어를 조작하면 여기에 기록됩니다.</p>
              ) : (
                <ol>
                  {actionLog.map((entry, index) => (
                    <li key={`${entry.timestamp}-${index}`}>
                      <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>
                      <strong>{entry.action}</strong>
                      {entry.detail ? <span>{entry.detail}</span> : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <div className="isolationCard"><strong>Data isolation</strong><span>이 렌더러는 VeInvite API·지갑 provider·analytics를 호출하지 않습니다. Production 데이터는 사용하지 않습니다.</span></div>
          </aside>
        </section>
      ) : view === 'gallery' ? (
        <StateGallery locale={locale} onOpen={(id) => { setScenarioId(id); setView('inspect'); }} renderUrl={renderUrl} />
      ) : (
        <CoverageView onOpen={(id) => { setScenarioId(id); setView('inspect'); }} />
      )}

      <style jsx>{`
        .qaStudio { min-height:100vh; box-sizing:border-box; padding:24px; color:#f7f5ef; background:#090909; font-family:inherit; }
        .studioHeader { width:min(100%,1600px); margin:0 auto; display:flex; justify-content:space-between; gap:24px; align-items:flex-end; }
        .eyebrowRow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .environmentBadge,.commitBadge { display:inline-flex; min-height:26px; padding:0 9px; align-items:center; border-radius:999px; font-size:.62rem; font-weight:950; letter-spacing:.08em; }
        .environmentBadge { border:1px solid rgba(244,183,40,.3); background:rgba(244,183,40,.09); color:#f3c85b; }
        .commitBadge { border:1px solid rgba(255,255,255,.09); color:#858179; }
        h1 { margin:10px 0 4px; font-size:clamp(1.8rem,3vw,2.7rem); letter-spacing:-.055em; }
        .studioHeader p { max-width:760px; margin:0; color:#8d8981; font-size:.82rem; line-height:1.55; }
        .healthStrip { display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; }
        .healthStrip span { min-height:42px; padding:0 12px; display:flex; gap:6px; align-items:center; border:1px solid rgba(255,255,255,.07); border-radius:13px; background:#111; color:#8d8981; font-size:.68rem; white-space:nowrap; }
        .healthStrip b { color:#f3f0e7; font-size:.76rem; }
        .healthStrip .safe b { color:#77d89a; }
        .viewTabs { width:min(100%,1600px); margin:20px auto 14px; display:flex; gap:6px; border-bottom:1px solid rgba(255,255,255,.07); }
        .viewTabs button { min-height:42px; padding:0 14px; border:0; border-bottom:2px solid transparent; background:transparent; color:#77736c; font:inherit; font-size:.74rem; font-weight:900; cursor:pointer; }
        .viewTabs button.active { border-bottom-color:#f4b728; color:#f0c653; }
        .studioGrid { width:min(100%,1600px); margin:0 auto; display:grid; grid-template-columns:minmax(260px,310px) minmax(0,1fr) minmax(280px,340px); gap:12px; align-items:start; }
        .controlPanel,.previewPanel,.inspectorPanel { min-width:0; border:1px solid rgba(255,255,255,.07); border-radius:18px; background:#0e0e0e; overflow:hidden; }
        .controlPanel,.inspectorPanel { padding:15px; }
        .panelTitle,.previewToolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; }
        .panelTitle > div,.previewToolbar > div:first-child { display:grid; gap:3px; }
        .panelTitle span,.previewToolbar span { color:#69655e; font-size:.57rem; font-weight:950; letter-spacing:.12em; }
        .panelTitle strong,.previewToolbar strong { font-size:.82rem; }
        .panelTitle em { min-width:26px; height:26px; display:grid; place-items:center; border-radius:9px; background:rgba(244,183,40,.1); color:#e8bc4a; font-size:.66rem; font-style:normal; font-weight:950; }
        .searchField,.fieldGrid label,.compareLanguage { display:grid; gap:6px; margin-top:14px; }
        .searchField > span,.fieldGrid label > span,.compareLanguage > span { color:#747068; font-size:.63rem; font-weight:850; }
        input,select { width:100%; min-height:43px; box-sizing:border-box; border:1px solid rgba(255,255,255,.08); border-radius:11px; outline:none; background:#151515; color:#eeeae1; padding:0 10px; font:inherit; font-size:.72rem; }
        input:focus,select:focus { border-color:rgba(244,183,40,.45); }
        .scenarioList { margin-top:10px; display:grid; gap:6px; max-height:335px; overflow:auto; }
        .scenarioList button { width:100%; min-height:68px; padding:10px; display:grid; grid-template-columns:auto 1fr; grid-template-areas:'risk title' 'risk id'; column-gap:8px; align-items:center; border:1px solid rgba(255,255,255,.06); border-radius:12px; background:#121212; color:#aaa69e; text-align:left; cursor:pointer; }
        .scenarioList button.selected { border-color:rgba(244,183,40,.3); background:rgba(244,183,40,.07); color:#f1ead8; }
        .scenarioList strong { grid-area:title; font-size:.7rem; }
        .scenarioList small { grid-area:id; color:#656159; font-size:.57rem; overflow-wrap:anywhere; }
        .risk { grid-area:risk; min-width:40px; padding:4px 5px; border-radius:7px; text-align:center; font-size:.49rem; font-weight:950; text-transform:uppercase; }
        .risk-critical { background:rgba(255,93,93,.1); color:#e89191; }
        .risk-high { background:rgba(244,183,40,.1); color:#dcb65c; }
        .risk-normal { background:rgba(120,180,255,.09); color:#8cadcf; }
        .fieldGrid { display:grid; grid-template-columns:1fr; }
        .compareToggle { margin-top:14px; padding:10px; display:flex; align-items:flex-start; gap:9px; border:1px solid rgba(255,255,255,.06); border-radius:12px; background:#121212; cursor:pointer; }
        .compareToggle input { width:17px; min-height:17px; height:17px; margin:2px 0 0; accent-color:#f4b728; }
        .compareToggle > span { display:grid; gap:2px; }
        .compareToggle strong { font-size:.68rem; }
        .compareToggle small { color:#67635c; font-size:.57rem; line-height:1.4; }
        .previewPanel { min-height:690px; }
        .previewToolbar { min-height:64px; padding:0 14px; border-bottom:1px solid rgba(255,255,255,.06); }
        .viewportMeta { display:grid; justify-items:end; gap:2px; }
        .viewportMeta b { font-size:.67rem; }
        .viewportMeta span { max-width:220px; text-align:right; letter-spacing:0; }
        .previewScroller { min-height:570px; padding:20px; display:flex; justify-content:center; align-items:flex-start; gap:18px; overflow:auto; background:radial-gradient(circle at 50% 15%,rgba(244,183,40,.055),transparent 28%),#0a0a0a; }
        .previewScroller.isCompare { justify-content:flex-start; }
        .viewportNote { margin:0; padding:10px 14px; border-top:1px solid rgba(255,255,255,.05); color:#65615a; font-size:.6rem; line-height:1.45; }
        .scenarioMeta { margin:14px 0 0; display:grid; gap:1px; overflow:hidden; border:1px solid rgba(255,255,255,.06); border-radius:11px; background:rgba(255,255,255,.04); }
        .scenarioMeta div { padding:7px 9px; display:grid; grid-template-columns:72px 1fr; gap:8px; background:#111; }
        .scenarioMeta dt { color:#656159; font-size:.57rem; }
        .scenarioMeta dd { margin:0; color:#aaa69e; font-size:.6rem; overflow-wrap:anywhere; }
        .scenarioDescription { margin:12px 0 0; color:#858078; font-size:.65rem; line-height:1.5; }
        .expectations,.actionInspector { margin-top:15px; padding-top:14px; border-top:1px solid rgba(255,255,255,.06); }
        .expectations h2,.actionInspector h2 { margin:0; font-size:.7rem; }
        .expectations ul { margin:9px 0 0; padding:0 0 0 17px; color:#98938b; font-size:.62rem; line-height:1.55; }
        .expectations li + li { margin-top:5px; }
        .actionInspector header { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .actionInspector header button { min-height:28px; border:1px solid rgba(255,255,255,.07); border-radius:8px; background:#141414; color:#77736c; font:inherit; font-size:.56rem; cursor:pointer; }
        .actionInspector > p { margin:9px 0 0; color:#605c56; font-size:.6rem; line-height:1.5; }
        .actionInspector ol { max-height:230px; margin:9px 0 0; padding:0; display:grid; gap:5px; overflow:auto; list-style:none; }
        .actionInspector li { padding:8px; display:grid; grid-template-columns:auto 1fr; gap:2px 7px; border-radius:9px; background:#121212; }
        .actionInspector time { color:#5f5b55; font-size:.52rem; }
        .actionInspector li strong { font-size:.58rem; }
        .actionInspector li span { grid-column:2; color:#77726b; font-size:.54rem; }
        .isolationCard { margin-top:15px; padding:10px; display:grid; gap:4px; border:1px solid rgba(88,199,128,.15); border-radius:11px; background:rgba(88,199,128,.045); }
        .isolationCard strong { color:#85cb9e; font-size:.62rem; }
        .isolationCard span { color:#678371; font-size:.56rem; line-height:1.45; }
        @media (max-width:1180px) { .studioGrid { grid-template-columns:280px minmax(0,1fr); } .inspectorPanel { grid-column:1 / -1; } }
        @media (max-width:760px) { .qaStudio { padding:16px 12px 30px; } .studioHeader { align-items:flex-start; flex-direction:column; } .healthStrip { justify-content:flex-start; } .studioGrid { grid-template-columns:1fr; } .inspectorPanel { grid-column:auto; } .previewScroller { justify-content:flex-start; } .viewTabs { overflow:auto; } }
      `}</style>
    </main>
  );
}

function QaFrame({
  title,
  src,
  viewport,
  label,
}: {
  title: string;
  src: string;
  viewport: { width: number; height: number };
  label: string;
}) {
  return (
    <div className="qaFrameWrap">
      <div className="qaFrameLabel"><span>{label}</span><b>{viewport.width}×{viewport.height}</b></div>
      <iframe title={title} src={src} width={viewport.width} height={viewport.height} />
      <style jsx>{`
        .qaFrameWrap { flex:0 0 auto; }
        .qaFrameLabel { min-height:30px; padding:0 8px; display:flex; align-items:center; justify-content:space-between; gap:10px; border:1px solid rgba(255,255,255,.08); border-bottom:0; border-radius:12px 12px 0 0; background:#151515; color:#77736b; font-size:.56rem; }
        .qaFrameLabel span { color:#d6ad48; font-weight:950; }
        iframe { display:block; border:1px solid rgba(255,255,255,.11); border-radius:0 0 12px 12px; background:#080807; }
      `}</style>
    </div>
  );
}

function StateGallery({
  locale,
  onOpen,
  renderUrl,
}: {
  locale: SupportedLocale;
  onOpen: (id: string) => void;
  renderUrl: (id: string, locale: SupportedLocale) => string;
}) {
  return (
    <section className="gallery">
      <header><span>STATE GALLERY</span><h2>등록된 UI 상태를 한눈에 확인</h2><p>썸네일도 실제 QA renderer를 사용합니다. 카드를 누르면 Scenario Lab에서 같은 상태를 직접 조작할 수 있습니다.</p></header>
      <div className="galleryGrid">
        {QA_SCENARIOS.map((scenario) => (
          <button type="button" key={scenario.id} onClick={() => onOpen(scenario.id)}>
            <div className="thumbCrop" aria-hidden="true"><iframe tabIndex={-1} title="" src={renderUrl(scenario.id, locale)} width="393" height="852" /></div>
            <div className="galleryCopy"><span>{scenario.category} · {scenario.risk}</span><strong>{scenario.title}</strong><small>{scenario.id}</small></div>
          </button>
        ))}
      </div>
      <style jsx>{`
        .gallery { width:min(100%,1600px); margin:0 auto; }
        header span { color:#c99e39; font-size:.6rem; font-weight:950; letter-spacing:.12em; }
        h2 { margin:5px 0 0; font-size:1.25rem; }
        header p { margin:6px 0 0; color:#77736c; font-size:.68rem; }
        .galleryGrid { margin-top:16px; display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:10px; }
        .galleryGrid > button { padding:12px; display:flex; gap:12px; align-items:center; border:1px solid rgba(255,255,255,.07); border-radius:16px; background:#0f0f0f; color:#eee; text-align:left; cursor:pointer; overflow:hidden; }
        .thumbCrop { flex:0 0 126px; width:126px; height:273px; overflow:hidden; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:#080807; }
        .thumbCrop iframe { width:393px; height:852px; border:0; transform:scale(.32); transform-origin:top left; pointer-events:none; }
        .galleryCopy { min-width:0; display:grid; gap:5px; }
        .galleryCopy span { color:#9b7931; font-size:.52rem; font-weight:900; text-transform:uppercase; }
        .galleryCopy strong { font-size:.75rem; line-height:1.35; }
        .galleryCopy small { color:#5f5b55; font-size:.56rem; overflow-wrap:anywhere; }
        @media (max-width:560px) { .galleryGrid { grid-template-columns:1fr; } }
      `}</style>
    </section>
  );
}

function CoverageView({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <section className="coverage">
      <header><span>COVERAGE MAP</span><h2>보이는 영역과 아직 등록할 영역</h2><p>새로운 사용자 화면/상태를 개발하면 이 카탈로그와 Scenario Registry를 함께 갱신하는 것을 완료 조건으로 사용합니다.</p></header>
      <div className="coverageGrid">
        {QA_SURFACE_COVERAGE.map((surface) => (
          <article key={surface.id} className={surface.status}>
            <div><span>{surface.status === 'covered' ? 'COVERED' : 'PLANNED'}</span><strong>{surface.label}</strong><small>{surface.id}</small></div>
            {surface.scenarioIds.length ? <div className="coverageActions">{surface.scenarioIds.map((id) => <button key={id} type="button" onClick={() => onOpen(id)}>{id}</button>)}</div> : <p>아직 Scenario Registry에 실제 렌더러를 연결하지 않았습니다.</p>}
          </article>
        ))}
      </div>
      <style jsx>{`
        .coverage { width:min(100%,1200px); margin:0 auto; }
        header span { color:#c99e39; font-size:.6rem; font-weight:950; letter-spacing:.12em; }
        h2 { margin:5px 0 0; font-size:1.25rem; }
        header p { max-width:780px; margin:6px 0 0; color:#77736c; font-size:.68rem; line-height:1.5; }
        .coverageGrid { margin-top:16px; display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:9px; }
        article { min-height:124px; padding:13px; display:flex; flex-direction:column; justify-content:space-between; gap:10px; border:1px solid rgba(255,255,255,.07); border-radius:14px; background:#101010; }
        article.covered { border-color:rgba(94,203,133,.18); }
        article > div:first-child { display:grid; gap:3px; }
        article > div:first-child span { color:#7a756e; font-size:.5rem; font-weight:950; letter-spacing:.1em; }
        article.covered > div:first-child span { color:#77c391; }
        article strong { font-size:.75rem; }
        article small { color:#5d5953; font-size:.56rem; }
        article p { margin:0; color:#67635c; font-size:.59rem; line-height:1.45; }
        .coverageActions { display:flex; flex-wrap:wrap; gap:5px; }
        .coverageActions button { min-height:30px; padding:0 8px; border:1px solid rgba(244,183,40,.15); border-radius:8px; background:rgba(244,183,40,.055); color:#b89544; font:inherit; font-size:.52rem; cursor:pointer; }
      `}</style>
    </section>
  );
}
