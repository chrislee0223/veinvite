'use client';

import { useEffect, useMemo, useState } from 'react';

import { LANGUAGE_OPTIONS, isLocale, type Locale } from '@/lib/i18n/locales';

import { QA_SCENARIOS, QA_VIEWPORTS, getQaScenario } from './scenarioRegistry';
import type { QaActionLogEntry, QaViewportId } from './types';

const BUILD_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local';
const NETWORK = process.env.NEXT_PUBLIC_NETWORK_TYPE ?? 'preview';
const VERDICT_STORAGE_KEY = `veinvite-qa-verdicts:${BUILD_SHA}`;
const GUIDE_STORAGE_KEY = 'veinvite-qa-guide-dismissed';

type QaVerdict = 'pass' | 'issue';
type QaBrowseMode = 'quick' | 'all';

function shortSha(value: string) {
  return value === 'local' ? value : value.slice(0, 8);
}

function riskLabel(risk: string) {
  if (risk === 'critical') return '중요';
  if (risk === 'high') return '주의';
  return '일반';
}

export function QaStudio() {
  const [scenarioId, setScenarioId] = useState(QA_SCENARIOS[0].id);
  const scenario = useMemo(() => getQaScenario(scenarioId), [scenarioId]);
  const [viewportId, setViewportId] = useState<QaViewportId>(scenario.viewport);
  const [locale, setLocale] = useState<Locale>(scenario.locale);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [browseMode, setBrowseMode] = useState<QaBrowseMode>('quick');
  const [searchQuery, setSearchQuery] = useState('');
  const [logs, setLogs] = useState<QaActionLogEntry[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, QaVerdict>>({});
  const [frameNonce, setFrameNonce] = useState(0);

  const viewport =
    QA_VIEWPORTS.find((candidate) => candidate.id === viewportId) ?? QA_VIEWPORTS[1];

  const filteredScenarios = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase();
    return QA_SCENARIOS.filter((item) => browseMode === 'all' || item.risk !== 'normal').filter(
      (item) => {
        if (!normalized) return true;
        const haystack = [item.title, item.description, item.group, ...item.tags]
          .join(' ')
          .toLocaleLowerCase();
        return haystack.includes(normalized);
      },
    );
  }, [browseMode, searchQuery]);

  const filteredGroups = useMemo(
    () => Array.from(new Set(filteredScenarios.map((item) => item.group))),
    [filteredScenarios],
  );

  const currentIndex = filteredScenarios.findIndex((item) => item.id === scenario.id);
  const checkedCount = Object.keys(verdicts).filter((id) => QA_SCENARIOS.some((item) => item.id === id)).length;
  const passCount = Object.values(verdicts).filter((value) => value === 'pass').length;
  const issueCount = Object.values(verdicts).filter((value) => value === 'issue').length;
  const uncheckedCount = Math.max(QA_SCENARIOS.length - checkedCount, 0);

  useEffect(() => {
    setViewportId(scenario.viewport);
    setLocale(scenario.locale);
    setLogs([]);
    setFrameNonce((value) => value + 1);
  }, [scenario]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VERDICT_STORAGE_KEY);
      if (saved) setVerdicts(JSON.parse(saved) as Record<string, QaVerdict>);
      setShowGuide(window.localStorage.getItem(GUIDE_STORAGE_KEY) !== 'true');
    } catch {
      setVerdicts({});
    }
  }, []);

  useEffect(() => {
    if (!filteredScenarios.length) return;
    if (!filteredScenarios.some((item) => item.id === scenarioId)) {
      setScenarioId(filteredScenarios[0].id);
    }
  }, [filteredScenarios, scenarioId]);

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

  const markVerdict = (verdict: QaVerdict) => {
    setVerdicts((current) => {
      const next = { ...current, [scenario.id]: verdict };
      try {
        window.localStorage.setItem(VERDICT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Local QA verdict persistence is best-effort only.
      }
      return next;
    });
  };

  const goRelative = (offset: number) => {
    if (!filteredScenarios.length) return;
    const base = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (base + offset + filteredScenarios.length) % filteredScenarios.length;
    setScenarioId(filteredScenarios[nextIndex].id);
  };

  const dismissGuide = () => {
    setShowGuide(false);
    try {
      window.localStorage.setItem(GUIDE_STORAGE_KEY, 'true');
    } catch {
      // Guide dismissal persistence is best-effort only.
    }
  };

  return (
    <main className={`qaStudio ${focusMode ? 'focusMode' : ''}`}>
      <header className="qaHeader">
        <div>
          <div className="qaEyebrow">
            <span>QA 전용</span>
            <span>실제 운영 데이터 변경 없음</span>
          </div>
          <h1>VeInvite 테스트 센터</h1>
          <p>상황을 고른 뒤 실제 화면을 직접 눌러보고, 정상인지 문제인지 표시하세요.</p>
        </div>
        <div className="headerActions">
          <button type="button" className="ghostButton" onClick={() => setAdvancedOpen((value) => !value)}>
            {advancedOpen ? '고급 정보 숨기기' : '고급 정보 보기'}
          </button>
          {advancedOpen ? (
            <div className="buildMeta" aria-label="QA build information">
              <span>commit <b>{shortSha(BUILD_SHA)}</b></span>
              <span>network <b>{NETWORK}</b></span>
              <span>scenarios <b>{QA_SCENARIOS.length}</b></span>
            </div>
          ) : null}
        </div>
      </header>

      {showGuide ? (
        <section className="guideCard" aria-label="QA Studio quick guide">
          <div>
            <strong>처음이라면 이렇게 확인하면 돼요</strong>
            <p><b>1.</b> 왼쪽에서 상황 선택 → <b>2.</b> 가운데 실제 화면 직접 조작 → <b>3.</b> 아래에서 정상/문제 표시</p>
          </div>
          <button type="button" onClick={dismissGuide}>알겠어요</button>
        </section>
      ) : null}

      <section className="qaSummary" aria-label="QA progress">
        <div><b>{checkedCount}/{QA_SCENARIOS.length}</b><span>확인 완료</span></div>
        <div className="summaryPass"><b>{passCount}</b><span>정상</span></div>
        <div className="summaryIssue"><b>{issueCount}</b><span>문제 있음</span></div>
        <div><b>{uncheckedCount}</b><span>아직 확인 안 함</span></div>
      </section>

      <section className="browseBar" aria-label="QA scenario browsing controls">
        <div className="modeSwitch" role="group" aria-label="점검 범위">
          <button
            type="button"
            className={browseMode === 'quick' ? 'active' : ''}
            onClick={() => setBrowseMode('quick')}
          >
            빠른 점검
          </button>
          <button
            type="button"
            className={browseMode === 'all' ? 'active' : ''}
            onClick={() => setBrowseMode('all')}
          >
            모든 상황
          </button>
        </div>
        <label className="searchBox">
          <span>상황 검색</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="예: 초대, 지갑, 보상, 모바일"
          />
        </label>
        <span className="resultCount">{filteredScenarios.length}개 표시</span>
      </section>

      <div className="qaLayout">
        <aside className="scenarioRail" aria-label="QA scenarios">
          <div className="railTitle">
            <strong>확인할 상황</strong>
            <span>{browseMode === 'quick' ? '중요한 상황만 먼저 보여줘요' : '등록된 모든 상황을 보여줘요'}</span>
          </div>
          {filteredGroups.map((group) => (
            <section key={group} className="scenarioGroup">
              <h2>{group}</h2>
              {filteredScenarios.filter((item) => item.group === group).map((item) => {
                const verdict = verdicts[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={item.id === scenario.id ? 'active' : ''}
                    onClick={() => selectScenario(item.id)}
                  >
                    <span className={`scenarioStatus ${verdict ? `status-${verdict}` : ''}`} aria-hidden="true">
                      {verdict === 'pass' ? '✓' : verdict === 'issue' ? '!' : '·'}
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
          {!filteredScenarios.length ? (
            <div className="noResults">검색 결과가 없어요. 다른 단어로 찾아보세요.</div>
          ) : null}
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
                onChange={(event) => setLocale(event.target.value as Locale)}
              >
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.locale} value={option.locale}>
                    {option.nativeName} · {option.locale}
                  </option>
                ))}
              </select>
            </label>
            <div className="toolbarActions">
              <button type="button" onClick={() => setFrameNonce((value) => value + 1)}>애니메이션 다시 보기</button>
              <button type="button" onClick={reset}>처음 상태로</button>
              <button type="button" onClick={() => setFocusMode((value) => !value)}>
                {focusMode ? '전체 메뉴 보기' : '화면만 크게 보기'}
              </button>
            </div>
          </div>

          <div className="scenarioIntro">
            <div>
              <div className="scenarioKicker">
                <span className={`riskLabel riskLabel-${scenario.risk}`}>{riskLabel(scenario.risk)}</span>
                <span>{scenario.group}</span>
                {verdicts[scenario.id] ? (
                  <span className={`verdictBadge verdict-${verdicts[scenario.id]}`}>
                    {verdicts[scenario.id] === 'pass' ? '확인 완료 · 정상' : '확인 완료 · 문제 있음'}
                  </span>
                ) : <span className="verdictBadge">미확인</span>}
              </div>
              <h2>{scenario.title}</h2>
              <p>{scenario.description}</p>
            </div>
            {advancedOpen ? (
              <div className="tags">
                {scenario.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            ) : null}
          </div>

          <div className={`stageGrid ${advancedOpen ? '' : 'advancedClosed'}`}>
            <div className="deviceStage">
              <div className="deviceRuler">
                <span>{viewport.label}</span>
                <span>{viewport.width}px 화면</span>
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

            {advancedOpen ? (
              <aside className="inspector">
                <section>
                  <div className="inspectorHeading">
                    <strong>이 화면에서 확인할 것</strong>
                    <span>{scenario.expected.length}</span>
                  </div>
                  <ul className="expectedList">
                    {scenario.expected.map((expected) => <li key={expected}>{expected}</li>)}
                  </ul>
                </section>

                <section>
                  <div className="inspectorHeading">
                    <strong>버튼 동작 기준</strong>
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
                  ) : <p className="empty">이 화면은 자유롭게 눌러보는 미리보기입니다.</p>}
                </section>

                <section>
                  <div className="inspectorHeading">
                    <strong>내가 누른 기록</strong>
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
                    <p className="empty">가운데 미리보기의 버튼을 누르면 여기에 기록돼요.</p>
                  )}
                </section>

                <section className="safetyBox">
                  <strong>안전한 QA 환경</strong>
                  <span>지갑 연결·실제 API 변경·실제 보상 지급·Production DB write는 실행하지 않습니다.</span>
                </section>
              </aside>
            ) : null}
          </div>

          <div className="reviewBar">
            <div className="reviewPrompt">
              <strong>이 화면은 괜찮아 보여요?</strong>
              <span>직접 눌러본 뒤 결과만 표시하면 됩니다.</span>
            </div>
            <div className="reviewActions">
              <button type="button" className={`passButton ${verdicts[scenario.id] === 'pass' ? 'selected' : ''}`} onClick={() => markVerdict('pass')}>
                ✓ 정상
              </button>
              <button type="button" className={`issueButton ${verdicts[scenario.id] === 'issue' ? 'selected' : ''}`} onClick={() => markVerdict('issue')}>
                ! 문제 있음
              </button>
            </div>
            <div className="navActions">
              <button type="button" onClick={() => goRelative(-1)} disabled={filteredScenarios.length <= 1}>이전</button>
              <span>{currentIndex >= 0 ? currentIndex + 1 : 0} / {filteredScenarios.length}</span>
              <button type="button" onClick={() => goRelative(1)} disabled={filteredScenarios.length <= 1}>다음</button>
            </div>
          </div>
        </section>
      </div>

      <footer className="qaFooter">
        <span>실제 운영 데이터 변경 0</span>
        <span>Production writes <b>0</b></span>
        <span>QA Preview 전용</span>
      </footer>

      <style jsx>{`
        .qaStudio{min-height:100vh;box-sizing:border-box;padding:24px;color:#f7f4eb;background:#080807;font-family:inherit}.qaHeader{max-width:1500px;margin:0 auto 16px;display:flex;align-items:flex-end;justify-content:space-between;gap:24px}.qaEyebrow{display:flex;gap:7px;flex-wrap:wrap}.qaEyebrow span{padding:6px 9px;border:1px solid rgba(244,183,40,.24);border-radius:999px;color:#e8c65e;background:rgba(244,183,40,.07);font-size:.62rem;font-weight:900;letter-spacing:.02em}.qaHeader h1{margin:9px 0 5px;font-size:clamp(2rem,4vw,3rem);letter-spacing:-.05em}.qaHeader p{margin:0;color:#918a80;font-size:.82rem;line-height:1.5}.headerActions{display:flex;align-items:flex-end;flex-direction:column;gap:8px}.ghostButton{min-height:38px;padding:0 12px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:#11110f;color:#a9a198;font:inherit;font-size:.66rem;font-weight:800;cursor:pointer}.buildMeta{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;color:#706a63;font-size:.58rem}.buildMeta span{padding:6px 8px;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:#0e0e0d}.buildMeta b{color:#cfc8bd}.guideCard{max-width:1500px;margin:0 auto 12px;padding:14px 16px;border:1px solid rgba(244,183,40,.18);border-radius:16px;background:linear-gradient(135deg,rgba(244,183,40,.08),rgba(244,183,40,.025));display:flex;align-items:center;justify-content:space-between;gap:18px}.guideCard strong{display:block;margin-bottom:5px;color:#f1d273;font-size:.84rem}.guideCard p{margin:0;color:#9a9185;font-size:.7rem;line-height:1.55}.guideCard p b{color:#d8bc62}.guideCard button{flex:0 0 auto;min-height:36px;padding:0 12px;border:1px solid rgba(244,183,40,.22);border-radius:9px;background:rgba(244,183,40,.08);color:#e5c761;font:inherit;font-size:.64rem;font-weight:850;cursor:pointer}.qaSummary{max-width:1500px;margin:0 auto 12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.qaSummary div{padding:12px 14px;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:#0e0e0d;display:flex;align-items:baseline;gap:8px}.qaSummary b{font-size:1.15rem}.qaSummary span{color:#77716d;font-size:.64rem}.summaryPass b{color:#9fd7b0}.summaryIssue b{color:#e3a2a2}.browseBar{max-width:1500px;margin:0 auto 12px;padding:9px;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:#0d0d0c;display:flex;align-items:center;gap:10px}.modeSwitch{display:flex;gap:4px;padding:3px;border-radius:10px;background:#151513}.modeSwitch button{min-height:34px;padding:0 11px;border:0;border-radius:8px;background:transparent;color:#77716d;font:inherit;font-size:.65rem;font-weight:850;cursor:pointer}.modeSwitch button.active{background:rgba(244,183,40,.1);color:#efcf70}.searchBox{min-width:240px;flex:1;display:flex;align-items:center;gap:9px}.searchBox span{color:#736d66;font-size:.61rem;font-weight:800}.searchBox input{min-width:0;flex:1;height:34px;padding:0 11px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#11110f;color:#ddd6cb;outline:none;font:inherit;font-size:.66rem}.searchBox input:focus{border-color:rgba(244,183,40,.3)}.resultCount{color:#6f6962;font-size:.6rem;white-space:nowrap}.qaLayout{max-width:1500px;margin:0 auto;display:grid;grid-template-columns:270px minmax(0,1fr);gap:12px}.scenarioRail,.workspace,.inspector{border:1px solid rgba(255,255,255,.07);background:#0d0d0c}.scenarioRail{border-radius:18px;padding:12px;align-self:start;position:sticky;top:12px;max-height:calc(100vh - 24px);overflow:auto}.railTitle{padding:5px 5px 12px;display:grid;gap:3px}.railTitle strong{font-size:.86rem}.railTitle span{color:#716d68;font-size:.62rem;line-height:1.4}.scenarioGroup{margin-top:10px}.scenarioGroup h2{margin:0 5px 6px;color:#827969;font-size:.61rem;letter-spacing:.02em}.scenarioGroup button{width:100%;min-height:62px;margin:0 0 5px;padding:9px;border:1px solid transparent;border-radius:12px;background:transparent;color:#aaa39a;font:inherit;text-align:left;display:grid;grid-template-columns:22px minmax(0,1fr);gap:8px;cursor:pointer}.scenarioGroup button:hover{background:rgba(255,255,255,.025)}.scenarioGroup button.active{border-color:rgba(244,183,40,.23);background:rgba(244,183,40,.075);color:#f0d27a}.scenarioGroup button>span:last-child{display:grid;gap:3px;min-width:0}.scenarioGroup strong{font-size:.69rem}.scenarioGroup small{color:#6d6761;font-size:.57rem;line-height:1.38}.scenarioStatus{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;background:#181816;color:#68625c;font-size:.65rem;font-weight:950}.status-pass{background:rgba(107,180,129,.13);color:#9bd3aa}.status-issue{background:rgba(204,111,111,.13);color:#dda0a0}.noResults{padding:18px 8px;color:#77716d;font-size:.65rem;line-height:1.5}.workspace{min-width:0;border-radius:18px;padding:12px}.toolbar{display:flex;align-items:end;gap:8px;flex-wrap:wrap;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.06)}.toolbar label{display:grid;gap:5px}.toolbar label span{color:#716d68;font-size:.58rem;font-weight:850}.toolbar select,.toolbar button{min-height:40px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:#151513;color:#ddd6cb;font:inherit;font-size:.67rem;font-weight:800}.toolbar select{padding:0 32px 0 10px}.toolbarActions{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}.toolbar button{padding:0 10px;cursor:pointer}.scenarioIntro{padding:15px 4px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.scenarioKicker{display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:#77716d;font-size:.58rem}.scenarioIntro h2{margin:6px 0 4px;font-size:1.25rem}.scenarioIntro p{margin:0;color:#7d766f;font-size:.68rem;line-height:1.45}.riskLabel{padding:4px 6px;border-radius:6px;background:#171714;font-size:.55rem;font-weight:900;color:#8a847c}.riskLabel-critical{color:#f4c343}.riskLabel-high{color:#c3ae70}.verdictBadge{padding:4px 7px;border:1px solid rgba(255,255,255,.06);border-radius:999px;background:#141412;color:#746f69}.verdict-pass{color:#9bd3aa;border-color:rgba(107,180,129,.18);background:rgba(107,180,129,.06)}.verdict-issue{color:#dda0a0;border-color:rgba(204,111,111,.18);background:rgba(204,111,111,.06)}.tags{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px}.tags span{padding:5px 7px;border-radius:999px;background:#151513;color:#7a756f;font-size:.55rem}.stageGrid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:10px;align-items:start}.stageGrid.advancedClosed{grid-template-columns:minmax(0,1fr)}.deviceStage{min-width:0;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:#090909;overflow:hidden}.deviceRuler{height:38px;padding:0 11px;display:flex;align-items:center;justify-content:space-between;color:#6e6963;font-size:.59rem;border-bottom:1px solid rgba(255,255,255,.06)}.frameScroller{padding:16px;overflow:auto;text-align:center;background:radial-gradient(circle at 50% 0%,rgba(244,183,40,.035),transparent 36%)}.frameScroller iframe{height:820px;max-width:none;border:1px solid rgba(255,255,255,.09);border-radius:16px;background:#080807;vertical-align:top;box-shadow:0 18px 60px rgba(0,0,0,.28)}.inspector{border-radius:15px;padding:11px;display:grid;gap:10px;max-height:870px;overflow:auto}.inspector section{padding:10px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:#11110f}.inspectorHeading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.inspectorHeading strong{font-size:.67rem}.inspectorHeading>span{color:#77716c;font-size:.58rem}.inspectorHeading button{border:0;background:transparent;color:#847e75;font:inherit;font-size:.57rem;cursor:pointer}.expectedList{margin:0;padding-left:16px;display:grid;gap:7px}.expectedList li{color:#9a948b;font-size:.61rem;line-height:1.45}.expectedList li::marker{color:#d2b44e}.contracts{display:grid;gap:6px}.contracts div{display:grid;gap:2px;padding:7px;border-radius:8px;background:#151512}.contracts b{font-size:.6rem}.contracts span,.empty{margin:0;color:#77716d;font-size:.57rem;line-height:1.4}.timeline{list-style:none;margin:0;padding:0;display:grid;gap:7px}.timeline li{display:grid;grid-template-columns:58px 1fr;gap:2px 7px;padding-bottom:7px;border-bottom:1px solid rgba(255,255,255,.05)}.timeline time{grid-row:1/3;color:#605b56;font-size:.52rem}.timeline b{font-size:.59rem}.timeline span{color:#77716d;font-size:.55rem;line-height:1.4}.safetyBox{border-color:rgba(244,183,40,.15)!important;background:rgba(244,183,40,.04)!important;display:grid;gap:4px}.safetyBox strong{color:#d7b84d;font-size:.62rem}.safetyBox span{color:#85765b;font-size:.56rem;line-height:1.4}.reviewBar{margin-top:10px;padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:#10100f;display:flex;align-items:center;gap:12px}.reviewPrompt{display:grid;gap:2px;min-width:180px}.reviewPrompt strong{font-size:.7rem}.reviewPrompt span{color:#756f68;font-size:.58rem}.reviewActions{display:flex;gap:6px}.reviewActions button,.navActions button{min-height:38px;padding:0 12px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:#151513;color:#cfc8be;font:inherit;font-size:.65rem;font-weight:850;cursor:pointer}.passButton.selected{border-color:rgba(107,180,129,.3);background:rgba(107,180,129,.1);color:#a8dab5}.issueButton.selected{border-color:rgba(204,111,111,.3);background:rgba(204,111,111,.1);color:#e0aaaa}.navActions{margin-left:auto;display:flex;align-items:center;gap:7px}.navActions span{min-width:42px;text-align:center;color:#77716d;font-size:.6rem}.navActions button:disabled{opacity:.35;cursor:default}.qaFooter{max-width:1500px;margin:12px auto 0;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;color:#655f59;font-size:.55rem}.qaFooter span{padding:5px 7px;border-radius:7px;background:#0d0d0c;border:1px solid rgba(255,255,255,.045)}.qaFooter b{color:#8b847c}.focusMode{padding:12px}.focusMode .qaHeader,.focusMode .guideCard,.focusMode .qaSummary,.focusMode .browseBar,.focusMode .scenarioRail,.focusMode .qaFooter{display:none}.focusMode .qaLayout{max-width:none;grid-template-columns:1fr}.focusMode .workspace{border-color:transparent;background:#080807}.focusMode .scenarioIntro{padding-top:8px}.focusMode .frameScroller iframe{height:calc(100vh - 230px);min-height:620px}@media(max-width:1080px){.qaLayout{grid-template-columns:1fr}.scenarioRail{position:static;max-height:none}.stageGrid{grid-template-columns:1fr}.inspector{max-height:none}.qaHeader{align-items:flex-start;flex-direction:column}.headerActions{align-items:flex-start}.buildMeta{justify-content:flex-start}}@media(max-width:720px){.qaStudio{padding:12px}.qaSummary{grid-template-columns:1fr 1fr}.browseBar{align-items:stretch;flex-direction:column}.searchBox{min-width:0}.toolbarActions{margin-left:0;width:100%}.toolbarActions button{flex:1}.scenarioIntro{flex-direction:column}.tags{justify-content:flex-start}.frameScroller{padding:8px}.scenarioRail{overflow:visible}.qaHeader p{line-height:1.45}.guideCard{align-items:flex-start;flex-direction:column}.reviewBar{align-items:stretch;flex-direction:column}.reviewActions button{flex:1}.navActions{margin-left:0;justify-content:space-between}.reviewPrompt{min-width:0}}@media(max-width:430px){.qaSummary{grid-template-columns:1fr}.modeSwitch button{flex:1}.modeSwitch{width:100%}.searchBox{align-items:stretch;flex-direction:column;gap:5px}.reviewActions{display:grid;grid-template-columns:1fr 1fr}}
      `}</style>
    </main>
  );
}
