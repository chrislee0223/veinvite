'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useWallet } from '@vechain/vechain-kit';

import { WalletControl } from '@/components/WalletControl';

type ReviewRow = {
  invite_code: string;
  inviter_wallet: string;
  invitee_wallet: string | null;
  activation_network: string | null;
  status: string;
  reward_status: string;
  sybil_status: string;
  sybil_risk_level: string;
  sybil_risk_score: number;
  sybil_reason: string | null;
  sybil_checked_at: string | null;
  sybil_source: string;
  activated_at: string | null;
  updated_at: string;
  v2_state: string | null;
  v2_risk_score: number | null;
  v2_revision: number | string | null;
  v2_reason_codes: unknown;
  v2_updated_at: string | null;
  post_payout_state: string | null;
  post_payout_risk_score: number | null;
  post_payout_revision: number | string | null;
  post_payout_reason_codes: unknown;
  post_payout_subject_wallet: string | null;
  post_payout_updated_at: string | null;
  inviter_escalation_posture: string | null;
  inviter_escalation_incident_count_90d: number | string | null;
  inviter_escalation_strong_direct_link_count_90d: number | string | null;
  inviter_escalation_reason_codes: unknown;
  inviter_escalation_latest_incident_at: string | null;
  inviter_escalation_latest_incident_id: string | null;
};

type ReviewEvent = {
  id: string | number;
  resulting_status: string;
  risk_level: string;
  risk_score: number;
  signal_code: string | null;
  source: string;
  summary: string;
  details: Record<string, unknown>;
  created_at: string;
};

type ReviewListResponse = {
  network: string;
  verifiedOperator: string;
  reviews: ReviewRow[];
  reviewCount: number;
  resultLimit: number;
};

type V2Assessment = {
  state: string;
  risk_score: number;
  revision: number | string;
  reason_codes: unknown;
  evidence_summary: unknown;
  source: string;
  updated_at: string;
};

type PostPayoutReview = {
  invite_code: string;
  network: string;
  subject_wallet: string;
  state: string;
  risk_score: number;
  revision: number | string;
  reason_codes: unknown;
  evidence_summary: unknown;
  source: string;
  updated_at: string;
};

type V2Evidence = {
  id: string | number;
  evidence_family: string;
  signal_code: string;
  strength: string;
  score: number;
  related_wallet: string | null;
  app_id: string | null;
  observed_block: number | string | null;
  evidence: Record<string, unknown>;
  created_at: string;
};

type ReviewDetailResponse = {
  network: string;
  verifiedOperator: string;
  invitation: ReviewRow;
  reviewEvents: ReviewEvent[];
  v2Assessment?: V2Assessment | null;
  postPayoutReview?: PostPayoutReview | null;
  postPayoutReviewEvents?: unknown[];
  v2Evidence?: V2Evidence[];
  reviewMode?:
    | 'INVITER'
    | 'POST_PAYOUT'
    | 'V2'
    | 'LEGACY'
    | 'NONE';
  canResolve: boolean;
};

type OnchainSnapshot = {
  id: string | number;
  invite_code: string;
  wallet_address: string;
  network: string;
  activation_block: number | string;
  first_observed_activity_block: number | string | null;
  age_blocks_at_activation: number | string | null;
  approximate_age_seconds_at_activation: number | string | null;
  first_inbound_vet_block: number | string | null;
  first_inbound_vet_sender: string | null;
  first_inbound_vet_tx_id: string | null;
  first_inbound_vtho_block: number | string | null;
  first_inbound_vtho_sender: string | null;
  first_inbound_vtho_tx_id: string | null;
  vet_funder_referral_count: number | string;
  vtho_funder_referral_count: number | string;
  indicators: unknown;
  observation_only: boolean;
  checked_at: string;
  created_at?: string;
};

type OnchainGetResponse = {
  latestSnapshot: OnchainSnapshot | null;
  observationOnly: true;
};

type OnchainPostResponse = {
  snapshot: OnchainSnapshot;
  indicators: unknown;
  observationOnly: true;
  sybilStatusChanged: false;
  rewardStatusChanged: false;
  transfersPerformed: false;
};

type Decision = 'CLEAR' | 'BLOCKED';

const REVIEW_API = '/api/admin/sybil/review';
const ONCHAIN_API = '/api/admin/sybil/onchain';
const MIN_REASON_LENGTH = 12;
const ANALYTICS_STALE_MS = 24 * 60 * 60 * 1000;

const INDICATOR_LABELS: Record<string, string> = {
  FRESH_WALLET: '신규 지갑 / Fresh wallet',
  SHARED_VET_FUNDER_CLUSTER:
    '공통 VET 자금 출처 / Shared VET funder',
  SHARED_VTHO_FUNDER_CLUSTER:
    '공통 VTHO 자금 출처 / Shared VTHO funder',
};

function shortAddress(value: string | null) {
  if (!value) return '—';
  if (value.length < 18) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatInteger(value: number | string | null) {
  if (value === null || value === '') return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.trunc(parsed)).toLocaleString('en-US')
    : '—';
}

