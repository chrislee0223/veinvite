'use client';

import { useEffect, useMemo, useState } from 'react';

import { LANGUAGE_OPTIONS, isLocale, type Locale } from '@/lib/i18n/locales';

import { QA_SURFACE_COVERAGE } from './featureCoverageMap';
import { QA_SCENARIOS, QA_VIEWPORTS, getQaScenario } from './scenarioRegistry';
import type { QaActionLogEntry, QaScenario, QaViewportId } from './types';

const BUILD_SHA = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'local';
const NETWORK = process.env.NEXT_PUBLIC_NETWORK_TYPE ?? 'preview';
const REVIEW_STORAGE_KEY = `veinvite-qa-reviews-v2:${BUILD_SHA}`;
const GUIDED_STORAGE_KEY = `veinvite-qa-guided-v1:${BUILD_SHA}`;

type QaVerdict = 'pass' | 'issue' | 'blocked';
type QaBrowseMode = 'core' | 'all';
type QaMode = 'guided' | 'explore';
type QaFrameState = 'loading' | 'ready' | 'slow' | 'error';
type QaIssueCategory = 'layout' | 'copy' | 'motion' | 'interaction' | 'loading' | 'other';

type QaReview = {
  verdict: QaVerdict;
  reviewedAt: string;
  category?: QaIssueCategory;
  note?: string;
};

type QaReviewMap = Record<string, QaReview>;

type GuidedSession = {
  started: boolean;
  completedScenarioIds: string[];
  deferredScenarioIds: string[];
  lastScenarioId?: string;
};

const EMPTY_GUIDED_SESSION: GuidedSession = {
  started: false,
  completedScenarioIds: [],
  deferredScenarioIds: [],
};

const ISSUE_CATEGORY_LABELS: Record<QaIssueCategory, string> = {
  layout: '배치·잘림',
  copy: '문구·번역',
  motion: '애니메이션',
  interaction: '버튼·동작',
  loading: '로딩·복구',
  other: '기타',
};

function shortSha(value: string) {
  return value === 'local' ? value : value.slice(0, 8);
}

function riskLabel(risk: string) {
  if (risk === 'critical') return '중요';
  if (risk === 'high') return '주의';
  return '일반';
}

function reviewKey(scenarioId: string, viewportId: QaViewportId, locale: Locale) {
  return `${scenarioId}::${viewportId}::${locale}`;
}

function defaultReviewKey(scenario: QaScenario) {
  return reviewKey(scenario.id, scenario.viewport, scenario.locale);
}

