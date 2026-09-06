import {
  QA_KNOWN_STATES,
  getQaStateCoverageSummary,
  type QaKnownState,
  type QaStateCoverage,
  type QaStateLifecycle,
} from './stateRegistry';

const COVERAGE_LABEL: Record<QaStateCoverage, string> = {
  direct: '바로 재현 가능',
  partial: '부분 재현',
  missing: '직접 재현 추가 필요',
  external: '외부 UI',
};

const LIFECYCLE_LABEL: Record<QaStateLifecycle, string> = {
  production: '현재 운영',
  legacy: '과거 호환',
  future: '향후 기능',
  external: '외부 UI',
};

function StateRow({ state }: { state: QaKnownState }) {
  const scenarioId = state.scenarioIds[0];

  return (
    <li className="qaStateRow">
      <div className="qaStateMain">
        <div className="qaStateTitleLine">
          <code>{state.id}</code>
          <strong>{state.label}</strong>
        </div>
        <div className="qaStateMeta">
          <span>{state.area}</span>
          <span>{LIFECYCLE_LABEL[state.lifecycle]}</span>
          <span>{state.kind}</span>
          <span>{state.priority === 'critical' ? '중요' : state.priority === 'high' ? '주의' : '일반'}</span>
        </div>
        {state.note ? <small>{state.note}</small> : null}
      </div>
      <div className="qaStateAction">
        <span className={`qaCoverage ${state.coverage}`}>{COVERAGE_LABEL[state.coverage]}</span>
        {scenarioId ? (
          <a href={`/qa?mode=explore&scenario=${encodeURIComponent(scenarioId)}`}>
            화면 열기
          </a>
        ) : null}
      </div>
    </li>
  );
}

function StateGroup({
  title,
  states,
  defaultOpen = false,
}: {
  title: string;
  states: QaKnownState[];
  defaultOpen?: boolean;
}) {
  const missing = states.filter((state) => state.coverage === 'missing').length;
  const direct = states.filter((state) => state.coverage === 'direct').length;
  const partial = states.filter((state) => state.coverage === 'partial').length;

  return (
    <details className="qaStateGroup" open={defaultOpen}>
      <summary>
        <strong>{title}</strong>
        <span>{states.length}개</span>
        {direct > 0 ? <span>직접 {direct}</span> : null}
        {partial > 0 ? <span>부분 {partial}</span> : null}
        {missing > 0 ? <span className="missing">미등록 {missing}</span> : null}
      </summary>
      <ul>
        {states.map((state) => <StateRow key={state.id} state={state} />)}
      </ul>
    </details>
  );
}