function formatWalletAge(value: number | string | null) {
  if (value === null || value === '') return '확인 불가 / Unknown';
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '확인 불가 / Unknown';
  }

  if (seconds < 3600) {
    return `${Math.max(1, Math.round(seconds / 60))}분 / min`;
  }

  if (seconds < 86400) {
    return `${(seconds / 3600).toFixed(1)}시간 / hr`;
  }

  return `${(seconds / 86400).toFixed(1)}일 / days`;
}

function parseIndicators(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === 'string' && item.trim().length > 0,
  );
}

function snapshotIsStale(snapshot: OnchainSnapshot | null) {
  if (!snapshot?.checked_at) return false;
  const checkedAt = Date.parse(snapshot.checked_at);
  return (
    Number.isFinite(checkedAt) &&
    Date.now() - checkedAt > ANALYTICS_STALE_MS
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(
      typeof data.error === 'string'
        ? data.error
        : 'Request failed.',
    );
  }

  return data;
}

export default function SybilReviewPage() {
  const { account } = useWallet();
  const walletAddress = account?.address?.toLowerCase() ?? null;
  const detailRequestRef = useRef(0);

  const [overview, setOverview] =
    useState<ReviewListResponse | null>(null);
  const [detail, setDetail] =
    useState<ReviewDetailResponse | null>(null);
  const [selectedCode, setSelectedCode] =
    useState<string | null>(null);
  const [onchainSnapshot, setOnchainSnapshot] =
    useState<OnchainSnapshot | null>(null);
  const [onchainError, setOnchainError] = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsRunning, setAnalyticsRunning] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const clearSelection = useCallback(() => {
    detailRequestRef.current += 1;
    setDetail(null);
    setSelectedCode(null);
    setOnchainSnapshot(null);
    setOnchainError('');
    setAnalyticsLoading(false);
    setReason('');
    setConfirmation('');
  }, []);

  const loadReviews = useCallback(async () => {
    if (!walletAddress) {
      setOverview(null);
      clearSelection();
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(REVIEW_API, {
        cache: 'no-store',
      });
      const data = await readJson<ReviewListResponse>(response);
      setOverview(data);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Review list could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [walletAddress, clearSelection]);

  const loadDetail = useCallback(async (inviteCode: string) => {
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;

    setDetailLoading(true);
    setAnalyticsLoading(true);
    setSelectedCode(inviteCode);
    setOnchainSnapshot(null);
    setOnchainError('');
    setError('');
    setMessage('');

    const encodedCode = encodeURIComponent(inviteCode);
    const [reviewResult, analyticsResult] = await Promise.allSettled([
      fetch(`${REVIEW_API}?inviteCode=${encodedCode}`, {
        cache: 'no-store',
      }).then((response) => readJson<ReviewDetailResponse>(response)),
      fetch(`${ONCHAIN_API}?inviteCode=${encodedCode}`, {
        cache: 'no-store',
      }).then((response) => readJson<OnchainGetResponse>(response)),
    ]);

    if (detailRequestRef.current !== requestId) return;

    if (reviewResult.status === 'rejected') {
      clearSelection();
      setError(
        reviewResult.reason instanceof Error
          ? reviewResult.reason.message
          : 'Review detail could not be loaded.',
      );
      setDetailLoading(false);
      return;
    }

    setDetail(reviewResult.value);
    setReason('');
    setConfirmation('');
    setDetailLoading(false);

    if (analyticsResult.status === 'fulfilled') {
      setOnchainSnapshot(analyticsResult.value.latestSnapshot);
      setOnchainError('');
    } else {
      setOnchainSnapshot(null);
      setOnchainError(
        analyticsResult.reason instanceof Error
          ? analyticsResult.reason.message
          : 'On-chain signals could not be loaded.',
      );
    }
    setAnalyticsLoading(false);
  }, [clearSelection]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const runOnchainAnalytics = async () => {
    const inviteCode = detail?.invitation.invite_code;
    if (!inviteCode || analyticsRunning) return;

    setAnalyticsRunning(true);
    setOnchainError('');
    setMessage('');

    try {
      const response = await fetch(ONCHAIN_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intent: 'RUN_ONCHAIN_SYBIL_ANALYTICS',
          inviteCode,
        }),
      });
      const data = await readJson<OnchainPostResponse>(response);
      setOnchainSnapshot(data.snapshot);
      setMessage(
        '온체인 분석을 갱신했습니다. 이 신호만으로 상태나 보상은 변경되지 않습니다. / On-chain analysis refreshed; no status or reward was changed.',
      );
    } catch (analyticsError) {
      setOnchainError(
        analyticsError instanceof Error
          ? analyticsError.message
          : 'On-chain analysis could not be completed.',
      );
    } finally {
      setAnalyticsRunning(false);
    }
  };

  const resolveReview = async (decision: Decision) => {
    const invitation = detail?.invitation;

    if (
      !invitation ||
      !detail?.canResolve ||
      submitting
    ) {
      return;
    }

    const isInviter =
      detail.reviewMode === 'INVITER';
    const isPostPayout =
      detail.reviewMode === 'POST_PAYOUT';
    const isV2 = detail.reviewMode === 'V2';
    const expectedRevision = Number(
      isPostPayout
        ? invitation.post_payout_revision
        : invitation.v2_revision,
    );

    if (
      (isPostPayout || isV2) &&
      (!Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 1)
    ) {
      setError(
        isPostPayout
          ? '최신 사후 판정 버전을 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요. / The latest post-payout review revision is unavailable.'
          : '최신 v2 판정 버전을 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요. / The latest v2 review revision is unavailable.',
      );
      return;
    }

    if (
      !isInviter &&
      !isPostPayout &&
      !isV2 &&
      !invitation.sybil_checked_at
    ) {
      setError(
        '기존 Sybil 검토 시점을 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요. / The legacy review timestamp is unavailable.',
      );
      return;
    }

    if (
      isInviter &&
      !invitation.inviter_escalation_latest_incident_id
    ) {
      setError(
        '최신 초대자 검토 사건을 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요. / The latest inviter escalation incident is unavailable.',
      );
      return;
    }

    const normalizedConfirmation =
      confirmation.trim().toUpperCase();

    if (
      reason.trim().length < MIN_REASON_LENGTH ||
      normalizedConfirmation !== invitation.invite_code
    ) {
      setError(
        '사유를 12자 이상 입력하고 초대 코드를 정확히 다시 입력해 주세요. / Enter a 12+ character reason and retype the invite code exactly.',
      );
      return;
    }

    const label =
      decision === 'CLEAR'
        ? '승인(CLEAR)'
        : isInviter
          ? '초대자 제한(RESTRICT)'
          : isPostPayout || isV2
            ? '블랙리스트(BLACKLIST)'
            : '차단(BLOCKED)';

    const confirmMessage = isInviter
      ? decision === 'CLEAR'
        ? `${invitation.invite_code} 기준 초대자 HOLD를 CLEAR할까요? 현재까지의 사건 기록은 감사용으로 유지되며, 새로운 파밍 사건이 확인되면 다시 HOLD될 수 있습니다.`
        : `${invitation.invite_code} 기준 초대자를 RESTRICT할까요? 과거 보상은 변경하지 않고 이 초대자 지갑의 향후 VeInvite 참여만 제한합니다.`
      : isPostPayout
        ? `${invitation.invite_code}를 ${label} 처리할까요? 이미 지급된 보상은 변경되지 않으며, BLACKLIST 시 해당 보상 수령자 지갑의 향후 VeInvite 참여만 제한됩니다.`
        : `${invitation.invite_code}를 ${label} 처리할까요? 이 판정은 보상 자격에 영향을 줄 수 있지만 B3TR 전송은 실행하지 않습니다.`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(REVIEW_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          intent: 'RESOLVE_SYBIL_REVIEW',
          inviteCode: invitation.invite_code,
          decision,
          reason: reason.trim(),
          confirmation: normalizedConfirmation,
          expectedCheckedAt: invitation.sybil_checked_at,
          expectedRevision:
            isPostPayout || isV2
              ? expectedRevision
              : undefined,
          expectedInviterIncidentId:
            isInviter
              ? invitation.inviter_escalation_latest_incident_id
              : undefined,
        }),
      });

      await readJson<{ invitation: ReviewRow }>(response);

      setMessage(
        isInviter
          ? decision === 'CLEAR'
            ? '초대자 HOLD를 해제했습니다. 현재 사건 기록은 감사용으로 유지되며 새로운 파밍 사건이 생기면 다시 검토됩니다. / Inviter HOLD cleared; the current incident history remains for audit and new abuse can reopen review.'
            : '초대자 제한을 확정했습니다. 과거 보상은 변경되지 않고 이 지갑의 향후 VeInvite 참여만 제한됩니다. / Inviter restriction confirmed; past rewards remain unchanged and only future VeInvite participation is restricted.'
          : isPostPayout
          ? decision === 'CLEAR'
            ? '사후 검토를 정상으로 승인했습니다. 기존 지급 보상은 변경되지 않습니다. / Post-payout review cleared; the past reward remains unchanged.'
            : '사후 블랙리스트로 확정했습니다. 기존 지급 보상은 유지되고 해당 보상 수령자 지갑의 향후 VeInvite 참여만 제한됩니다. / Post-payout blacklist confirmed; the past reward remains unchanged and only future participation of the reward-recipient wallet is restricted.'
          : decision === 'CLEAR'
            ? '검토를 승인했습니다. 보상 전송은 실행되지 않았습니다. / Review cleared; no reward transfer was performed.'
            : isV2
              ? '블랙리스트로 확정했습니다. 이번 미지급 보상은 제외되고 향후 VeInvite 참여가 제한됩니다. / Blacklist confirmed; the unpaid reward is forfeited and future VeInvite participation is restricted.'
              : '검토를 차단 처리했습니다. 보상 전송은 실행되지 않았습니다. / Review blocked; no reward transfer was performed.',
      );

      clearSelection();
      await loadReviews();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Manual review could not be resolved.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selected = detail?.invitation ?? null;
  const reviewEvents = detail?.reviewEvents ?? [];
  const v2Evidence = detail?.v2Evidence ?? [];
  const v2ReasonCodes = Array.isArray(detail?.v2Assessment?.reason_codes)
    ? detail.v2Assessment.reason_codes.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];
  const inviterReasonCodes = Array.isArray(
    selected?.inviter_escalation_reason_codes,
  )
    ? selected.inviter_escalation_reason_codes.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];
  const postPayoutReasonCodes = Array.isArray(
    detail?.postPayoutReview?.reason_codes,
  )
    ? detail.postPayoutReview.reason_codes.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];
  const indicators = parseIndicators(onchainSnapshot?.indicators);
  const analyticsStale = snapshotIsStale(onchainSnapshot);
  const actionReady = Boolean(
    selected &&
      detail?.canResolve &&
      reason.trim().length >= MIN_REASON_LENGTH &&
      confirmation.trim().toUpperCase() === selected.invite_code &&
      !submitting,
  );

  return (
    <main className="adminScreen">
      <div className="shell">
        <header className="header">
          <div>
            <span className="eyebrow">VEINVITE ADMIN</span>
            <h1>수동 Sybil 검토 / Manual Review</h1>
            <p>
              자동 탐지에서 보류된 추천과 반복 파밍으로 HOLD된 초대자를 사람이 최종 검토합니다.
              온체인 신호는 판단 보조 정보일 뿐 자동 승인·차단이나 B3TR 전송을 실행하지 않습니다.
            </p>
          </div>
          <div className="headerActions">
            <Link href="/admin/participants">참가자 / Participants</Link>
            <Link href="/admin/rewards">보상 / Rewards</Link>
            <WalletControl />
          </div>
        </header>

        {!walletAddress ? (
          <section className="panel emptyPanel">
            운영자 지갑을 연결해 주세요.
            <br />
            Connect the VeInvite operator wallet to continue.
          </section>
        ) : (
          <>
            <section className="safety">
              <strong>Human-in-the-loop safety</strong>
              <span>
                판정 상태가 화면을 연 뒤 바뀌면 요청을 거부합니다. 운영자 지갑·사유·결과는 감사 기록에 남고, 온체인 분석은 observation-only로 유지됩니다.
              </span>
            </section>

            {error ? <div className="notice error" role="alert">{error}</div> : null}
            {message ? <div className="notice success" role="status">{message}</div> : null}

            <div className="grid">
              <section className="panel">
                <div className="panelHeader">
                  <div>
                    <span className="sectionLabel">OPEN REVIEWS</span>
                    <h2>검토 대기 {overview?.reviewCount ?? 0}건</h2>
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    disabled={loading}
                    onClick={() => void loadReviews()}
                  >
                    {loading ? '불러오는 중…' : '새로고침'}
                  </button>
                </div>

                {overview?.reviews.length === 0 ? (
                  <div className="emptyState">
                    현재 수동 검토가 필요한 추천이 없습니다.
                    <br />
                    No referrals require manual review.
                  </div>
                ) : null}

                <div className="reviewList">
                  {overview?.reviews.map((review) => (
                    <button
                      key={review.invite_code}
                      type="button"
                      className={
                        selectedCode === review.invite_code
                          ? 'review selected'
                          : 'review'
                      }
                      onClick={() => void loadDetail(review.invite_code)}
                    >
                      <div className="reviewTop">
                        <strong>{review.invite_code}</strong>
                        <span className="badge">
                          {review.inviter_escalation_posture === 'HOLD'
                            ? `INVITER · ${formatInteger(review.inviter_escalation_incident_count_90d)}건`
                            : review.post_payout_state === 'HOLD'
                              ? `POST · ${review.post_payout_risk_score ?? 0}`
                              : review.v2_state === 'HOLD'
                                ? `HOLD · ${review.v2_risk_score ?? 0}`
                                : `${review.sybil_risk_level} · ${review.sybil_risk_score}`}
                        </span>
                      </div>
                      <span>
                        {review.inviter_escalation_posture === 'HOLD'
                          ? `Inviter ${shortAddress(review.inviter_wallet)}`
                          : review.post_payout_state === 'HOLD'
                            ? `Reward recipient ${shortAddress(review.post_payout_subject_wallet)}`
                            : `Invitee ${shortAddress(review.invitee_wallet)}`}
                      </span>
                      <span>
                        {review.inviter_escalation_posture === 'HOLD'
                          ? `INVITER_ESCALATION · ${formatDate(review.inviter_escalation_latest_incident_at)}`
                          : review.post_payout_state === 'HOLD'
                            ? `POST_PAYOUT · ${formatDate(review.post_payout_updated_at)}`
                            : review.v2_state === 'HOLD'
                              ? `SYBIL_V2 · ${formatDate(review.v2_updated_at)}`
                              : `${review.sybil_source} · ${formatDate(review.sybil_checked_at)}`}
                      </span>
                      <small>
                        {review.inviter_escalation_posture === 'HOLD'
                          ? (Array.isArray(review.inviter_escalation_reason_codes)
                              ? review.inviter_escalation_reason_codes.join(', ')
                              : 'Inviter escalation requires review.')
                          : review.post_payout_state === 'HOLD'
                            ? (Array.isArray(review.post_payout_reason_codes)
                                ? review.post_payout_reason_codes.join(', ')
                                : 'Post-payout evidence requires review.')
                            : review.v2_state === 'HOLD'
                              ? (Array.isArray(review.v2_reason_codes)
                                  ? review.v2_reason_codes.join(', ')
                                  : 'Sybil v2 evidence requires review.')
                              : (review.sybil_reason ?? 'No review reason.')}
                      </small>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel detailPanel">
                {detailLoading ? (
                  <div className="emptyState">검토 상세를 불러오는 중입니다…</div>
                ) : !selected ? (
                  <div className="emptyState">
                    왼쪽에서 검토할 항목을 선택하세요.
                    <br />
                    Select a review to inspect its evidence and signals.
                  </div>
                ) : (
                  <>
                    <div className="panelHeader">
                      <div>
                        <span className="sectionLabel">REVIEW DETAIL</span>
                        <h2>{selected.invite_code}</h2>
                      </div>
                      <span className="badge">
                        {selected.inviter_escalation_posture === 'HOLD'
                          ? 'INVITER HOLD'
                          : selected.post_payout_state === 'HOLD'
                            ? 'POST_PAYOUT HOLD'
                            : selected.v2_state === 'HOLD'
                              ? 'HOLD'
                              : selected.sybil_status}
                      </span>
                    </div>

                    <div className="facts">
                      <Fact label="Invitee" value={shortAddress(selected.invitee_wallet)} />
                      <Fact label="Inviter" value={shortAddress(selected.inviter_wallet)} />
                      <Fact
                        label="Risk"
                        value={
                          selected.inviter_escalation_posture === 'HOLD'
                            ? `INVITER · ${formatInteger(selected.inviter_escalation_incident_count_90d)}건`
                            : selected.post_payout_state === 'HOLD'
                              ? `POST · ${selected.post_payout_risk_score ?? 0}`
                              : selected.v2_state === 'HOLD'
                                ? `V2 · ${selected.v2_risk_score ?? 0}`
                                : `${selected.sybil_risk_level} · ${selected.sybil_risk_score}`
                        }
                      />
                      <Fact
                        label="Source"
                        value={
                          selected.inviter_escalation_posture === 'HOLD'
                            ? 'INVITER_ESCALATION'
                            : selected.post_payout_state === 'HOLD'
                              ? 'POST_PAYOUT'
                              : selected.v2_state === 'HOLD'
                                ? 'SYBIL_V2'
                                : selected.sybil_source
                        }
                      />
                      <Fact label="Reward" value={selected.reward_status} />
                      <Fact
                        label="Checked"
                        value={formatDate(
                          selected.inviter_escalation_posture === 'HOLD'
                            ? selected.inviter_escalation_latest_incident_at
                            : selected.post_payout_state === 'HOLD'
                              ? selected.post_payout_updated_at
                              : selected.v2_state === 'HOLD'
                                ? selected.v2_updated_at
                                : selected.sybil_checked_at,
                        )}
                      />
                    </div>

                    <div className="reasonBox">
                      <span>현재 검토 사유 / Current reason</span>
                      <p>
                        {selected.inviter_escalation_posture === 'HOLD'
                          ? (inviterReasonCodes.join(', ') || 'Inviter escalation requires review.')
                          : selected.post_payout_state === 'HOLD'
                            ? (postPayoutReasonCodes.join(', ') || 'Post-payout evidence requires review.')
                            : selected.v2_state === 'HOLD'
                              ? (v2ReasonCodes.join(', ') || 'Sybil v2 evidence requires review.')
                              : (selected.sybil_reason ?? '—')}
                      </p>
                    </div>

                    {selected.inviter_escalation_posture === 'HOLD' ||
                    selected.post_payout_state === 'HOLD' ||
                    selected.v2_state === 'HOLD' ? (
                      <section className="onchainSection">
                        <div className="sectionHeaderRow">
                          <div>
                            <span className="sectionLabel">
                              {selected.inviter_escalation_posture === 'HOLD'
                                ? 'INVITER ESCALATION EVIDENCE'
                                : selected.post_payout_state === 'HOLD'
                                  ? 'POST-PAYOUT EVIDENCE'
                                  : 'SYBIL V2 EVIDENCE'}
                            </span>
                            <h3>자동 탐지 근거 / Detection evidence</h3>
                          </div>
                          <span className="badge">
                            revision {String(
                              selected.post_payout_state === 'HOLD'
                                ? selected.post_payout_revision ?? '—'
                                : selected.v2_revision ?? '—',
                            )}
                          </span>
                        </div>
                        <p className="observationNote">
                          {selected.post_payout_state === 'HOLD'
                            ? '이미 지급된 보상은 변경하지 않습니다. 지급 후 B3TR 흐름과 기존 독립 증거가 함께 확인된 건만 수동 검토합니다.'
                            : '여러 독립 증거군이 결합되어 HOLD된 건입니다. 단일 신호만으로 BLACKLIST하지 않습니다.'}
                          <br />
                          {selected.post_payout_state === 'HOLD'
                            ? 'Past rewards stay final; only corroborated post-payout evidence can open a future-participation review.'
                            : 'HOLD requires corroborating evidence families; one signal alone is not a blacklist.'}
                        </p>
                        {v2Evidence.length > 0 ? (
                          <div className="history">
                            {v2Evidence.slice(0, 20).map((item) => (
                              <div className="historyItem" key={item.id}>
                                <div>
                                  <strong>{item.signal_code}</strong>
                                  <span>{item.evidence_family} · {item.strength} · {item.score}</span>
                                </div>
                                <p>
                                  {item.related_wallet
                                    ? `Related ${shortAddress(item.related_wallet)}`
                                    : item.app_id
                                      ? `appId ${item.app_id.slice(0, 10)}…`
                                      : 'Recorded evidence'}
                                </p>
                                <small>
                                  {formatDate(item.created_at)}
                                  {item.observed_block !== null
                                    ? ` · block ${formatInteger(item.observed_block)}`
                                    : ''}
                                </small>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="muted">저장된 v2 세부 근거를 불러오지 못했습니다.</p>
                        )}
                      </section>
                    ) : null}

                    <section className="onchainSection">
                      <div className="sectionHeaderRow">
                        <div>
                          <span className="sectionLabel">ON-CHAIN SIGNALS</span>
                          <h3>온체인 분석 / Blockchain analytics</h3>
                        </div>
                        <button
                          type="button"
                          className="analyticsButton"
                          disabled={analyticsRunning || analyticsLoading}
                          onClick={() => void runOnchainAnalytics()}
                        >
                          {analyticsRunning
                            ? '분석 중…'
                            : onchainSnapshot
                              ? '다시 분석 / Refresh'
                              : '분석 실행 / Run'}
                        </button>
                      </div>

                      <p className="observationNote">
                        이 정보는 보조 신호입니다. 분석 실행만으로 Sybil 상태·보상 상태·B3TR 지급은 변경되지 않습니다.
                        <br />
                        Observation only — these signals never auto-block or change rewards.
                      </p>

                      {analyticsLoading ? (
                        <div className="analyticsEmpty">기존 분석 기록을 불러오는 중입니다…</div>
                      ) : onchainError ? (
                        <div className="analyticsWarning" role="status">
                          <strong>온체인 신호를 불러오지 못했습니다.</strong>
                          <span>{onchainError}</span>
                          <small>수동 판정 기능 자체는 계속 사용할 수 있습니다.</small>
                        </div>
                      ) : !onchainSnapshot ? (
                        <div className="analyticsEmpty">
                          저장된 분석 기록이 없습니다. 필요할 때만 ‘분석 실행’을 눌러 확인하세요.
                        </div>
                      ) : (
                        <>
                          <div className="analyticsMeta">
                            <span className={analyticsStale ? 'freshness stale' : 'freshness'}>
                              {analyticsStale ? '24시간 초과 / STALE' : '최근 분석 / CURRENT'}
                            </span>
                            <span>{formatDate(onchainSnapshot.checked_at)}</span>
                          </div>

                          <div className="signalFacts">
                            <SignalFact
                              label="활동 나이 / Wallet age"
                              value={formatWalletAge(
                                onchainSnapshot.approximate_age_seconds_at_activation,
                              )}
                              hint={`First activity block ${formatInteger(onchainSnapshot.first_observed_activity_block)}`}
                            />
                            <SignalFact
                              label="최초 VET funder"
                              value={shortAddress(onchainSnapshot.first_inbound_vet_sender)}
                              hint={`Block ${formatInteger(onchainSnapshot.first_inbound_vet_block)}`}
                              title={onchainSnapshot.first_inbound_vet_sender ?? undefined}
                            />
                            <SignalFact
                              label="최초 VTHO funder"
                              value={shortAddress(onchainSnapshot.first_inbound_vtho_sender)}
                              hint={`Block ${formatInteger(onchainSnapshot.first_inbound_vtho_block)}`}
                              title={onchainSnapshot.first_inbound_vtho_sender ?? undefined}
                            />
                            <SignalFact
                              label="같은 VET funder 추천 수"
                              value={formatInteger(onchainSnapshot.vet_funder_referral_count)}
                              hint="Including this referral"
                            />
                            <SignalFact
                              label="같은 VTHO funder 추천 수"
                              value={formatInteger(onchainSnapshot.vtho_funder_referral_count)}
                              hint="Including this referral"
                            />
                            <SignalFact
                              label="Activation block"
                              value={formatInteger(onchainSnapshot.activation_block)}
                              hint={onchainSnapshot.network}
                            />
                          </div>

                          <div className="indicatorArea">
                            <span>추가 위험 신호 / Additional indicators</span>
                            {indicators.length > 0 ? (
                              <div className="indicatorList">
                                {indicators.map((indicator) => (
                                  <span className="indicator" key={indicator} title={indicator}>
                                    {INDICATOR_LABELS[indicator] ?? indicator}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p>
                                현재 휴리스틱에서 추가 신호가 감지되지 않았습니다. 이것이 안전을 보증하는 것은 아닙니다.
                                <br />
                                No additional heuristic indicators detected; this is not a safety guarantee.
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </section>

                    <div className="history">
                      <h3>판정 이력 / Review history</h3>
                      {reviewEvents.length > 0 ? (
                        reviewEvents.map((event) => (
                          <div className="historyItem" key={event.id}>
                            <div>
                              <strong>{event.resulting_status}</strong>
                              <span>{event.source}</span>
                            </div>
                            <p>{event.summary}</p>
                            <small>{formatDate(event.created_at)}</small>
                          </div>
                        ))
                      ) : (
                        <p className="muted">기록된 판정 이력이 없습니다.</p>
                      )}
                    </div>

                    <div className="decision">
                      <h3>최종 판정 / Final decision</h3>
                      <label>
                        <span>운영자 판정 사유 (12자 이상)</span>
                        <textarea
                          rows={4}
                          maxLength={500}
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="확인한 근거와 판정 이유를 기록하세요."
                        />
                      </label>
                      <label>
                        <span>확인을 위해 {selected.invite_code} 재입력</span>
                        <input
                          value={confirmation}
                          autoComplete="off"
                          placeholder={selected.invite_code}
                          onChange={(event) => setConfirmation(event.target.value)}
                        />
                      </label>
                      <div className="decisionButtons">
                        <button
                          type="button"
                          className="clear"
                          disabled={!actionReady}
                          onClick={() => void resolveReview('CLEAR')}
                        >
                          승인 / CLEAR
                        </button>
                        <button
                          type="button"
                          className="block"
                          disabled={!actionReady}
                          onClick={() => void resolveReview('BLOCKED')}
                        >
                          {detail?.reviewMode === 'INVITER'
                            ? '초대자 제한 / RESTRICT'
                            : detail?.reviewMode === 'V2' ||
                              detail?.reviewMode === 'POST_PAYOUT'
                              ? '블랙리스트 / BLACKLIST'
                              : '차단 / BLOCK'}
                        </button>
                      </div>
                      <p className="note">
                        {detail?.reviewMode === 'INVITER'
                          ? 'INVITER CLEAR는 현재 반복 파밍 HOLD를 해제하지만 사건 기록은 감사용으로 유지합니다. 새 사건이 발생하면 다시 HOLD될 수 있습니다. RESTRICT는 과거 보상은 건드리지 않고 초대자 지갑의 향후 VeInvite 참여만 제한합니다.'
                          : detail?.reviewMode === 'POST_PAYOUT'
                            ? 'POST_PAYOUT CLEAR는 사후 의심을 해제합니다. POST_PAYOUT BLACKLIST는 이미 지급된 보상은 그대로 두고 해당 보상 수령자 지갑의 향후 VeInvite 참여만 제한합니다.'
                            : detail?.reviewMode === 'V2'
                              ? 'CLEAR는 v2 clearance를 발급해 보상 준비를 재개합니다. v2 BLACKLIST는 이번 미지급 보상을 제외하고 초대받은 지갑의 향후 VeInvite 참여만 제한하며, 사용된 초대 슬롯은 기존 정책대로 다시 열립니다.'
                              : '기존 REVIEW의 BLOCKED 처리는 기존 규칙대로 보상 대상에서 제외합니다.'}
                      </p>
                    </div>
                  </>
                )}
              </section>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .adminScreen{min-height:100dvh;box-sizing:border-box;padding:24px 16px 56px;background:linear-gradient(180deg,#171024,#0d0a14);color:#fff}.shell{width:min(1180px,100%);margin:0 auto;display:grid;gap:18px}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap}.eyebrow,.sectionLabel{color:#ffbd59;font-size:.72rem;font-weight:900;letter-spacing:.09em}.header h1{margin:6px 0 7px;font-size:clamp(1.65rem,4vw,2.55rem);letter-spacing:-.035em}.header p{max-width:760px;margin:0;color:#aaa2b7;font-size:.9rem;line-height:1.6}.headerActions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.headerActions :global(a){padding:10px 13px;border:1px solid rgba(255,255,255,.14);border-radius:12px;color:#fff;font-size:.78rem;font-weight:800;text-decoration:none}.panel,.safety,.notice{border:1px solid rgba(255,255,255,.1);border-radius:20px;background:rgba(255,255,255,.045)}.panel{padding:19px}.emptyPanel{line-height:1.65}.safety{padding:14px 17px;display:grid;gap:5px;border-color:rgba(255,190,84,.25);background:rgba(255,184,77,.07)}.safety strong{color:#ffd283;font-size:.84rem}.safety span{color:#aaa3b2;font-size:.76rem;line-height:1.5}.notice{padding:12px 15px;font-size:.8rem;font-weight:750;line-height:1.45}.notice.error{border-color:rgba(255,101,126,.3);color:#ff9aac}.notice.success{border-color:rgba(81,225,163,.28);color:#82efbf}.grid{display:grid;grid-template-columns:minmax(290px,.76fr) minmax(0,1.4fr);gap:16px;align-items:start}.panelHeader,.reviewTop,.historyItem>div,.sectionHeaderRow,.analyticsMeta{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.panel h2{margin:4px 0 0;font-size:1.25rem}.panel h3{margin:0;font-size:.88rem}.ghost,.analyticsButton{min-height:38px;padding:0 12px;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:rgba(255,255,255,.04);color:#eee;font:inherit;font-size:.72rem;font-weight:800;cursor:pointer}.analyticsButton{border-color:rgba(255,190,84,.3);color:#ffd27c;background:rgba(255,184,77,.08)}button:disabled{opacity:.4;cursor:not-allowed}.reviewList{margin-top:14px;display:grid;gap:9px;max-height:720px;overflow:auto}.review{width:100%;padding:13px;display:grid;gap:6px;border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.035);color:#c7c1ce;font:inherit;text-align:left;cursor:pointer}.review.selected{border-color:rgba(255,190,84,.55);background:rgba(255,184,77,.1)}.review strong{color:#fff}.review>span,.review small{font-size:.68rem}.review small{color:#8e8799;line-height:1.4}.badge{padding:4px 8px;border-radius:999px;background:rgba(255,184,77,.12);color:#ffd27c;font-size:.62rem;font-weight:900}.emptyState{min-height:180px;display:grid;place-items:center;color:#817989;font-size:.82rem;line-height:1.6;text-align:center}.facts{margin-top:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.reasonBox{margin-top:14px;padding:13px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(0,0,0,.14)}.reasonBox span,.indicatorArea>span{color:#817989;font-size:.65rem;font-weight:800}.reasonBox p{margin:6px 0 0;color:#d7d1dc;font-size:.78rem;line-height:1.5}.onchainSection,.history,.decision{margin-top:18px;padding-top:17px;border-top:1px solid rgba(255,255,255,.08)}.onchainSection{display:grid;gap:12px}.observationNote{margin:0;padding:10px 12px;border:1px solid rgba(79,169,255,.16);border-radius:12px;background:rgba(70,147,224,.06);color:#9eaabd;font-size:.68rem;line-height:1.55}.analyticsEmpty,.analyticsWarning{padding:14px;border:1px dashed rgba(255,255,255,.12);border-radius:13px;color:#817989;font-size:.74rem;line-height:1.5}.analyticsWarning{display:grid;gap:4px;border-style:solid;border-color:rgba(255,173,78,.2);background:rgba(255,157,45,.06);color:#c9a77d}.analyticsWarning strong{color:#ffd08c}.analyticsWarning small{color:#8e8173}.analyticsMeta{align-items:center;color:#817989;font-size:.66rem}.freshness{padding:4px 8px;border-radius:999px;background:rgba(72,208,151,.1);color:#7ee7b7;font-weight:900}.freshness.stale{background:rgba(255,167,62,.1);color:#ffc06e}.signalFacts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.indicatorArea{padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:13px;background:rgba(0,0,0,.1)}.indicatorList{margin-top:8px;display:flex;gap:7px;flex-wrap:wrap}.indicator{padding:6px 9px;border:1px solid rgba(255,164,86,.22);border-radius:999px;background:rgba(255,132,62,.08);color:#ffbc87;font-size:.66rem;font-weight:850}.indicatorArea p{margin:7px 0 0;color:#817989;font-size:.67rem;line-height:1.5}.history{display:grid;gap:7px}.historyItem{padding:10px 11px;border-radius:12px;background:rgba(255,255,255,.035)}.historyItem strong{font-size:.72rem}.historyItem span,.historyItem small{color:#837c8c;font-size:.64rem}.historyItem p{margin:5px 0;color:#bbb4c2;font-size:.7rem;line-height:1.4}.muted{color:#817989;font-size:.72rem}.decision{display:grid;gap:12px}.decision label{display:grid;gap:6px}.decision label>span{color:#aaa3b2;font-size:.7rem;font-weight:800}.decision textarea,.decision input{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#0d0b12;color:#fff;font:inherit}.decision textarea{padding:11px 12px;resize:vertical;line-height:1.5}.decision input{min-height:43px;padding:0 12px;text-transform:uppercase}.decisionButtons{display:grid;grid-template-columns:1fr 1fr;gap:9px}.decisionButtons button{min-height:48px;border-radius:13px;font:inherit;font-weight:900;cursor:pointer}.clear{border:1px solid rgba(77,225,160,.35);background:rgba(58,200,137,.14);color:#85efbe}.block{border:1px solid rgba(255,94,122,.35);background:rgba(255,75,106,.12);color:#ff9aac}.note{margin:0;color:#817989;font-size:.67rem;line-height:1.5}.review:focus-visible,.ghost:focus-visible,.analyticsButton:focus-visible,.decision textarea:focus-visible,.decision input:focus-visible,.decisionButtons button:focus-visible{outline:2px solid rgba(255,190,84,.75);outline-offset:2px}@media(max-width:840px){.grid{grid-template-columns:1fr}.reviewList{max-height:360px}.facts,.signalFacts{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){.adminScreen{padding:18px 12px 42px}.panel{padding:15px}.facts,.signalFacts,.decisionButtons{grid-template-columns:1fr}.sectionHeaderRow{align-items:stretch;flex-direction:column}.analyticsButton{width:100%}}
      `}</style>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
      <style jsx>{`
        .fact{min-width:0;padding:10px 11px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.025)}.fact span{display:block;color:#817989;font-size:.62rem;font-weight:800}.fact strong{display:block;margin-top:4px;color:#eee9f1;font-size:.72rem;overflow-wrap:anywhere}
      `}</style>
    </div>
  );
}

function SignalFact({
  label,
  value,
  hint,
  title,
}: {
  label: string;
  value: string;
  hint: string;
  title?: string;
}) {
  return (
    <div className="signalFact" title={title}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
      <style jsx>{`
        .signalFact{min-width:0;padding:10px 11px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.025)}.signalFact span{display:block;color:#817989;font-size:.61rem;font-weight:800}.signalFact strong{display:block;margin-top:4px;color:#eee9f1;font-size:.72rem;overflow-wrap:anywhere}.signalFact small{display:block;margin-top:4px;color:#706977;font-size:.59rem;overflow-wrap:anywhere}
      `}</style>
    </div>
  );
}
