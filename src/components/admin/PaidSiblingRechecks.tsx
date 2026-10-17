'use client';

import { useCallback, useEffect, useState } from 'react';

type Case = {
  network: string;
  paid_invite_code: string;
  blocked_invite_code: string;
  inviter_wallet: string;
  paid_invitee_wallet: string;
  blocked_invitee_wallet: string;
  restriction_id: string;
  shared_client_id: string;
  reward_paid_at: string;
  blocked_at: string;
};

type ResponseData = { cases: Case[]; error?: string };

const API = '/api/admin/sybil/paid-siblings';
const MIN_REASON = 25;

export function PaidSiblingRechecks() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(API, { cache: 'no-store' });
      const body = (await response.json()) as ResponseData;
      if (!response.ok) throw new Error(body.error ?? 'Review list unavailable.');
      setCases(body.cases);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review list unavailable.');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function resolve(item: Case, decision: 'CLEAR' | 'BLACKLIST') {
    if (busy ||
        reason.trim().length < MIN_REASON ||
        confirmation.trim().toUpperCase() !== item.paid_invite_code) return;
    const explanation = decision === 'BLACKLIST'
      ? '과거 지급 추천을 무효화하면 리더보드에서 제외되고, 이미 지급된 금액은 기존 상계 시스템에 등록됩니다. 전액 지급 내역은 수정되지 않습니다.'
      : '이 연결 사건을 검토 완료(CLEAR) 처리합니다. 현재 지급과 기존 CLEAR는 유지되며, 새로운 사건은 별도로 다시 검토됩니다.';
    if (!window.confirm(explanation)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'RESOLVE_PAID_SIBLING_RECHECK',
          paidInviteCode: item.paid_invite_code,
          restrictionId: item.restriction_id,
          decision,
          reason: reason.trim(),
          confirmation: confirmation.trim().toUpperCase(),
        }),
      });
      const payload = (await response.json()) as { error?: string; changed?: boolean };
      if (!response.ok) throw new Error(payload.error ?? 'Review decision failed.');
      setMessage(decision === 'CLEAR'
        ? '검토 완료: 기존 보상과 CLEAR를 유지합니다.'
        : '과거 추천 무효화 완료: 기존 지급 기록은 보존하고 상계 의무를 등록했습니다.');
      setSelected(null);
      setReason('');
      setConfirmation('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review decision failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-label="지급 후 연결 지갑 재검토">
      <div className="panelHeader">
        <div>
          <span className="sectionLabel">PAID SIBLING RECHECK</span>
          <h2>과거 지급 재심사 {cases.length}건</h2>
        </div>
        <button type="button" className="ghost" disabled={busy}
          onClick={() => void refresh()}>새로고침</button>
      </div>
      <p>
        이미 보상받은 지갑과 동일 초대자·동일 브라우저를 사용한 후발 지갑이 시빌로 차단되면 표시됩니다.
        기기 연결만으로 기존 보상을 자동 무효화하지 않습니다.
      </p>
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      {message ? <div className="notice success" role="status">{message}</div> : null}
      {cases.length === 0 ? <p>현재 새롭게 발견된 지급 후 연결 지갑 재심사 건이 없습니다.</p> : null}
      {cases.map((item) => (
        <div key={item.restriction_id + item.paid_invite_code}>
          <button type="button" className="ghost" disabled={busy}
            onClick={() => {
              setSelected(selected === item.restriction_id ? null : item.restriction_id);
              setReason('');
              setConfirmation('');
            }}>
            <strong>{item.paid_invite_code}</strong> · 차단된 후발 초대 {item.blocked_invite_code} · 상세/심사
          </button>
          {selected === item.restriction_id ? (
            <div>
              <p>초대자: <code>{item.inviter_wallet}</code></p>
              <p>과거 지급 피초대자: <code>{item.paid_invitee_wallet}</code></p>
              <p>차단된 피초대자: <code>{item.blocked_invitee_wallet}</code></p>
              <p>공통 기기 식별자: <code>{item.shared_client_id}</code></p>
              <p>기존 보상 지급: {new Date(item.reward_paid_at).toLocaleString('ko-KR')}</p>
              <p>후발 지갑 차단: {new Date(item.blocked_at).toLocaleString('ko-KR')}</p>
              <p>정상적인 최초 참여 후 부정 중복 참여했을 가능성도 있습니다.
                최초 지급을 무효화하려면 독립적인 추가 증거와 판단 근거가 필요합니다.</p>
              <label>
                심사 사유 (25–500자)
                <textarea aria-label="과거 지급 재심사 사유" rows={3}
                  maxLength={500} value={reason} disabled={busy}
                  onChange={(event) => setReason(event.target.value)} />
              </label>
              <label>
                확인을 위해 과거 초대 코드 {item.paid_invite_code} 입력
                <input aria-label="과거 초대 코드 확인" autoComplete="off"
                  value={confirmation} disabled={busy} maxLength={7}
                  onChange={(event) => setConfirmation(event.target.value.toUpperCase())} />
              </label>
              <div className="headerActions">
                <button type="button" className="ghost"
                  disabled={busy || reason.trim().length < MIN_REASON || confirmation !== item.paid_invite_code}
                  onClick={() => void resolve(item, 'CLEAR')}>정상 유지 · CLEAR</button>
                <button type="button" className="ghost"
                  disabled={busy || reason.trim().length < MIN_REASON || confirmation !== item.paid_invite_code}
                  onClick={() => void resolve(item, 'BLACKLIST')}>증거 확인 후 과거 보상 무효화</button>
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