export function QaStateInventoryPanel() {
  const summary = getQaStateCoverageSummary();
  const productionStates = QA_KNOWN_STATES.filter(
    (state) => state.lifecycle === 'production' && state.userVisible,
  );
  const legacyStates = QA_KNOWN_STATES.filter(
    (state) => state.lifecycle === 'legacy' && state.userVisible,
  );
  const transitionStates = QA_KNOWN_STATES.filter(
    (state) =>
      (state.lifecycle === 'production' || state.lifecycle === 'legacy') &&
      !state.userVisible,
  );
  const futureStates = QA_KNOWN_STATES.filter((state) => state.lifecycle === 'future');
  const externalStates = QA_KNOWN_STATES.filter((state) => state.lifecycle === 'external');

  return (
    <section className="qaInventoryShell" aria-labelledby="qa-state-inventory-title">
      <details className="qaInventoryRoot">
        <summary className="qaInventorySummary">
          <div>
            <span className="qaInventoryEyebrow">KNOWN STATE COVERAGE</span>
            <h2 id="qa-state-inventory-title">실제 앱 상태 전수 목록</h2>
            <p>Production 코드에 근거가 있는 사용자 화면과 예외 상태를 계속 이 목록에 맞춰 직접 재현 가능하게 만듭니다.</p>
          </div>
          <div className="qaInventoryCounts">
            <strong>{summary.production.total}</strong>
            <span>현재 운영 UI 상태</span>
            <small>
              직접 {summary.production.direct} · 부분 {summary.production.partial} · 미등록 {summary.production.missing}
            </small>
          </div>
        </summary>

        <div className="qaInventoryBody">
          <div className="qaInventoryNotice">
            <strong>100%의 기준</strong>
            <span>
              현재 VeInvite Production 코드에서 사용자에게 보일 수 있는 VeInvite 자체 UI 상태를 분모로 잡습니다.
              VeWorld 연결창이나 OS 공유창처럼 외부에서 그리는 UI는 별도로 분리합니다.
            </span>
          </div>

          <div className="qaInventoryMiniStats">
            <span>전체 인벤토리 <b>{summary.totalInventory}</b></span>
            <span>과거 호환 <b>{summary.legacy.total}</b></span>
            <span>향후 기능 <b>{summary.future}</b></span>
            <span>외부 UI <b>{summary.external}</b></span>
          </div>

          <StateGroup title="현재 실제 앱에서 볼 수 있는 상황" states={productionStates} defaultOpen />
          <StateGroup title="과거 초대 호환 화면" states={legacyStates} />
          <StateGroup title="복구·전환 동작" states={transitionStates} />
          <StateGroup title="향후 기능" states={futureStates} />
          <StateGroup title="VeWorld / 브라우저 / OS 외부 UI" states={externalStates} />
        </div>
      </details>

      <style jsx>{`
        .qaInventoryShell{width:min(1180px,calc(100% - 24px));margin:20px auto 64px;color:#f8f6ef}.qaInventoryRoot{border:1px solid rgba(255,255,255,.08);border-radius:22px;background:#0b0b0a;overflow:hidden}.qaInventorySummary{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 20px;cursor:pointer}.qaInventorySummary::-webkit-details-marker{display:none}.qaInventoryEyebrow{color:#e8bc45;font-size:.62rem;font-weight:950;letter-spacing:.12em}.qaInventorySummary h2{margin:4px 0 0;font-size:1.15rem;letter-spacing:-.03em}.qaInventorySummary p{max-width:680px;margin:5px 0 0;color:#8f8a80;font-size:.72rem;line-height:1.5}.qaInventoryCounts{flex:0 0 auto;display:grid;text-align:right}.qaInventoryCounts strong{font-size:1.5rem;color:#f2cf69}.qaInventoryCounts span{font-size:.68rem;font-weight:900}.qaInventoryCounts small{margin-top:3px;color:#7f7a72;font-size:.6rem}.qaInventoryBody{padding:0 20px 20px}.qaInventoryNotice{display:grid;gap:4px;padding:12px 14px;border-radius:14px;background:rgba(244,183,40,.06);border:1px solid rgba(244,183,40,.12)}.qaInventoryNotice strong{font-size:.72rem;color:#e9c85f}.qaInventoryNotice span{color:#928b7a;font-size:.66rem;line-height:1.55}.qaInventoryMiniStats{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}.qaInventoryMiniStats span{padding:6px 8px;border-radius:999px;background:rgba(255,255,255,.04);color:#8f8a80;font-size:.62rem}.qaInventoryMiniStats b{color:#d9d4ca}.qaStateGroup{margin-top:8px;border:1px solid rgba(255,255,255,.06);border-radius:15px;background:rgba(255,255,255,.018)}.qaStateGroup>summary{list-style:none;display:flex;align-items:center;gap:8px;padding:11px 12px;cursor:pointer}.qaStateGroup>summary::-webkit-details-marker{display:none}.qaStateGroup>summary strong{margin-right:auto;font-size:.72rem}.qaStateGroup>summary span{font-size:.58rem;color:#817c73}.qaStateGroup>summary .missing{color:#e8a968}.qaStateGroup ul{list-style:none;margin:0;padding:0 10px 10px;display:grid;gap:6px}.qaStateRow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 10px;border-radius:11px;background:rgba(255,255,255,.026)}.qaStateMain{min-width:0;display:grid;gap:4px}.qaStateTitleLine{display:flex;align-items:center;gap:8px;min-width:0}.qaStateTitleLine code{flex:0 0 auto;color:#8d8678;font-size:.55rem}.qaStateTitleLine strong{font-size:.68rem;overflow-wrap:anywhere}.qaStateMeta{display:flex;flex-wrap:wrap;gap:5px}.qaStateMeta span{font-size:.54rem;color:#6f6a63}.qaStateMain small{max-width:760px;color:#746f67;font-size:.56rem;line-height:1.45}.qaStateAction{flex:0 0 auto;display:flex;align-items:center;gap:7px}.qaCoverage{padding:5px 7px;border-radius:999px;font-size:.54rem;font-weight:900;background:rgba(255,255,255,.05);color:#8c877f}.qaCoverage.direct{background:rgba(78,190,124,.1);color:#8bd9aa}.qaCoverage.partial{background:rgba(244,183,40,.09);color:#e0bd63}.qaCoverage.missing{background:rgba(225,120,83,.1);color:#df9c83}.qaCoverage.external{background:rgba(132,142,170,.1);color:#aab2ca}.qaStateAction a{padding:6px 8px;border:1px solid rgba(244,183,40,.16);border-radius:8px;color:#e8c665;text-decoration:none;font-size:.56rem;font-weight:900}@media(max-width:720px){.qaInventorySummary{align-items:flex-start}.qaInventoryCounts{display:none}.qaStateRow{align-items:flex-start;flex-direction:column}.qaStateAction{width:100%;justify-content:space-between}.qaStateAction a{margin-left:auto}}
      `}</style>
    </section>
  );
}
