'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWallet } from '@vechain/vechain-kit';

import { WalletControl } from '@/components/WalletControl';

type CaseDetails = {
  operator: string;
  invitation: {
    invite_code: string;
    inviter_wallet: string;
    invitee_wallet: string | null;
    status: string;
    reward_status: string;
    reward_paid_at: string | null;
    sybil_status: string;
  };
  assessment: { revision: number | string; state: string } | null;
  receipt: {
    amount_wei: string;
    recipient_wallet: string;
    tx_id: string;
  } | null;
  invalidation: { status: string } | null;
  obligation: { status: string; amount_wei: string } | null;
  peer: { peerInviteCode: string; peerWallet: string; signals: string[] } | null;
  canBlacklist: boolean;
  projectedLeaderboard: {
    current_recognized_referrals: number | string;
    projected_recognized_referrals: number | string;
  } | null;
};

type ReverseCandidate = {
  inviteCode: string;
  peerInviteCode: string;
  signals: string[];
  rewardAmountWei: string;
};

const API = '/api/admin/sybil/historical-paid';
const CODE = /^[A-HJ-NP-Z2-9]{7}$/;
function formatB3TR(wei: string | undefined): string {
  if (!wei || !/^\d+$/.test(wei)) return '—';
  return (Number(wei) / 1e18).toLocaleString('ko-KR', {
    maximumFractionDigits: 6,
  });
}

