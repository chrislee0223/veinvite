'use client';

import {
  useCallback,
  useEffect,
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

type ReviewDetailResponse = {
  network: string;
  verifiedOperator: string;
  invitation: ReviewRow;
  reviewEvents: ReviewEvent[];
  canResolve: boolean;
};

type Decision = 'CLEAR' | 'BLOCKED';

const REVIEW_API = '/api/admin/sybil/review';
const MIN_REASON_LENGTH = 12;

function shortAddress(value: string | null) {
  if (!value) {
    return '—';
  }

  if (value.length < 18) {
    return value;
  }

  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function readJson(response: Response) {
  const data = (await response.json()) as
    | Record<string, unknown>
    | { error?: string };

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
  const walletAddress =
    account?.address?.toLowerCase() ?? null;

  const [overview, setOverview] =
    useState<ReviewListResponse | null>(null);
  const [detail, setDetail] =
    useState<ReviewDetailResponse | null>(null);
  const [selectedCode, setSelectedCode] =
    useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] =
    useState('');
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] =
    useState(false);
  const [submitting, setSubmitting] =
    useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadReviews = useCallback(async () => {
    if (!walletAddress) {
      setOverview(null);
      setDetail(null);
      setSelectedCode(null);
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(REVIEW_API, {
        cache: 'no-store',
      });
      const data = await readJson(response);
      setOverview(data as ReviewListResponse);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Review list could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  const loadDetail = useCallback(
    async (inviteCode: string) => {
      setDetailLoading(true);
      setError('');
      setMessage('');

      try {
        const response = await fetch(
          `${REVIEW_API}?inviteCode=${encodeURIComponent(inviteCode)}`,
          { cache: 'no-store' },
        );
        const data = await readJson(response);
        setDetail(data as ReviewDetailResponse);
        setSelectedCode(inviteCode);
        setReason('');
        setConfirmation('');
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Review detail could not be loaded.',
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const resolveReview = async (decision: Decision) => {
    const invitation = detail?.invitation;

    if (
      !invitation ||
      !detail.canResolve ||
      !invitation.sybil_checked_at ||
      submitting
    ) {
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

    const decisionLabel =
      decision === 'CLEAR'
        ? '승인(CLEAR)'
        : '차단(BLOCKED)';
    const confirmed = window.confirm(
      `${invitation.invite_code}를 ${decisionLabel} 처리할까요? 이 판정은 보상 자격에 영향을 줄 수 있지만 B3TR 전송은 실행하지 않습니다.`,
    );

    if (!confirmed) {
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
          expectedCheckedAt:
            invitation.sybil_checked_at,
        }),
      });
      const data = await readJson(response);

      setMessage(
        decision === 'CLEAR'
          ? '검토를 승인했습니다. 보상 전송은 실행되지 않았습니다. / Review cleared; no reward transfer was performed.'
          : '검토를 차단 처리했습니다. 보상 전송은 실행되지 않았습니다. / Review blocked; no reward transfer was performed.',
      );

      await loadReviews();

      const returnedInvitation =
        data.invitation as ReviewRow | undefined;

      if (
        returnedInvitation?.status === 'UNDER_REVIEW' &&
        returnedInvitation.sybil_status === 'REVIEW'
      ) {
        await loadDetail(returnedInvitation.invite_code);
      } else {
        setDetail(null);
        setSelectedCode(null);
        setReason('');
        setConfirmation('');
      }
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

  const selectedInvitation = detail?.invitation ?? null;
  const actionReady = Boolean(
    selectedInvitation &&
      detail?.canResolve &&
      reason.trim().length >= MIN_REASON_LENGTH &&
      confirmation.trim().toUpperCase() ===
        selectedInvitation.invite_code &&
      !submitting,
  );

  return (
    <main className="adminScreen">
      <div className="adminShell">
        <header className="adminHeader">
          <div>
            <span className="eyebrow">VEINVITE ADMIN</span>
            <h1>수동 Sybil 검토 / Manual Review</h1>
            <p>
              자동 탐지에서 REVIEW로 보류된 추천을 사람이 최종 검토합니다.
              승인 또는 차단은 보상 자격에 영향을 줄 수 있지만 이 화면은 B3TR을 전송하지 않습니다.
            </p>
          </div>
          <div className="headerActions">
            <Link href="/admin/participants">
              참가자 현황 / Participants
            </Link>
            <Link href="/admin/rewards">
              보상 관리 / Rewards
            </Link>
            <WalletControl />
          </div>
        </header>

        {!walletAddress ? (
          <section className="panel emptyPanel">
            운영자 지갑을 연결해 주세요.
            <br />
            Connect the VeInvite operator wallet to continue.
          </section>
        ) : null}

        {walletAddress ? (
          <section className="safetyBanner">
            <strong>Human-in-the-loop safety</strong>
            <span>
              판정 전 최신 상태를 다시 확인하며, 판정 화면을 연 뒤 Sybil 상태가 바뀌면 요청을 거부합니다.
              모든 운영자 판정은 감사 이벤트에 운영자 지갑과 함께 기록됩니다.
            </span>
          </section>
        ) : null}

        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="notice success" role="status">
            {message}
          </div>
        ) : null}

        {walletAddress ? (
          <div className="reviewGrid">
            <section className="panel listPanel">
              <div className="panelHeader">
                <div>
                  <span className="sectionLabel">OPEN REVIEWS</span>
                  <h2>
                    검토 대기 {overview?.reviewCount ?? 0}건
                  </h2>
                </div>
                <button
                  type="button"
                  className="ghostButton"
                  disabled={loading}
                  onClick={() => void loadReviews()}
                >
                  {loading ? '불러오는 중…' : '새로고침'}
                </button>
              </div>

              {loading && !overview ? (
                <p className="muted">검토 목록을 불러오는 중입니다…</p>
              ) : null}

              {overview && overview.reviews.length === 0 ? (
                <div className="emptyState">
                  현재 수동 검토가 필요한 추천이 없습니다.
                  <br />
                  No referrals currently require manual review.
                </div>
              ) : null}

              <div className="reviewList">
                {overview?.reviews.map((review) => (
                  <button
                    key={review.invite_code}
                    type="button"
                    className={
                      selectedCode === review.invite_code
                        ? 'reviewCard selected'
                        : 'reviewCard'
                    }
                    onClick={() =>
                      void loadDetail(review.invite_code)
                    }
                  >
                    <div className="reviewCardTop">
                      <strong>{review.invite_code}</strong>
                      <span className="riskBadge">
                        {review.sybil_risk_level} · {review.sybil_risk_score}
                      </span>
                    </div>
                    <span>
                      Invitee {shortAddress(review.invitee_wallet)}
                    </span>
                    <span>
                      Source {review.sybil_source} · Checked {formatDate(review.sybil_checked_at)}
                    </span>
                    <small>
                      {review.sybil_reason ?? 'No review reason recorded.'}
                    </small>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel detailPanel">
              {detailLoading ? (
                <div className="emptyState">
                  검토 상세를 불러오는 중입니다…
                </div>
              ) : !selectedInvitation ? (
                <div className="emptyState">
                  왼쪽에서 검토할 항목을 선택하세요.
                  <br />
                  Select a review to inspect its evidence and history.
                </div>
              ) : (
                <>
                  <div className="panelHeader">
                    <div>
                      <span className="sectionLabel">REVIEW DETAIL</span>
                      <h2>{selectedInvitation.invite_code}</h2>
                    </div>
                    <span className="statusBadge">
                      {selectedInvitation.sybil_status}
                    </span>
                  </div>

                  <div className="factsGrid">
                    <Fact
                      label="Invitee"
                      value={shortAddress(selectedInvitation.invitee_wallet)}
                    />
                    <Fact
                      label="Inviter"
                      value={shortAddress(selectedInvitation.inviter_wallet)}
                    />
                    <Fact
                      label="Risk"
                      value={`${selectedInvitation.sybil_risk_level} · ${selectedInvitation.sybil_risk_score}`}
                    />
                    <Fact
                      label="Source"
                      value={selectedInvitation.sybil_source}
                    />
                    <Fact
                      label="Reward"
                      value={selectedInvitation.reward_status}
                    />
                    <Fact
                      label="Checked"
                      value={formatDate(selectedInvitation.sybil_checked_at)}
                    />
                  </div>

                  <div className="reasonBox">
                    <span>자동 검토 사유 / Current reason</span>
                    <p>
                      {selectedInvitation.sybil_reason ?? '—'}
                    </p>
                  </div>

                  <div className="historySection">
                    <h3>판정 이력 / Review history</h3>
                    {detail?.reviewEvents.length ? (
                      <div className="historyList">
                        {detail.reviewEvents.map((event) => (
                          <div className="historyItem" key={event.id}>
                            <div>
                              <strong>{event.resulting_status}</strong>
                              <span>{event.source}</span>
                            </div>
                            <p>{event.summary}</p>
                            <small>{formatDate(event.created_at)}</small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">기록된 판정 이력이 없습니다.</p>
                    )}
                  </div>

                  <div className="decisionSection">
                    <h3>최종 판정 / Final decision</h3>
                    <label>
                      <span>운영자 판정 사유 (12자 이상)</span>
                      <textarea
                        value={reason}
                        maxLength={500}
                        rows={4}
                        onChange={(event) =>
                          setReason(event.target.value)
                        }
                        placeholder="확인한 근거와 판정 이유를 기록하세요. / Record the evidence and reason for your decision."
                      />
                    </label>
                    <label>
                      <span>
                        확인을 위해 초대 코드 {selectedInvitation.invite_code} 재입력
                      </span>
                      <input
                        value={confirmation}
                        autoComplete="off"
                        onChange={(event) =>
                          setConfirmation(event.target.value)
                        }
                        placeholder={selectedInvitation.invite_code}
                      />
                    </label>

                    {!detail?.canResolve ? (
                      <div className="notice error">
                        이 항목은 더 이상 REVIEW 상태가 아니므로 판정할 수 없습니다. 새로고침해 주세요.
                      </div>
                    ) : null}

                    <div className="decisionButtons">
                      <button
                        type="button"
                        className="clearButton"
                        disabled={!actionReady}
                        onClick={() => void resolveReview('CLEAR')}
                      >
                        승인 / CLEAR
                      </button>
                      <button
                        type="button"
                        className="blockButton"
                        disabled={!actionReady}
                        onClick={() => void resolveReview('BLOCKED')}
                      >
                        차단 / BLOCK
                      </button>
                    </div>
                    <p className="decisionNote">
                      CLEAR는 모든 기존 미션 조건을 다시 만족하는 경우에만 완료 상태로 이어질 수 있습니다.
                      BLOCKED는 보상 대상에서 제외합니다. 어느 버튼도 B3TR 전송을 실행하지 않습니다.
                    </p>
                  </div>
                </>
              )}
            </section>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .adminScreen { min-height:100dvh; box-sizing:border-box; padding:24px 16px 56px; background:linear-gradient(180deg,#171024,#0d0a14); color:#fff; }
        .adminShell { width:min(1180px,100%); margin:0 auto; display:grid; gap:18px; }
        .adminHeader { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; flex-wrap:wrap; }
        .eyebrow,.sectionLabel { color:#ffbd59; font-size:.72rem; font-weight:900; letter-spacing:.09em; }
        h1 { margin:6px 0 7px; font-size:clamp(1.65rem,4vw,2.55rem); letter-spacing:-.035em; }
        .adminHeader p { max-width:720px; margin:0; color:#aaa2b7; font-size:.9rem; line-height:1.6; }
        .headerActions { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
        .headerActions :global(a) { padding:10px 13px; border:1px solid rgba(255,255,255,.14); border-radius:12px; color:#fff; font-size:.78rem; font-weight:800; text-decoration:none; }
        .panel,.safetyBanner,.notice { border:1px solid rgba(255,255,255,.1); border-radius:20px; background:rgba(255,255,255,.045); }
        .panel { padding:19px; }
        .emptyPanel { line-height:1.65; }
        .safetyBanner { padding:14px 17px; display:grid; gap:5px; border-color:rgba(255,190,84,.25); background:rgba(255,184,77,.07); }
        .safetyBanner strong { color:#ffd283; font-size:.84rem; }
        .safetyBanner span { color:#aaa3b2; font-size:.76rem; line-height:1.5; }
        .notice { padding:12px 15px; font-size:.8rem; font-weight:750; line-height:1.45; }
        .notice.error { border-color:rgba(255,101,126,.3); background:rgba(255,88,114,.08); color:#ff9aac; }
        .notice.success { border-color:rgba(81,225,163,.28); background:rgba(62,205,145,.08); color:#82efbf; }
        .reviewGrid { display:grid; grid-template-columns:minmax(290px,.76fr) minmax(0,1.4fr); gap:16px; align-items:start; }
        .panelHeader { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
        h2 { margin:4px 0 0; font-size:1.25rem; }
        h3 { margin:0; font-size:.88rem; }
        .ghostButton { min-height:38px; padding:0 12px; border:1px solid rgba(255,255,255,.12); border-radius:11px; background:rgba(255,255,255,.04); color:#eee; font:inherit; font-size:.72rem; font-weight:800; cursor:pointer; }
        button:disabled { opacity:.4; cursor:not-allowed; }
        .reviewList { margin-top:14px; display:grid; gap:9px; max-height:720px; overflow:auto; }
        .reviewCard { width:100%; padding:13px; display:grid; gap:6px; border:1px solid rgba(255,255,255,.09); border-radius:14px; background:rgba(255,255,255,.035); color:#c7c1ce; font:inherit; text-align:left; cursor:pointer; }
        .reviewCard.selected { border-color:rgba(255,190,84,.55); background:rgba(255,184,77,.1); }
        .reviewCardTop { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .reviewCard strong { color:#fff; font-size:.9rem; }
        .reviewCard > span { font-size:.68rem; }
        .reviewCard small { color:#8e8799; font-size:.68rem; line-height:1.4; }
        .riskBadge,.statusBadge { padding:4px 8px; border-radius:999px; background:rgba(255,184,77,.12); color:#ffd27c; font-size:.62rem; font-weight:900; }
        .emptyState { min-height:180px; display:grid; place-items:center; color:#817989; font-size:.82rem; line-height:1.6; text-align:center; }
        .muted { color:#817989; font-size:.76rem; }
        .factsGrid { margin-top:16px; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:9px; }
        .reasonBox { margin-top:14px; padding:13px; border:1px solid rgba(255,255,255,.08); border-radius:13px; background:rgba(0,0,0,.14); }
        .reasonBox span { color:#817989; font-size:.65rem; font-weight:800; }
        .reasonBox p { margin:6px 0 0; color:#d7d1dc; font-size:.78rem; line-height:1.5; }
        .historySection,.decisionSection { margin-top:18px; padding-top:17px; border-top:1px solid rgba(255,255,255,.08); }
        .historyList { margin-top:10px; display:grid; gap:7px; max-height:220px; overflow:auto; }
        .historyItem { padding:10px 11px; border-radius:12px; background:rgba(255,255,255,.035); }
        .historyItem > div { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .historyItem strong { font-size:.72rem; }.historyItem span,.historyItem small { color:#837c8c; font-size:.64rem; }
        .historyItem p { margin:5px 0; color:#bbb4c2; font-size:.7rem; line-height:1.4; }
        .decisionSection { display:grid; gap:12px; }
        label { display:grid; gap:6px; }
        label > span { color:#aaa3b2; font-size:.7rem; font-weight:800; }
        textarea,input { width:100%; box-sizing:border-box; border:1px solid rgba(255,255,255,.12); border-radius:12px; background:#0d0b12; color:#fff; font:inherit; }
        textarea { padding:11px 12px; resize:vertical; line-height:1.5; }
        input { min-height:43px; padding:0 12px; text-transform:uppercase; }
        textarea:focus-visible,input:focus-visible,.reviewCard:focus-visible,.ghostButton:focus-visible { outline:2px solid rgba(255,190,84,.75); outline-offset:2px; }
        .decisionButtons { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
        .decisionButtons button { min-height:48px; border-radius:13px; font:inherit; font-weight:900; cursor:pointer; }
        .clearButton { border:1px solid rgba(77,225,160,.35); background:rgba(58,200,137,.14); color:#85efbe; }
        .blockButton { border:1px solid rgba(255,94,122,.35); background:rgba(255,75,106,.12); color:#ff9aac; }
        .decisionNote { margin:0; color:#817989; font-size:.67rem; line-height:1.5; }
        @media (max-width:840px) { .reviewGrid { grid-template-columns:1fr; }.reviewList { max-height:360px; }.factsGrid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @media (max-width:480px) { .adminScreen { padding:18px 12px 42px; }.panel { padding:15px; }.factsGrid,.decisionButtons { grid-template-columns:1fr; } }
      `}</style>
    </main>
  );
}

function Fact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
      <style jsx>{`
        .fact { min-width:0; padding:10px 11px; border:1px solid rgba(255,255,255,.07); border-radius:12px; background:rgba(255,255,255,.025); }
        .fact span { display:block; color:#817989; font-size:.62rem; font-weight:800; }
        .fact strong { display:block; margin-top:4px; color:#eee9f1; font-size:.72rem; overflow-wrap:anywhere; }
      `}</style>
    </div>
  );
}
