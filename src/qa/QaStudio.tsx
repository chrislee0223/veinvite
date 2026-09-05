'use client';

import { useEffect, useMemo, useState } from 'react';

import { LANGUAGE_OPTIONS, isLocale, type Locale } from '@/lib/i18n/locales';

import { QA_SCENARIOS, QA_VIEWPORTS, getQaScenario } from './scenarioRegistry';
import type { QaActionLogEntry, QaViewportId } from './types';

const BUILD_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local';
const NETWORK = process.env.NEXT_PUBLIC_NETWORK_TYPE ?? 'preview';

function shortSha(value: string) {
  return value === 'local' ? value : value.slice(0, 8);
}

export function QaStudio() {
  const [scenarioId, setScenarioId] = useState(QA_SCENARIOS[0].id);
  const scenario = useMemo(() => getQaScenario(scenarioId), [scenarioId]);
  const [viewportId, setViewportId] = useState<QaViewportId>(scenario.viewport);
  const [locale, setLocale] = useState<Locale>(scenario.locale);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [logs, setLogs] = useState<QaActionLogEntry[]>([]);
  const [frameNonce, setFrameNonce] = useState(0);

  const viewport =
    QA_VIEWPORTS.find((candidate) => candidate.id === viewportId) ?? QA_VIEWPORTS[1];

  useEffect(() => {
    setViewportId(scenario.viewport);
    setLocale(scenario.locale);
    setLogs([]);
    setFrameNonce((value) => value + 1);
  }, [scenario]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        source?: string;
        type?: string;
        action?: string;
        result?: string;
        at?: string;
      };
      if (data.source !== 'veinvite-qa-studio' || data.type !== 'qa-action') return;

      setLogs((current) => [
        ...current.slice(-29),
        {
          id: Date.now() + Math.random(),
          at: data.at ?? new Date().toISOString(),
          action: data.action ?? 'unknown',
          result: data.result ?? '',
        },
      ]);
    };

    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  const frameUrl = `/qa/render?scenario=${encodeURIComponent(
    scenario.id,
  )}&locale=${encodeURIComponent(locale)}&v=${frameNonce}`;

  const selectScenario = (id: string) => {
    setScenarioId(id);
  };

  const reset = () => {
    setLogs([]);
    setLocale(scenario.locale);
    setViewportId(scenario.viewport);
    setFrameNonce((value) => value + 1);
  };

  return (
    <main className="qaStudio">
      <header className="qaHeader">
        <div>
          <div className="qaEyebrow">
            <span>SIMULATED</span>
            <span>PREVIEW ONLY</span>
          </div>
          <h1>VeInvite QA Studio</h1>
          <p>실제 앱 컴포넌트를 그대로 사용해 상태·기기·언어·액션을 재현합니다.</p>
        </div>
        <div className="buildMeta" aria-label="QA build information">
          <span>commit <b>{shortSha(BUILD_SHA)}</b></span>
          <span>network <b>{NETWORK}</b></span>
          <span>scenarios <b>{QA_SCENARIOS.length}</b></span>
        </div>
      </header>

      <section className="qaHealth" aria-label="QA Studio health">
        <div><b>{QA_SCENARIOS.length}</b><span>등록 시나리오</span></div>
        <div><b>{QA_SCENARIOS.filter((item) => item.risk === 'critical').length}</b><span>Critical</span></div>
        <div><b>{new Set(QA_SCENARIOS.map((item) => item.group)).size}</b><span>기능 그룹</span></div>
        <div><b>0</b><span>Production writes</span></div>
      </section>

      <div className="qaLayout">
        <aside className="scenarioRail" aria-label="QA scenarios">
          <div className="railTitle">
            <strong>State Gallery</strong>
            <span>실제 화면 상태 선택</span>
          </div>
          {Array.from(new Set(QA_SCENARIOS.map((item) => item.group))).map((group) => (
            <section key={group} className="scenarioGroup">
              <h2>{group}</h2>
              {QA_SCENARIOS.filter((item) => item.group === group).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === scenario.id ? 'active' : ''}
                  onClick={() => selectScenario(item.id)}
                >
                  <span className={`risk risk-${item.risk}`} aria-hidden="true" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              ))}
            </section>
          ))}
        </aside>

        <section className="workspace">
          <div className="toolbar">
            <label>
              <span>기기</span>
              <select value={viewportId} onChange={(event) => setViewportId(event.target.value as QaViewportId)}>
                {QA_VIEWPORTS.map((item) => (
                  <option key={item.id} value={item.id}>{item.label} · {item.note}</option>
                ))}
              </select>
            </label>
            <label>
              <span>언어</span>
              <select
                value={isLocale(locale) ? locale : 'en'}
                onChange={(event) => setLocale(event.target.value)}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.locale} value={option.locale}>
                    {option.nativeName} · {option.locale}
                  </option>
                ))}
              </select>
            </label>
            <div className="toolbarActions">
              <button type="button" onClick={() => setInspectorOpen((value) => !value)}>
                {inspectorOpen ? 'Inspector 닫기' : 'Inspector 열기'}
              </button>
              <button type="button" onClick={reset}>상태 초기화</button>
            </div>
          </div>

          <div className="scenarioIntro">
            <div>
              <span className={`riskLabel riskLabel-${scenario.risk}`}>{scenario.risk}</span>
              <h2>{scenario.title}</h2>
              <p>{scenario.description}</p>
            </div>
            <div className="tags">
              {scenario.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </div>

          <div className={`stageGrid ${inspectorOpen ? '' : 'inspectorClosed'}`}>
            <div className="deviceStage">
              <div className="deviceRuler">
                <span>{viewport.label}</span>
                <span>{viewport.width}px browser viewport</span>
              </div>
              <div className="frameScroller">
                <iframe
                  key={`${scenario.id}-${frameNonce}`}
                  title={`${scenario.title} preview`}
                  src={frameUrl}
                  style={{ width: `${viewport.width}px` }}
                />
              </div>
            </div>

            {inspectorOpen ? (
              <aside className="inspector">
                <section>
                  <div className="inspectorHeading">
                    <strong>Expected Result</strong>
                    <span>{scenario.expected.length}</span>
                  </div>
                  <ul className="expectedList">
                    {scenario.expected.map((expected) => <li key={expected}>{expected}</li>)}
                  </ul>
                </section>

                <section>
                  <div className="inspectorHeading">
                    <strong>Action Contract</strong>
                    <span>{scenario.actions.length}</span>
                  </div>
                  {scenario.actions.length ? (
                    <div className="contracts">
                      {scenario.actions.map((action) => (
                        <div key={action.id}>
                          <b>{action.label}</b>
                          <span>{action.expected}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="empty">이 시나리오는 자체 탐색형 미리보기입니다.</p>}
                </section>

                <section>
                  <div className="inspectorHeading">
                    <strong>Action Timeline</strong>
                    <button type="button" onClick={() => setLogs([])}>지우기</button>
                  </div>
                  {logs.length ? (
                    <ol className="timeline">
                      {[...logs].reverse().map((entry) => (
                        <li key={entry.id}>
                          <time>{new Date(entry.at).toLocaleTimeString()}</time>
                          <b>{entry.action}</b>
                          <span>{entry.result}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="empty">미리보기 안의 버튼을 눌러 액션을 확인하세요.</p>
                  )}
                </section>

                <section className="safetyBox">
                  <strong>Safety invariant</strong>
                  <span>QA render는 지갑 연결·API mutation·Production DB write를 실행하지 않습니다.</span>
                </section>
              </aside>
            ) : null}
          </div>
        </section>
      </div>

      <style jsx>{`
        .qaStudio{min-height:100vh;box-sizing:border-box;padding:24px;color:#f7f4eb;background:#080807;font-family:inherit}.qaHeader{max-width:1500px;margin:0 auto 18px;display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.qaEyebrow{display:flex;gap:7px}.qaEyebrow span{padding:5px 8px;border:1px solid rgba(244,183,40,.24);border-radius:999px;color:#e8c65e;background:rgba(244,183,40,.07);font-size:.6rem;font-weight:950;letter-spacing:.08em}.qaHeader h1{margin:8px 0 4px;font-size:clamp(1.9rem,4vw,3rem);letter-spacing:-.05em}.qaHeader p{margin:0;color:#8f8990;font-size:.8rem}.buildMeta{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px;color:#77717a;font-size:.65rem}.buildMeta span{padding:7px 9px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#10100f}.buildMeta b{color:#d8d2c7}.qaHealth{max-width:1500px;margin:0 auto 14px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.qaHealth div{padding:11px 13px;border:1px solid rgba(255,255,255,.06);border-radius:13px;background:#0e0e0d;display:flex;align-items:baseline;gap:8px}.qaHealth b{font-size:1.1rem}.qaHealth span{color:#77716d;font-size:.63rem}.qaLayout{max-width:1500px;margin:0 auto;display:grid;grid-template-columns:250px minmax(0,1fr);gap:12px}.scenarioRail,.workspace,.inspector{border:1px solid rgba(255,255,255,.07);background:#0d0d0c}.scenarioRail{border-radius:18px;padding:12px;align-self:start;position:sticky;top:12px;max-height:calc(100vh - 24px);overflow:auto}.railTitle{padding:5px 5px 12px;display:grid;gap:2px}.railTitle strong{font-size:.84rem}.railTitle span{color:#716d68;font-size:.62rem}.scenarioGroup{margin-top:10px}.scenarioGroup h2{margin:0 5px 6px;color:#766f64;font-size:.6rem;text-transform:uppercase;letter-spacing:.08em}.scenarioGroup button{width:100%;min-height:58px;margin:0 0 5px;padding:9px;border:1px solid transparent;border-radius:12px;background:transparent;color:#aaa39a;font:inherit;text-align:left;display:grid;grid-template-columns:8px minmax(0,1fr);gap:8px;cursor:pointer}.scenarioGroup button.active{border-color:rgba(244,183,40,.22);background:rgba(244,183,40,.07);color:#f0d27a}.scenarioGroup button>span:last-child{display:grid;gap:3px;min-width:0}.scenarioGroup strong{font-size:.69rem}.scenarioGroup small{color:#67625e;font-size:.57rem;line-height:1.35}.risk{width:7px;height:7px;margin-top:4px;border-radius:50%;background:#69645d}.risk-critical{background:#f4b728}.risk-high{background:#b9a56c}.workspace{min-width:0;border-radius:18px;padding:12px}.toolbar{display:flex;align-items:end;gap:8px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.06)}.toolbar label{display:grid;gap:5px}.toolbar label span{color:#716d68;font-size:.58rem;font-weight:850}.toolbar select,.toolbar button{min-height:40px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:#151513;color:#ddd6cb;font:inherit;font-size:.68rem;font-weight:800}.toolbar select{padding:0 32px 0 10px}.toolbarActions{margin-left:auto;display:flex;gap:6px}.toolbar button{padding:0 10px;cursor:pointer}.scenarioIntro{padding:14px 4px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.scenarioIntro h2{margin:5px 0 3px;font-size:1.2rem}.scenarioIntro p{margin:0;color:#77716d;font-size:.67rem}.riskLabel{font-size:.54rem;text-transform:uppercase;letter-spacing:.08em;font-weight:950;color:#8a847c}.riskLabel-critical{color:#f4c343}.riskLabel-high{color:#c3ae70}.tags{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px}.tags span{padding:5px 7px;border-radius:999px;background:#151513;color:#7a756f;font-size:.55rem}.stageGrid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:10px;align-items:start}.stageGrid.inspectorClosed{grid-template-columns:minmax(0,1fr)}.deviceStage{min-width:0;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:#090909;overflow:hidden}.deviceRuler{height:38px;padding:0 11px;display:flex;align-items:center;justify-content:space-between;color:#6e6963;font-size:.59rem;border-bottom:1px solid rgba(255,255,255,.06)}.frameScroller{padding:16px;overflow:auto;text-align:center}.frameScroller iframe{height:820px;max-width:none;border:1px solid rgba(255,255,255,.09);border-radius:16px;background:#080807;vertical-align:top}.inspector{border-radius:15px;padding:11px;display:grid;gap:10px;max-height:870px;overflow:auto}.inspector section{padding:10px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:#11110f}.inspectorHeading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.inspectorHeading strong{font-size:.67rem}.inspectorHeading>span{color:#77716c;font-size:.58rem}.inspectorHeading button{border:0;background:transparent;color:#847e75;font:inherit;font-size:.57rem;cursor:pointer}.expectedList{margin:0;padding-left:16px;display:grid;gap:7px}.expectedList li{color:#9a948b;font-size:.61rem;line-height:1.45}.expectedList li::marker{color:#d2b44e}.contracts{display:grid;gap:6px}.contracts div{display:grid;gap:2px;padding:7px;border-radius:8px;background:#151512}.contracts b{font-size:.6rem}.contracts span,.empty{margin:0;color:#77716d;font-size:.57rem;line-height:1.4}.timeline{list-style:none;margin:0;padding:0;display:grid;gap:7px}.timeline li{display:grid;grid-template-columns:58px 1fr;gap:2px 7px;padding-bottom:7px;border-bottom:1px solid rgba(255,255,255,.05)}.timeline time{grid-row:1/3;color:#605b56;font-size:.52rem}.timeline b{font-size:.59rem}.timeline span{color:#77716d;font-size:.55rem;line-height:1.4}.safetyBox{border-color:rgba(244,183,40,.15)!important;background:rgba(244,183,40,.04)!important;display:grid;gap:4px}.safetyBox strong{color:#d7b84d;font-size:.62rem}.safetyBox span{color:#85765b;font-size:.56rem;line-height:1.4}@media(max-width:1050px){.qaLayout{grid-template-columns:1fr}.scenarioRail{position:static;max-height:none}.scenarioGroup{display:inline}.scenarioGroup h2{margin-top:8px}.stageGrid{grid-template-columns:1fr}.inspector{max-height:none}.qaHeader{align-items:flex-start;flex-direction:column}.buildMeta{justify-content:flex-start}}@media(max-width:640px){.qaStudio{padding:12px}.qaHealth{grid-template-columns:1fr 1fr}.toolbarActions{margin-left:0;width:100%}.scenarioIntro{flex-direction:column}.tags{justify-content:flex-start}.frameScroller{padding:8px}.scenarioRail{overflow:visible}.qaHeader p{line-height:1.45}}
      `}</style>
    </main>
  );
}