function statusSymbol(review?: QaReview) {
  if (review?.verdict === 'pass') return '✓';
  if (review?.verdict === 'issue') return '!';
  if (review?.verdict === 'blocked') return '?';
  return '·';
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function QaStudio() {
  const coreScenarios = useMemo(() => QA_SCENARIOS.filter((item) => item.core), []);
  const [mode, setMode] = useState<QaMode>('guided');
  const [scenarioId, setScenarioId] = useState(QA_SCENARIOS[0].id);
  const scenario = useMemo(() => getQaScenario(scenarioId), [scenarioId]);
  const [viewportId, setViewportId] = useState<QaViewportId>(scenario.viewport);
  const [locale, setLocale] = useState<Locale>(scenario.locale);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [browseMode, setBrowseMode] = useState<QaBrowseMode>('core');
  const [groupFilter, setGroupFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [logs, setLogs] = useState<QaActionLogEntry[]>([]);
  const [reviews, setReviews] = useState<QaReviewMap>({});
  const [guided, setGuided] = useState<GuidedSession>(EMPTY_GUIDED_SESSION);
  const [frameNonce, setFrameNonce] = useState(0);
  const [frameState, setFrameState] = useState<QaFrameState>('loading');
  const [shareStatus, setShareStatus] = useState('');
  const [confirmPass, setConfirmPass] = useState(false);
  const [urlReady, setUrlReady] = useState(false);

  const viewport =
    QA_VIEWPORTS.find((candidate) => candidate.id === viewportId) ?? QA_VIEWPORTS[1];
  const localeControlEnabled = scenario.localeControl !== false;
  const currentReviewKey = reviewKey(scenario.id, viewportId, locale);
  const currentReview = reviews[currentReviewKey];
  const issueCount = Object.values(reviews).filter((review) => review.verdict === 'issue').length;
  const blockedCount = Object.values(reviews).filter((review) => review.verdict === 'blocked').length;
  const directCoverageCount = QA_SURFACE_COVERAGE.filter((item) => item.level === 'direct').length;

  const guidedCompleted = guided.completedScenarioIds.filter((id) =>
    coreScenarios.some((item) => item.id === id),
  );
  const guidedDeferred = guided.deferredScenarioIds.filter((id) =>
    coreScenarios.some((item) => item.id === id),
  );
  const guidedSeenCount = unique([...guidedCompleted, ...guidedDeferred]).length;
  const guidedFinished = guidedSeenCount >= coreScenarios.length;

  const browseScenarios = useMemo(
    () => QA_SCENARIOS.filter((item) => browseMode === 'all' || item.core),
    [browseMode],
  );

  const availableGroups = useMemo(
    () => Array.from(new Set(browseScenarios.map((item) => item.group))),
    [browseScenarios],
  );

  const filteredScenarios = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase();
    return browseScenarios
      .filter((item) => groupFilter === 'all' || item.group === groupFilter)
      .filter((item) => {
        if (!normalized) return true;
        return [
          item.caseId,
          item.title,
          item.description,
          item.group,
          item.context.actor,
          item.context.trigger,
          item.context.state,
          item.context.outcome,
          item.guide.task,
          ...item.tags,
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalized);
      });
  }, [browseScenarios, groupFilter, searchQuery]);

  const filteredGroups = useMemo(
    () => Array.from(new Set(filteredScenarios.map((item) => item.group))),
    [filteredScenarios],
  );
  const currentIndex = filteredScenarios.findIndex((item) => item.id === scenario.id);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const requestedScenario = getQaScenario(params.get('scenario') ?? QA_SCENARIOS[0].id);
      const requestedViewport = QA_VIEWPORTS.find((item) => item.id === params.get('viewport'));
      const requestedLocale = params.get('locale');
      const requestedMode = params.get('mode');

      setMode(requestedMode === 'explore' ? 'explore' : 'guided');
      setScenarioId(requestedScenario.id);
      setViewportId(requestedViewport?.id ?? requestedScenario.viewport);
      setLocale(
        requestedScenario.localeControl !== false && isLocale(requestedLocale)
          ? requestedLocale
          : requestedScenario.locale,
      );

      const savedReviews = window.localStorage.getItem(REVIEW_STORAGE_KEY);
      if (savedReviews) setReviews(JSON.parse(savedReviews) as QaReviewMap);
      const savedGuided = window.localStorage.getItem(GUIDED_STORAGE_KEY);
      if (savedGuided) {
        const parsed = JSON.parse(savedGuided) as GuidedSession;
        setGuided({
          started: Boolean(parsed.started),
          completedScenarioIds: Array.isArray(parsed.completedScenarioIds)
            ? parsed.completedScenarioIds
            : [],
          deferredScenarioIds: Array.isArray(parsed.deferredScenarioIds)
            ? parsed.deferredScenarioIds
            : [],
          lastScenarioId: parsed.lastScenarioId,
        });
      }
    } catch {
      setReviews({});
      setGuided(EMPTY_GUIDED_SESSION);
    } finally {
      setUrlReady(true);
    }
  }, []);

  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set('mode', mode);
    url.searchParams.set('scenario', scenario.id);
    url.searchParams.set('viewport', viewportId);
    url.searchParams.set('locale', locale);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [locale, mode, scenario.id, urlReady, viewportId]);

  useEffect(() => {
    if (groupFilter !== 'all' && !availableGroups.includes(groupFilter)) {
      setGroupFilter('all');
    }
  }, [availableGroups, groupFilter]);

  useEffect(() => {
    if (mode !== 'explore' || !filteredScenarios.length) return;
    if (!filteredScenarios.some((item) => item.id === scenarioId)) {
      const next = filteredScenarios[0];
      setScenarioId(next.id);
      setViewportId(next.viewport);
      setLocale(next.locale);
      setLogs([]);
      setFrameState('loading');
      setFrameNonce((value) => value + 1);
    }
  }, [filteredScenarios, mode, scenarioId]);

  useEffect(() => {
    setFrameState('loading');
    const timer = window.setTimeout(() => {
      setFrameState((state) => (state === 'loading' ? 'slow' : state));
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [frameNonce, locale, scenario.id, viewportId]);

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
      setConfirmPass(false);
    };

    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  const frameUrl = `/qa/render?scenario=${encodeURIComponent(
    scenario.id,
  )}&locale=${encodeURIComponent(locale)}&v=${frameNonce}`;

  const persistReviews = (next: QaReviewMap) => {
    try {
      window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Local QA review persistence is best-effort only.
    }
  };

  const persistGuided = (next: GuidedSession) => {
    setGuided(next);
    try {
      window.localStorage.setItem(GUIDED_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Guided session persistence is best-effort only.
    }
  };

  const selectScenario = (id: string) => {
    const next = getQaScenario(id);
    setScenarioId(next.id);
    setViewportId(next.viewport);
    setLocale(next.locale);
    setLogs([]);
    setShareStatus('');
    setConfirmPass(false);
    setFrameState('loading');
    setFrameNonce((value) => value + 1);
  };

  const reloadFrame = () => {
    setLogs([]);
    setConfirmPass(false);
    setFrameState('loading');
    setFrameNonce((value) => value + 1);
  };

  const resetScenario = () => {
    setLocale(scenario.locale);
    setViewportId(scenario.viewport);
    reloadFrame();
  };

  const markReview = (verdict: QaVerdict) => {
    setReviews((current) => {
      const existing = current[currentReviewKey];
      const next = {
        ...current,
        [currentReviewKey]: {
          verdict,
          reviewedAt: new Date().toISOString(),
          category: verdict === 'issue' ? existing?.category ?? 'other' : undefined,
          note: verdict === 'issue' ? existing?.note : undefined,
        },
      } satisfies QaReviewMap;
      persistReviews(next);
      return next;
    });
  };

  const clearReview = () => {
    setReviews((current) => {
      const next = { ...current };
      delete next[currentReviewKey];
      persistReviews(next);
      return next;
    });
  };

  const updateIssueDetail = (patch: Partial<Pick<QaReview, 'category' | 'note'>>) => {
    setReviews((current) => {
      const existing = current[currentReviewKey];
      if (!existing || existing.verdict !== 'issue') return current;
      const next = {
        ...current,
        [currentReviewKey]: { ...existing, ...patch },
      };
      persistReviews(next);
      return next;
    });
  };

  const findNextGuided = (completed: string[], deferred: string[], afterId?: string) => {
    const available = coreScenarios.filter(
      (item) => !completed.includes(item.id) && !deferred.includes(item.id),
    );
    if (!available.length) return undefined;
    if (!afterId) return available[0];
    const afterIndex = coreScenarios.findIndex((item) => item.id === afterId);
    return (
      coreScenarios.slice(afterIndex + 1).find((item) => available.some((a) => a.id === item.id)) ??
      available[0]
    );
  };

  const startGuided = () => {
    const completed = guidedCompleted;
    const deferred = guidedDeferred;
    const preferred =
      (guided.lastScenarioId &&
        coreScenarios.find(
          (item) =>
            item.id === guided.lastScenarioId &&
            !completed.includes(item.id) &&
            !deferred.includes(item.id),
        )) ||
      findNextGuided(completed, deferred) ||
      coreScenarios[0];
    persistGuided({ ...guided, started: true, lastScenarioId: preferred?.id });
    if (preferred) selectScenario(preferred.id);
  };

  const advanceGuided = (completed: string[], deferred: string[]) => {
    const next = findNextGuided(completed, deferred, scenario.id);
    const nextSession: GuidedSession = {
      started: true,
      completedScenarioIds: completed,
      deferredScenarioIds: deferred,
      lastScenarioId: next?.id ?? scenario.id,
    };
    persistGuided(nextSession);
    if (next) selectScenario(next.id);
  };

  const completeGuidedScenario = () => {
    const completed = unique([...guidedCompleted, scenario.id]);
    const deferred = guidedDeferred.filter((id) => id !== scenario.id);
    advanceGuided(completed, deferred);
  };

  const deferGuidedScenario = () => {
    const completed = guidedCompleted.filter((id) => id !== scenario.id);
    const deferred = unique([...guidedDeferred, scenario.id]);
    advanceGuided(completed, deferred);
  };

  const revisitDeferred = () => {
    const first = coreScenarios.find((item) => guidedDeferred.includes(item.id));
    const next: GuidedSession = {
      ...guided,
      started: true,
      deferredScenarioIds: [],
      lastScenarioId: first?.id,
    };
    persistGuided(next);
    if (first) selectScenario(first.id);
  };

  const restartGuided = () => {
    const first = coreScenarios[0];
    const next: GuidedSession = {
      started: true,
      completedScenarioIds: [],
      deferredScenarioIds: [],
      lastScenarioId: first?.id,
    };
    persistGuided(next);
    if (first) selectScenario(first.id);
  };

  const handleGuidedPass = (force = false) => {
    if (scenario.guide.requireAction && logs.length === 0 && !force) {
      setConfirmPass(true);
      return;
    }
    markReview('pass');
    completeGuidedScenario();
  };

  const handleGuidedIssue = () => {
    markReview('issue');
    setConfirmPass(false);
  };

  const handleGuidedBlocked = () => {
    markReview('blocked');
    completeGuidedScenario();
  };

  const goRelative = (offset: number) => {
    if (!filteredScenarios.length) return;
    const base = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (base + offset + filteredScenarios.length) % filteredScenarios.length;
    selectScenario(filteredScenarios[nextIndex].id);
  };

  const copyCurrentLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', mode);
    url.searchParams.set('scenario', scenario.id);
    url.searchParams.set('viewport', viewportId);
    url.searchParams.set('locale', locale);
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareStatus('현재 설정 링크를 복사했어요.');
    } catch {
      setShareStatus('주소창의 현재 URL을 복사하면 같은 설정으로 다시 열 수 있어요.');
    }
  };

  const frameStatusText =
    frameState === 'ready'
      ? '로드 완료'
      : frameState === 'slow'
        ? '로딩이 오래 걸리고 있어요'
        : frameState === 'error'
          ? '미리보기를 불러오지 못했어요'
          : '불러오는 중';

  const renderDeviceStage = () => (
    <div className="deviceStage">
      <div className="deviceRuler">
        <span>{viewport.label} · {viewport.width} × {viewport.height}</span>
        <span className={`frameState frame-${frameState}`}>{frameStatusText}</span>
      </div>
      <div className="frameScroller">
        <iframe
          key={`${scenario.id}-${frameNonce}`}
          title={`${scenario.title} preview`}
          src={frameUrl}
          onLoad={() => setFrameState('ready')}
          onError={() => setFrameState('error')}
          style={{ width: `${viewport.width}px`, height: `${viewport.height}px` }}
        />
      </div>
      {frameState === 'slow' || frameState === 'error' ? (
        <div className="frameRecovery">
          <span>{frameStatusText}</span>
          <button type="button" onClick={reloadFrame}>다시 시도</button>
        </div>
      ) : null}
    </div>
  );

  const renderEnvironmentControls = () => (
    <div className="environmentPanel">
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
          disabled={!localeControlEnabled}
          onChange={(event) => setLocale(event.target.value as Locale)}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.locale} value={option.locale}>
              {option.nativeName} · {option.locale}
            </option>
          ))}
        </select>
        {!localeControlEnabled ? <small>이 화면은 내부 언어 상태를 사용해요.</small> : null}
      </label>
      <div className="environmentActions">
        <button type="button" onClick={reloadFrame}>화면 다시 불러오기</button>
        <button type="button" onClick={resetScenario}>기본 설정으로</button>
        <button type="button" onClick={copyCurrentLink}>현재 설정 링크 복사</button>
        <button type="button" onClick={() => setFocusMode(true)}>앱 화면만 보기</button>
      </div>
    </div>
  );

  const renderIssueEditor = (guidedMode: boolean) =>
    currentReview?.verdict === 'issue' ? (
      <section className="issueEditor" aria-label="문제 기록">
        <label>
          <span>문제 종류</span>
          <select
            value={currentReview.category ?? 'other'}
            onChange={(event) => updateIssueDetail({ category: event.target.value as QaIssueCategory })}
          >
            {Object.entries(ISSUE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="issueNote">
          <span>짧은 메모</span>
          <textarea
            value={currentReview.note ?? ''}
            onChange={(event) => updateIssueDetail({ note: event.target.value.slice(0, 500) })}
            placeholder="예: 모바일에서 버튼 글자가 두 줄로 잘림"
          />
        </label>
        <small>현재 상황·기기·언어·빌드와 함께 이 브라우저에 저장됩니다.</small>
        {guidedMode ? (
          <div className="issueContinue">
            <button type="button" className="primaryButton" onClick={completeGuidedScenario}>
              문제 기록 후 다음 상황
            </button>
            <button type="button" onClick={() => setEnvironmentOpen(true)}>이 화면 더 확인하기</button>
          </div>
        ) : null}
      </section>
    ) : null;

  return (
    <main className={`qaStudio ${focusMode ? 'focusMode' : ''}`}>
      <button type="button" className="focusExit" onClick={() => setFocusMode(false)}>
        QA 화면으로 돌아가기
      </button>

      <header className="compactHeader">
        <div>
          <span className="qaBadge">QA 전용</span>
          <h1>VeInvite 테스트 센터</h1>
          <p>{mode === 'guided' ? '안내대로 하나씩 확인하면 됩니다.' : '전체 상황을 자유롭게 찾아볼 수 있어요.'}</p>
        </div>
        <div className="compactHeaderActions">
          <span className="compactProgress">핵심 {guidedCompleted.length}/{coreScenarios.length} · 문제 {issueCount}</span>
          {mode === 'guided' ? (
            <button type="button" onClick={() => setMode('explore')}>전체 상황 보기</button>
          ) : (
            <button type="button" className="primaryButton" onClick={() => setMode('guided')}>따라서 점검하기</button>
          )}
        </div>
      </header>

      {mode === 'guided' && !guided.started ? (
        <section className="startCard">
          <span className="startEyebrow">이번 빌드 핵심 점검</span>
          <h2>{guidedCompleted.length ? '지난 점검을 이어서 할까요?' : '어디부터 볼지 고민하지 않아도 돼요.'}</h2>
          <p>중요한 상황 {coreScenarios.length}개를 순서대로 보여드릴게요. 화면을 확인한 뒤 결과만 선택하면 됩니다.</p>
          <div className="startStats">
            <div><b>{guidedCompleted.length}</b><span>확인 완료</span></div>
            <div><b>{coreScenarios.length - guidedSeenCount}</b><span>아직 안 봄</span></div>
            <div><b>{guidedDeferred.length}</b><span>나중에 확인</span></div>
          </div>
          <div className="startActions">
            <button type="button" className="startButton" onClick={startGuided}>
              {guidedCompleted.length || guidedDeferred.length ? '이어서 점검' : '점검 시작'}
            </button>
            <button type="button" onClick={() => setMode('explore')}>원하는 상황 직접 보기</button>
          </div>
        </section>
      ) : null}

      {mode === 'guided' && guided.started && guidedFinished ? (
        <section className="completionCard">
          <span>핵심 점검 결과</span>
          <h2>{guidedDeferred.length ? '한 번 둘러봤어요. 미룬 항목이 남아 있어요.' : '핵심 점검 완료 ✓'}</h2>
          <div className="completionStats">
            <div><b>{guidedCompleted.length}</b><span>확인 완료</span></div>
            <div><b>{issueCount}</b><span>문제 있음</span></div>
            <div><b>{blockedCount}</b><span>잘 모르겠음</span></div>
            <div><b>{guidedDeferred.length}</b><span>나중에 확인</span></div>
          </div>
          <div className="completionActions">
            {guidedDeferred.length ? (
              <button type="button" className="primaryButton" onClick={revisitDeferred}>미룬 항목 확인</button>
            ) : null}
            <button type="button" onClick={restartGuided}>핵심 점검 다시 시작</button>
            <button type="button" onClick={() => setMode('explore')}>전체 상황 보기</button>
          </div>
        </section>
      ) : null}

      {mode === 'guided' && guided.started && !guidedFinished ? (
        <section className="guidedWorkspace">
          <div className="guidedProgressRow">
            <span>{guidedSeenCount + 1} / {coreScenarios.length}</span>
            <div className="progressTrack"><i style={{ width: `${Math.min(100, (guidedSeenCount / coreScenarios.length) * 100)}%` }} /></div>
            <button type="button" onClick={() => setEnvironmentOpen((value) => !value)}>
              {environmentOpen ? '환경 설정 닫기' : '환경 바꾸기'}
            </button>
            <button type="button" onClick={() => setAdvancedOpen((value) => !value)}>
              {advancedOpen ? '고급 정보 숨기기' : '고급 정보 보기'}
            </button>
          </div>

          {environmentOpen ? renderEnvironmentControls() : null}
          {shareStatus ? <p className="shareStatus">{shareStatus}</p> : null}

          <section className="guidedTaskCard">
            <div className="taskTopline">
              <span className="caseIdBadge">{scenario.caseId}</span>
              <span>{scenario.group}</span>
              <span className={`riskLabel riskLabel-${scenario.risk}`}>{riskLabel(scenario.risk)}</span>
            </div>
            <div className="taskSituation">
              <span>지금 확인할 상황</span>
              <h2>{scenario.context.state}</h2>
              <p>{scenario.context.actor} · {scenario.context.trigger}</p>
            </div>
            <div className="taskInstruction">
              <span>지금 할 일</span>
              <strong>{scenario.guide.task}</strong>
            </div>
            <div className="taskSuccess">
              <span>이러면 정상</span>
              <p>{scenario.guide.done}</p>
            </div>
          </section>

          <div className={`guidedStage ${advancedOpen ? 'withInspector' : ''}`}>
            {renderDeviceStage()}
            {advancedOpen ? (
              <aside className="inspector">
                <section>
                  <div className="inspectorHeading"><strong>세부 확인 기준</strong><span>{scenario.expected.length}</span></div>
                  <ul className="expectedList">{scenario.expected.map((item) => <li key={item}>{item}</li>)}</ul>
                </section>
                <section>
                  <div className="inspectorHeading"><strong>내가 누른 기록</strong><button type="button" onClick={() => setLogs([])}>지우기</button></div>
                  {logs.length ? (
                    <ol className="timeline">{[...logs].reverse().map((entry) => (
                      <li key={entry.id}><time>{new Date(entry.at).toLocaleTimeString()}</time><b>{entry.action}</b><span>{entry.result}</span></li>
                    ))}</ol>
                  ) : <p className="empty">아직 앱 화면에서 기록된 동작이 없어요.</p>}
                </section>
                <section className="safetyBox">
                  <strong>안전한 QA 환경</strong>
                  <span>지갑 연결·실제 API 변경·실제 보상 지급·Production DB write는 실행하지 않습니다.</span>
                </section>
              </aside>
            ) : null}
          </div>

          {confirmPass ? (
            <div className="actionReminder">
              <div><strong>아직 앱 화면의 버튼을 눌러본 기록이 없어요.</strong><span>버튼을 한 번 눌러본 뒤 확인하는 걸 권장해요.</span></div>
              <button type="button" onClick={() => setConfirmPass(false)}>계속 확인</button>
              <button type="button" onClick={() => handleGuidedPass(true)}>그래도 이상 없음 처리</button>
            </div>
          ) : null}

          {renderIssueEditor(true)}

          <div className="guidedActionBar">
            <div>
              <strong>{scenario.caseId} · 확인 결과</strong>
              <span>{currentReview ? `현재: ${currentReview.verdict === 'pass' ? '이상 없음' : currentReview.verdict === 'issue' ? '문제 있음' : '잘 모르겠음'}` : '화면을 확인한 뒤 하나만 선택하세요.'}</span>
            </div>
            <div className="guidedActions">
              <button type="button" className="passButton" onClick={() => handleGuidedPass(false)}>✓ 이상 없음 · 다음</button>
              <button type="button" className="issueButton" onClick={handleGuidedIssue}>! 문제 있음</button>
              <button type="button" className="blockedButton" onClick={handleGuidedBlocked}>? 잘 모르겠어요</button>
              <button type="button" className="deferButton" onClick={deferGuidedScenario}>나중에 확인</button>
            </div>
          </div>
        </section>
      ) : null}

      {mode === 'explore' ? (
        <>
          <section className="exploreControls">
            <div className="modeSwitch" role="group" aria-label="점검 범위">
              <button type="button" className={browseMode === 'core' ? 'active' : ''} onClick={() => setBrowseMode('core')}>핵심 점검</button>
              <button type="button" className={browseMode === 'all' ? 'active' : ''} onClick={() => setBrowseMode('all')}>모든 상황</button>
            </div>
            <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} aria-label="영역 필터">
              <option value="all">전체 영역 · {browseScenarios.length}</option>
              {availableGroups.map((group) => (
                <option key={group} value={group}>{group} · {browseScenarios.filter((item) => item.group === group).length}</option>
              ))}
            </select>
            <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="상황 검색 · 예: 신규 사용자, 보상, 거절" />
            <span>{filteredScenarios.length}개 표시</span>
          </section>

          <div className="qaLayout">
            <aside className="scenarioRail" aria-label="QA scenarios">
              <div className="railTitle"><strong>확인할 상황</strong><span>원하는 상황을 선택하세요.</span></div>
              {filteredGroups.map((group) => (
                <section key={group} className="scenarioGroup">
                  <h2>{group}</h2>
                  {filteredScenarios.filter((item) => item.group === group).map((item) => {
                    const review = reviews[defaultReviewKey(item)];
                    return (
                      <button key={item.id} type="button" className={item.id === scenario.id ? 'active' : ''} onClick={() => selectScenario(item.id)}>
                        <span className={`scenarioStatus ${review ? `status-${review.verdict}` : ''}`}>{statusSymbol(review)}</span>
                        <span><b>{item.caseId}</b><strong>{item.context.state}</strong><small>{item.context.actor} · {item.context.trigger}</small></span>
                      </button>
                    );
                  })}
                </section>
              ))}
              {!filteredScenarios.length ? <div className="noResults">검색 결과가 없어요.</div> : null}
            </aside>

            <section className="workspace">
              {renderEnvironmentControls()}
              {shareStatus ? <p className="shareStatus">{shareStatus}</p> : null}
              <section className="exploreIntro">
                <div><span className="caseIdBadge">{scenario.caseId}</span><span className={`riskLabel riskLabel-${scenario.risk}`}>{riskLabel(scenario.risk)}</span><span>{scenario.group}</span></div>
                <h2>{scenario.title}</h2>
                <p>{scenario.context.actor} → {scenario.context.trigger} → <b>{scenario.context.state}</b> → {scenario.context.outcome}</p>
                <div className="exploreTask"><span>확인할 것</span><strong>{scenario.guide.task}</strong></div>
              </section>

              <div className={`stageGrid ${advancedOpen ? '' : 'advancedClosed'}`}>
                {renderDeviceStage()}
                {advancedOpen ? (
                  <aside className="inspector">
                    <section>
                      <div className="inspectorHeading"><strong>이 화면에서 확인할 것</strong><span>{scenario.expected.length}</span></div>
                      <ul className="expectedList">{scenario.expected.map((expected) => <li key={expected}>{expected}</li>)}</ul>
                    </section>
                    <section>
                      <div className="inspectorHeading"><strong>버튼 동작 기준</strong><span>{scenario.actions.length}</span></div>
                      {scenario.actions.length ? <div className="contracts">{scenario.actions.map((action) => <div key={action.id}><b>{action.label}</b><span>{action.expected}</span></div>)}</div> : <p className="empty">이 화면은 자유롭게 눌러보는 미리보기입니다.</p>}
                    </section>
                    <section>
                      <div className="inspectorHeading"><strong>QA 범위 지도</strong><span>{directCoverageCount}/{QA_SURFACE_COVERAGE.length} 직접 재현</span></div>
                      <div className="coverageList">{QA_SURFACE_COVERAGE.map((surface) => <div key={surface.id}><b>{surface.label}</b><span>{surface.level === 'direct' ? '직접 시나리오' : '기존 허브 경유'}</span></div>)}</div>
                    </section>
                  </aside>
                ) : null}
              </div>

              <div className="reviewBar">
                <div className="reviewPrompt"><strong>{scenario.caseId} · 이 설정은 괜찮아 보여요?</strong><span>{viewport.label} · {locale.toUpperCase()} 조합에만 기록됩니다.</span></div>
                <div className="reviewActions">
                  <button type="button" className={`passButton ${currentReview?.verdict === 'pass' ? 'selected' : ''}`} onClick={() => markReview('pass')}>✓ 정상</button>
                  <button type="button" className={`issueButton ${currentReview?.verdict === 'issue' ? 'selected' : ''}`} onClick={() => markReview('issue')}>! 문제 있음</button>
                  <button type="button" className={`blockedButton ${currentReview?.verdict === 'blocked' ? 'selected' : ''}`} onClick={() => markReview('blocked')}>? 확인 불가</button>
                  {currentReview ? <button type="button" onClick={clearReview}>미확인으로 되돌리기</button> : null}
                </div>
                <div className="navActions">
                  <button type="button" onClick={() => goRelative(-1)} disabled={filteredScenarios.length <= 1}>이전</button>
                  <span>{currentIndex >= 0 ? currentIndex + 1 : 0} / {filteredScenarios.length}</span>
                  <button type="button" onClick={() => goRelative(1)} disabled={filteredScenarios.length <= 1}>다음</button>
                </div>
              </div>
              {renderIssueEditor(false)}
              <div className="advancedToggle"><button type="button" onClick={() => setAdvancedOpen((value) => !value)}>{advancedOpen ? '고급 정보 숨기기' : '고급 정보 보기'}</button></div>
            </section>
          </div>
        </>
      ) : null}

      <footer className="qaFooter">
        <span>QA Preview 전용</span>
        <span>Production writes <b>0</b></span>
        <span>commit <b>{shortSha(BUILD_SHA)}</b> · {NETWORK}</span>
      </footer>

      <style jsx>{`
        .qaStudio{min-height:100vh;box-sizing:border-box;padding:18px;color:#f6f2e9;background:#080807;font-family:inherit}.focusExit{display:none}.compactHeader{max-width:1460px;margin:0 auto 12px;padding:2px 2px 10px;display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid rgba(255,255,255,.06)}.compactHeader>div:first-child{display:grid;grid-template-columns:auto auto;align-items:center;gap:4px 9px}.qaBadge{grid-row:1/3;padding:5px 7px;border:1px solid rgba(244,183,40,.22);border-radius:8px;background:rgba(244,183,40,.06);color:#e5c45f;font-size:.54rem;font-weight:950}.compactHeader h1{margin:0;font-size:1.35rem;letter-spacing:-.035em}.compactHeader p{margin:0;color:#77716a;font-size:.61rem}.compactHeaderActions{display:flex;align-items:center;gap:8px}.compactHeaderActions>button,.guidedProgressRow button,.environmentActions button,.startActions button,.completionActions button,.advancedToggle button{min-height:36px;padding:0 11px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:#141412;color:#cfc8bd;font:inherit;font-size:.62rem;font-weight:850;cursor:pointer}.primaryButton{border-color:rgba(244,183,40,.26)!important;background:rgba(244,183,40,.1)!important;color:#f0cd66!important}.compactProgress{color:#80786f;font-size:.59rem;white-space:nowrap}.startCard,.completionCard{max-width:820px;margin:9vh auto 0;padding:30px;border:1px solid rgba(244,183,40,.16);border-radius:24px;background:linear-gradient(145deg,rgba(244,183,40,.07),rgba(255,255,255,.015));box-shadow:0 28px 90px rgba(0,0,0,.26)}.startEyebrow,.completionCard>span{color:#d6b956;font-size:.62rem;font-weight:900}.startCard h2,.completionCard h2{margin:9px 0 8px;font-size:clamp(1.5rem,3vw,2.2rem);letter-spacing:-.04em}.startCard>p{max-width:650px;margin:0;color:#918980;font-size:.78rem;line-height:1.6}.startStats,.completionStats{margin-top:20px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.completionStats{grid-template-columns:repeat(4,1fr)}.startStats div,.completionStats div{padding:14px;border:1px solid rgba(255,255,255,.06);border-radius:13px;background:#10100e;display:grid;gap:3px}.startStats b,.completionStats b{font-size:1.25rem}.startStats span,.completionStats span{color:#756f68;font-size:.59rem}.startActions,.completionActions{margin-top:18px;display:flex;gap:8px;flex-wrap:wrap}.startButton{min-height:46px!important;padding:0 18px!important;border-color:rgba(244,183,40,.3)!important;background:rgba(244,183,40,.12)!important;color:#f0cf69!important;font-size:.72rem!important}.guidedWorkspace{max-width:1460px;margin:0 auto}.guidedProgressRow{min-height:38px;margin-bottom:8px;display:flex;align-items:center;gap:8px;color:#746d65;font-size:.58rem}.progressTrack{height:5px;flex:1;max-width:340px;border-radius:999px;background:#171714;overflow:hidden}.progressTrack i{display:block;height:100%;border-radius:inherit;background:#c8a83e;transition:width .2s ease}.guidedProgressRow button:first-of-type{margin-left:auto}.environmentPanel{margin-bottom:8px;padding:10px;border:1px solid rgba(255,255,255,.065);border-radius:13px;background:#0e0e0d;display:flex;align-items:end;gap:8px;flex-wrap:wrap}.environmentPanel label{display:grid;gap:4px}.environmentPanel label>span{color:#756f68;font-size:.55rem;font-weight:850}.environmentPanel label small{max-width:190px;color:#69635d;font-size:.52rem}.environmentPanel select{min-height:38px;padding:0 28px 0 9px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:#151513;color:#d9d1c6;font:inherit;font-size:.63rem}.environmentActions{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}.shareStatus{margin:6px 2px 8px;color:#a69667;font-size:.58rem}.guidedTaskCard{margin-bottom:9px;padding:13px 15px;border:1px solid rgba(244,183,40,.17);border-radius:16px;background:linear-gradient(135deg,rgba(244,183,40,.06),rgba(255,255,255,.012));display:grid;grid-template-columns:minmax(180px,.75fr) minmax(280px,1.6fr) minmax(220px,1fr);gap:12px;align-items:center}.taskTopline{grid-column:1/-1;display:flex;align-items:center;gap:6px;color:#777069;font-size:.55rem}.caseIdBadge{padding:4px 7px;border:1px solid rgba(244,183,40,.2);border-radius:7px;background:rgba(244,183,40,.07);color:#e5c45e;font-size:.55rem;font-weight:950;letter-spacing:.04em}.riskLabel{padding:4px 6px;border-radius:6px;background:#171714;font-size:.52rem;font-weight:900;color:#8a847c}.riskLabel-critical{color:#f4c343}.riskLabel-high{color:#c3ae70}.taskSituation span,.taskInstruction span,.taskSuccess span,.exploreTask span{display:block;margin-bottom:4px;color:#83796b;font-size:.53rem;font-weight:900}.taskSituation h2{margin:0 0 3px;font-size:1rem}.taskSituation p,.taskSuccess p{margin:0;color:#77716a;font-size:.6rem;line-height:1.45}.taskInstruction{padding:10px 12px;border:1px solid rgba(244,183,40,.12);border-radius:12px;background:rgba(244,183,40,.035)}.taskInstruction strong{display:block;color:#e8dfd1;font-size:.7rem;line-height:1.5}.guidedStage{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}.guidedStage.withInspector,.stageGrid{grid-template-columns:minmax(0,1fr) 320px}.stageGrid{display:grid;gap:10px;align-items:start}.stageGrid.advancedClosed{grid-template-columns:minmax(0,1fr)}.deviceStage{min-width:0;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:#090909;overflow:hidden;position:relative}.deviceRuler{height:34px;padding:0 11px;display:flex;align-items:center;justify-content:space-between;color:#6e6963;font-size:.57rem;border-bottom:1px solid rgba(255,255,255,.06)}.frameState{font-weight:800}.frame-ready{color:#8fbd9b}.frame-slow,.frame-error{color:#d5b475}.frameScroller{padding:12px;overflow:auto;text-align:center;background:radial-gradient(circle at 50% 0%,rgba(244,183,40,.035),transparent 36%)}.frameScroller iframe{max-width:none;border:1px solid rgba(255,255,255,.09);border-radius:15px;background:#080807;vertical-align:top;box-shadow:0 18px 60px rgba(0,0,0,.28)}.frameRecovery{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);padding:8px 10px;border:1px solid rgba(244,183,40,.18);border-radius:10px;background:rgba(18,18,16,.95);display:flex;align-items:center;gap:8px;color:#b8a776;font-size:.57rem}.frameRecovery button{min-height:29px;border:1px solid rgba(244,183,40,.2);border-radius:8px;background:rgba(244,183,40,.08);color:#e4c568;font:inherit;font-size:.57rem;cursor:pointer}.inspector{border:1px solid rgba(255,255,255,.07);border-radius:15px;padding:10px;background:#0d0d0c;display:grid;gap:9px;max-height:850px;overflow:auto}.inspector section{padding:10px;border:1px solid rgba(255,255,255,.055);border-radius:11px;background:#11110f}.inspectorHeading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}.inspectorHeading strong{font-size:.64rem}.inspectorHeading>span{color:#77716c;font-size:.55rem}.inspectorHeading button{border:0;background:transparent;color:#837d75;font:inherit;font-size:.54rem;cursor:pointer}.expectedList{margin:0;padding-left:15px;display:grid;gap:6px}.expectedList li{color:#979087;font-size:.59rem;line-height:1.45}.contracts,.coverageList{display:grid;gap:6px}.contracts div,.coverageList div{display:grid;gap:2px;padding:7px;border-radius:8px;background:#151512}.contracts b,.coverageList b{font-size:.58rem}.contracts span,.coverageList span,.empty{margin:0;color:#77716d;font-size:.55rem;line-height:1.4}.timeline{list-style:none;margin:0;padding:0;display:grid;gap:6px}.timeline li{display:grid;grid-template-columns:55px 1fr;gap:2px 6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.05)}.timeline time{grid-row:1/3;color:#605b56;font-size:.5rem}.timeline b{font-size:.57rem}.timeline span{color:#77716d;font-size:.53rem}.safetyBox{border-color:rgba(244,183,40,.15)!important;background:rgba(244,183,40,.035)!important;display:grid;gap:4px}.safetyBox strong{color:#d7b84d;font-size:.6rem}.safetyBox span{color:#85765b;font-size:.54rem;line-height:1.4}.actionReminder{margin-top:8px;padding:10px 12px;border:1px solid rgba(213,180,117,.18);border-radius:12px;background:rgba(213,180,117,.045);display:flex;align-items:center;gap:8px}.actionReminder>div{margin-right:auto;display:grid;gap:2px}.actionReminder strong{font-size:.64rem}.actionReminder span{color:#877b6a;font-size:.56rem}.actionReminder button,.issueContinue button{min-height:34px;padding:0 10px;border:1px solid rgba(255,255,255,.09);border-radius:8px;background:#151513;color:#cfc8bd;font:inherit;font-size:.58rem;font-weight:800;cursor:pointer}.guidedActionBar{position:sticky;bottom:10px;z-index:10;margin-top:9px;padding:10px 12px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(15,15,13,.96);backdrop-filter:blur(14px);display:flex;align-items:center;gap:12px;box-shadow:0 16px 50px rgba(0,0,0,.3)}.guidedActionBar>div:first-child{display:grid;gap:2px;min-width:170px}.guidedActionBar strong{font-size:.67rem}.guidedActionBar span{color:#756e66;font-size:.55rem}.guidedActions{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}.guidedActions button,.reviewActions button,.navActions button{min-height:38px;padding:0 11px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:#151513;color:#cfc8be;font:inherit;font-size:.62rem;font-weight:850;cursor:pointer}.guidedActions .passButton{border-color:rgba(107,180,129,.25);background:rgba(107,180,129,.09);color:#a8d9b4}.guidedActions .issueButton{border-color:rgba(204,111,111,.24);background:rgba(204,111,111,.075);color:#dea7a7}.guidedActions .blockedButton{color:#d4c086}.deferButton{color:#89827a!important}.issueEditor{margin-top:8px;padding:11px;border:1px solid rgba(204,111,111,.13);border-radius:13px;background:rgba(204,111,111,.035);display:grid;grid-template-columns:180px minmax(0,1fr);gap:9px}.issueEditor label{display:grid;gap:4px}.issueEditor label span{color:#9e8888;font-size:.56rem;font-weight:850}.issueEditor select,.issueEditor textarea{border:1px solid rgba(255,255,255,.09);border-radius:9px;background:#151513;color:#ddd6cb;font:inherit;font-size:.62rem}.issueEditor select{min-height:38px;padding:0 8px}.issueEditor textarea{min-height:66px;padding:8px;resize:vertical}.issueEditor small{grid-column:1/-1;color:#746866;font-size:.53rem}.issueContinue{grid-column:1/-1;display:flex;gap:6px;justify-content:flex-end}.exploreControls{max-width:1460px;margin:0 auto 9px;padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:#0d0d0c;display:flex;align-items:center;gap:7px}.modeSwitch{display:flex;gap:3px;padding:3px;border-radius:9px;background:#151513}.modeSwitch button{min-height:32px;padding:0 9px;border:0;border-radius:7px;background:transparent;color:#77716d;font:inherit;font-size:.6rem;font-weight:850;cursor:pointer}.modeSwitch button.active{background:rgba(244,183,40,.1);color:#efcf70}.exploreControls select,.exploreControls input{height:34px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#11110f;color:#d6cec4;font:inherit;font-size:.61rem}.exploreControls select{padding:0 28px 0 8px}.exploreControls input{min-width:220px;flex:1;padding:0 10px}.exploreControls>span{color:#706a63;font-size:.56rem;white-space:nowrap}.qaLayout{max-width:1460px;margin:0 auto;display:grid;grid-template-columns:270px minmax(0,1fr);gap:10px}.scenarioRail,.workspace{border:1px solid rgba(255,255,255,.07);background:#0d0d0c}.scenarioRail{border-radius:16px;padding:10px;align-self:start;position:sticky;top:10px;max-height:calc(100vh - 20px);overflow:auto}.railTitle{padding:4px 5px 10px;display:grid;gap:2px}.railTitle strong{font-size:.78rem}.railTitle span{color:#716d68;font-size:.58rem}.scenarioGroup{margin-top:8px}.scenarioGroup h2{margin:0 5px 5px;color:#827969;font-size:.58rem}.scenarioGroup button{width:100%;min-height:66px;margin:0 0 4px;padding:8px;border:1px solid transparent;border-radius:10px;background:transparent;color:#aaa39a;font:inherit;text-align:left;display:grid;grid-template-columns:20px minmax(0,1fr);gap:7px;cursor:pointer}.scenarioGroup button.active{border-color:rgba(244,183,40,.23);background:rgba(244,183,40,.07);color:#f0d27a}.scenarioGroup button>span:last-child{display:grid;gap:2px;min-width:0}.scenarioGroup button b{color:#9e8e61;font-size:.5rem}.scenarioGroup strong{font-size:.63rem}.scenarioGroup small{color:#6d6761;font-size:.53rem;line-height:1.35}.scenarioStatus{width:19px;height:19px;border-radius:50%;display:grid;place-items:center;background:#181816;color:#68625c;font-size:.6rem;font-weight:950}.status-pass{background:rgba(107,180,129,.13);color:#9bd3aa}.status-issue{background:rgba(204,111,111,.13);color:#dda0a0}.status-blocked{background:rgba(194,164,92,.12);color:#d8c17e}.noResults{padding:14px 7px;color:#77716d;font-size:.6rem}.workspace{min-width:0;border-radius:16px;padding:10px}.exploreIntro{padding:11px 3px}.exploreIntro>div:first-child{display:flex;align-items:center;gap:6px;color:#77716d;font-size:.55rem}.exploreIntro h2{margin:6px 0 4px;font-size:1.05rem}.exploreIntro p{margin:0;color:#7a746d;font-size:.62rem;line-height:1.5}.exploreTask{margin-top:8px;padding:9px 10px;border:1px solid rgba(244,183,40,.1);border-radius:10px;background:rgba(244,183,40,.03)}.exploreTask strong{font-size:.63rem;line-height:1.45}.reviewBar{margin-top:8px;padding:10px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:#10100f;display:flex;align-items:center;gap:10px}.reviewPrompt{display:grid;gap:2px;min-width:165px}.reviewPrompt strong{font-size:.64rem}.reviewPrompt span{color:#756f68;font-size:.54rem}.reviewActions{display:flex;gap:5px;flex-wrap:wrap}.passButton.selected{border-color:rgba(107,180,129,.3);background:rgba(107,180,129,.1);color:#a8dab5}.issueButton.selected{border-color:rgba(204,111,111,.3);background:rgba(204,111,111,.1);color:#e0aaaa}.blockedButton.selected{border-color:rgba(194,164,92,.3);background:rgba(194,164,92,.1);color:#ddc98c}.navActions{margin-left:auto;display:flex;align-items:center;gap:6px}.navActions span{min-width:38px;text-align:center;color:#77716d;font-size:.56rem}.navActions button:disabled{opacity:.35;cursor:default}.advancedToggle{margin-top:7px;text-align:right}.qaFooter{max-width:1460px;margin:10px auto 0;display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap;color:#655f59;font-size:.52rem}.qaFooter span{padding:4px 6px;border-radius:6px;background:#0d0d0c;border:1px solid rgba(255,255,255,.04)}.qaFooter b{color:#8b847c}.focusMode{padding:0;overflow:hidden}.focusMode .compactHeader,.focusMode .startCard,.focusMode .completionCard,.focusMode .guidedProgressRow,.focusMode .environmentPanel,.focusMode .shareStatus,.focusMode .guidedTaskCard,.focusMode .inspector,.focusMode .guidedActionBar,.focusMode .issueEditor,.focusMode .actionReminder,.focusMode .exploreControls,.focusMode .scenarioRail,.focusMode .exploreIntro,.focusMode .reviewBar,.focusMode .advancedToggle,.focusMode .qaFooter,.focusMode .deviceRuler,.focusMode .frameRecovery{display:none}.focusMode .focusExit{display:block;position:fixed;right:12px;top:12px;z-index:20;min-height:36px;padding:0 11px;border:1px solid rgba(244,183,40,.25);border-radius:9px;background:rgba(12,12,11,.92);color:#e7c867;font:inherit;font-size:.6rem;font-weight:850;cursor:pointer}.focusMode .guidedWorkspace,.focusMode .qaLayout{max-width:none;margin:0;display:block}.focusMode .workspace{padding:0;border:0;border-radius:0}.focusMode .guidedStage,.focusMode .stageGrid{display:block}.focusMode .deviceStage{border:0;border-radius:0}.focusMode .frameScroller{height:100vh;padding:0;display:grid;place-items:center;overflow:auto;background:#080807}.focusMode .frameScroller iframe{box-shadow:none;border-radius:0}@media(max-width:1050px){.guidedTaskCard{grid-template-columns:1fr 1.5fr}.taskSuccess{grid-column:1/-1}.guidedStage.withInspector,.stageGrid{grid-template-columns:1fr}.inspector{max-height:none}.qaLayout{grid-template-columns:1fr}.scenarioRail{position:static;max-height:none}.compactHeader{align-items:flex-start}.compactHeaderActions{align-items:flex-end;flex-direction:column}.completionStats{grid-template-columns:1fr 1fr}}@media(max-width:720px){.qaStudio{padding:10px}.compactHeader{align-items:flex-start;flex-direction:column}.compactHeaderActions{width:100%;align-items:center;flex-direction:row;justify-content:space-between}.compactHeader h1{font-size:1.15rem}.startCard,.completionCard{margin-top:3vh;padding:20px}.startStats{grid-template-columns:1fr 1fr 1fr}.guidedProgressRow{flex-wrap:wrap}.guidedProgressRow .progressTrack{order:4;max-width:none;flex-basis:100%}.guidedProgressRow button:first-of-type{margin-left:auto}.guidedTaskCard{grid-template-columns:1fr;padding:12px}.taskTopline,.taskSuccess{grid-column:1}.environmentPanel{align-items:stretch;flex-direction:column}.environmentPanel label{width:100%}.environmentPanel select{width:100%}.environmentActions{margin-left:0}.environmentActions button{flex:1}.frameScroller{padding:7px}.guidedActionBar{bottom:6px;align-items:stretch;flex-direction:column}.guidedActions{margin-left:0;display:grid;grid-template-columns:1fr 1fr}.guidedActions button{min-height:42px}.issueEditor{grid-template-columns:1fr}.issueEditor small,.issueContinue{grid-column:1}.actionReminder{align-items:stretch;flex-direction:column}.exploreControls{align-items:stretch;flex-direction:column}.exploreControls input{min-width:0}.scenarioRail{overflow:visible}.reviewBar{align-items:stretch;flex-direction:column}.navActions{margin-left:0;justify-content:space-between}.reviewPrompt{min-width:0}.startActions button,.completionActions button{flex:1}.focusMode .frameScroller{padding:0}}@media(max-width:430px){.startStats,.completionStats{grid-template-columns:1fr 1fr}.guidedActions{grid-template-columns:1fr}.compactProgress{font-size:.53rem}.compactHeaderActions>button{font-size:.56rem}.startActions,.completionActions{flex-direction:column}}
      `}</style>
    </main>
  );
}