export default function HistoricalPaidSybilReviewPage() {
  const { account } = useWallet();
  const [code, setCode] = useState('');
  const [info, setInfo] = useState<CaseDetails | null>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<ReverseCandidate[] | null>(null);
  const [candidatesError, setCandidatesError] = useState('');
  const [refresh, setRefresh] = useState(0);

  // Automatically discover retrospective links when the operator opens
  // this existing manual review page. No background database mutations.
  useEffect(() => {
    if (!account?.address) {
      setCandidates(null);
      setCandidatesError('');
      return;
    }
    const controller = new AbortController();
    setCandidates(null);
    setCandidatesError('');
    void (async () => {
      try {
        const response = await fetch(`${API}?candidates=1`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json() as {
          candidates?: ReverseCandidate[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? '역추적 조회 실패');
        if (!controller.signal.aborted) setCandidates(data.candidates ?? []);
      } catch (caught) {
        if (!controller.signal.aborted) setCandidatesError(
          caught instanceof Error ? caught.message : '역추적 조회 중 오류 발생',
        );
      }
    })();
    return () => controller.abort();
  }, [account?.address, refresh]);

  const load = async (nextCode = code) => {
    const normalized = nextCode.trim().toUpperCase();
    setCode(normalized);
    if (!CODE.test(normalized)) {
      setError('올바른 7자리 초대 코드를 입력하세요.');
      return;
    }
    setLoading(true);
    setInfo(null);
    setError('');
    setMessage('');
    setReason('');
    setConfirmation('');
    try {
      const response = await fetch(
        `${API}?inviteCode=${encodeURIComponent(normalized)}`,
        { cache: 'no-store' },
      );
      const data = await response.json() as CaseDetails & { error?: string };
      if (!response.ok) throw new Error(data.error ?? '검토 대상 조회 실패');
      setInfo(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '조회 중 오류 발생');
    } finally {
      setLoading(false);
    }
  };

  const blacklist = async () => {
    if (!info || !info.canBlacklist || submitting ||
        reason.trim().length < 24 ||
        confirmation.trim().toUpperCase() !== info.invitation.invite_code ||
        !info.invitation.reward_paid_at || !info.assessment) return;
    const warning =
      `${info.invitation.invite_code} 과거 지급 초대를 무효화하시겠습니까?\n\n` +
      `원래 지급 ${formatB3TR(info.receipt?.amount_wei)} B3TR는 변경하지 않습니다.\n` +
      '정상 초대 집계에서 제외되고 향후 초대 보상 상계 채무가 등록됩니다.\n' +
      '초대자 계정은 차단하지 않습니다.';
    if (!window.confirm(warning)) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'INVALIDATE_HISTORICAL_PAID_SYBIL',
          inviteCode: info.invitation.invite_code,
          decision: 'BLACKLIST',
          confirmation: confirmation.trim().toUpperCase(),
          reason: reason.trim(),
          expectedRevision: Number(info.assessment.revision),
          expectedPaidAt: info.invitation.reward_paid_at,
        }),
      });
      const result = await response.json() as {
        error?: string;
        changed?: boolean;
        verified?: boolean;
        warning?: string | null;
      };
      if (!response.ok) throw new Error(result.error ?? '처리 실패');
      setMessage(
        result.verified
          ? '정식 무효화 및 상계 채무 등록을 확인했습니다. 새로 조회해 결과를 확인하세요.'
          : result.warning ?? '조치가 기록됐지만 사후 검증이 미완료입니다. 재실행하지 말고 운영 기록을 확인하세요.',
      );
      setInfo(null); // do not permit a second submission from a stale snapshot
      setConfirmation('');
      setRefresh((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '처리 중 오류 발생');
    } finally {
      setSubmitting(false);
    }
  };

  const ready = info?.canBlacklist &&
    reason.trim().length >= 24 &&
    confirmation.trim().toUpperCase() === info.invitation.invite_code &&
    !submitting;

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <Link href="/admin/sybil-review">← Sybil 관리자</Link>
        <WalletControl />
      </nav>
      <h1>과거 지급된 Sybil 초대 검토</h1>
      <p>
        이미 보상받은 CLEAR 초대를 수동 재검토하는 관리자 전용 절차입니다.
        동일 기기 즉시 전환 및 온체인 자금 지원이 모두 확인된 차단 지갑과의 연결만 허용합니다.
        원래 지급 기록을 변경하지 않으며, 무효화 후 미래 정상 보상에서 상계합니다.
      </p>
      {!account?.address ? (
        <p role="status">운영자 지갑으로 로그인해 주세요.</p>
      ) : (
        <>
          <section aria-label="과거 CLEAR 자동 역추적" style={{
            border: '1px solid #888', borderRadius: 12, padding: 16, margin: '16px 0',
          }}>
            <h2>과거 CLEAR 자동 역추적 · 관리자 검토</h2>
            <button type="button" disabled={submitting}
              onClick={() => setRefresh((value) => value + 1)}>
              후보 다시 확인
            </button>
            <p>
              강한 동일 기기 전환 증거와 독립된 VTHO 자금 연결이 모두
              확인된 과거 지급 유저만 표시합니다. 자동 차단이나 보상 변경은 없습니다.
            </p>
            {candidatesError && <p role="alert">{candidatesError}</p>}
            {!candidatesError && candidates === null && <p role="status">검토 후보 확인 중…</p>}
            {candidates?.length === 0 && <p role="status">현재 추가 검토할 후보가 없습니다.</p>}
            {candidates?.map((candidate) => (
              <div key={candidate.inviteCode} style={{
                borderTop: '1px solid #bbb', padding: '10px 0',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 8,
              }}>
                <span>
                  <strong>{candidate.inviteCode}</strong>
                  {' · '}연결된 BLACK: {candidate.peerInviteCode}
                  {' · '}기존 지급: {formatB3TR(candidate.rewardAmountWei)} B3TR
                </span>
                <button type="button" disabled={loading || submitting}
                  onClick={() => void load(candidate.inviteCode)}>
                  증거 상세 확인
                </button>
              </div>
            ))}
          </section>
          <div style={{ display: 'flex', gap: 8, margin: '18px 0' }}>
            <input aria-label="초대 코드" value={code} maxLength={7}
              onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button type="button" disabled={loading || submitting}
              onClick={() => void load()}>
              {loading ? '조회 중…' : '증거와 예상 결과 조회'}
            </button>
          </div>
          {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
          {message && <p role="status">{message}</p>}
          {info && (
            <section style={{ padding: 16, border: '1px solid #888', borderRadius: 12 }}>
              <h2>{info.invitation.invite_code}</h2>
              <p>피초대자: <code>{info.invitation.invitee_wallet}</code></p>
              <p>초대자: <code>{info.invitation.inviter_wallet}</code></p>
              <p>
                현재: {info.invitation.sybil_status} / {info.invitation.reward_status}
                {' · '}지급: {formatB3TR(info.receipt?.amount_wei)} B3TR
              </p>
              {info.invalidation?.status === 'ACTIVE' && (
                <p role="status">이미 무효화 처리된 사례입니다. 중복 신청하지 마세요.</p>
              )}
              <p>
                차단된 연결 지갑: {info.peer?.peerInviteCode ?? '증거 없음'}
              </p>
              <p>
                증거: {info.peer?.signals.join(', ') ?? '교차 검증 불충분'}
              </p>
              {info.projectedLeaderboard && (
                <p>
                  인정 초대 수: {info.projectedLeaderboard.current_recognized_referrals}
                  {' → '}{info.projectedLeaderboard.projected_recognized_referrals} (예상)
                </p>
              )}
              {!info.canBlacklist ? (
                <p role="status">
                  현재 근거 또는 처리 상태로는 BLACKLIST를 진행할 수 없습니다.
                  추가 조사 후 다시 조회하세요.
                </p>
              ) : (
                <>
                  <label style={{ display: 'block', marginTop: 14 }}>
                    증거와 판단 사유 (24자 이상)
                    <textarea style={{ display: 'block', width: '100%' }}
                      value={reason} rows={4} maxLength={500}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="동일 브라우저 전환, 온체인 VTHO 거래, 연결된 BLACK 지갑의 근거를 기록" />
                  </label>
                  <label style={{ display: 'block', marginTop: 14 }}>
                    확인을 위해 초대 코드 재입력
                    <input style={{ display: 'block' }} value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value.toUpperCase())}
                      maxLength={7} />
                  </label>
                  <button type="button" disabled={!ready}
                    style={{ marginTop: 14 }}
                    onClick={() => void blacklist()}>
                    {submitting ? '검증 중…' : '과거 초대 무효화 및 상계 채무 등록'}
                  </button>
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
