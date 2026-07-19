'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Brand, Mascot } from './Brand';
import { useActiveWallet, WalletControl } from './WalletControl';
import type { InviteRecord } from '@/lib/types';

export function HomeClient() {
  const wallet = useActiveWallet();
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  const latest = invites[0];
  const active = latest && ['PENDING_ACCEPTANCE', 'ACTIVATING', 'UNDER_REVIEW'].includes(latest.status)
    ? latest
    : undefined;
  const completed = latest?.status === 'COMPLETED' ? latest : undefined;

  const load = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/invites?inviter=${encodeURIComponent(wallet)}`, { cache: 'no-store' });
      const data = (await response.json()) as { invites?: InviteRecord[] };
      setInvites(data.invites ?? []);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => { void load(); }, [load]);

  const createInvite = async () => {
    if (!wallet) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/invites', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviterAddress: wallet }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '초대 링크를 만들지 못했습니다.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const cancelInvite = async () => {
    if (!wallet || !active) return;
    await fetch(`/api/invites/${active.code}/cancel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviterAddress: wallet }),
    });
    setShowCancel(false);
    setMessage('초대가 취소됐어요. 다시 한 명을 초대할 수 있어요.');
    await load();
  };

  const inviteUrl = useMemo(() => {
    if (!active || typeof window === 'undefined') return '';
    return `${window.location.origin}/i/${active.code}`;
  }, [active]);

  const copyInvite = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setMessage('초대 링크를 복사했어요.');
  };

  const shareInvite = async () => {
    if (!inviteUrl) return;
    if (navigator.share) {
      await navigator.share({ title: 'VeInvite 초대', text: 'VeBetterDAO를 처음 시작해 보세요.', url: inviteUrl });
    } else {
      await copyInvite();
    }
  };

  const statusLabel = active?.status === 'PENDING_ACCEPTANCE'
    ? '초대 수락 대기'
    : active?.status === 'ACTIVATING'
      ? '활성화 진행 중'
      : active?.status === 'UNDER_REVIEW'
        ? '안전성 검토 중'
        : '';

  return (
    <main className="appShell">
      <header className="appHeader"><Brand /><WalletControl /></header>
      <section className="heroCard">
        <div className="heroCopy">
          <span className="eyebrow">Invite. Activate. Grow.</span>
          <h1>{active ? '현재 한 명을 초대하고 있어요' : completed ? '새로운 친구 초대 가능' : '1명 초대 가능'}</h1>
          <p>{active ? '친구의 활성화가 확인되면 다음 친구를 초대할 수 있어요.' : 'VeBetterDAO를 처음 이용하는 친구를 초대하세요.'}</p>
        </div>
        <Mascot />
        {!active ? (
          <button className="primaryButton" disabled={!wallet || loading} onClick={createInvite}>
            {loading ? '준비 중…' : '친구 초대하기'}
          </button>
        ) : null}
      </section>

      {!wallet ? <div className="notice">먼저 지갑을 연결해 주세요.</div> : null}
      {message ? <div className="notice successNotice">{message}</div> : null}

      {active ? (
        <section className="panel">
          <div className="panelHeading"><h2>{statusLabel}</h2><span className="chip">{active.code}</span></div>
          <p className="muted">처음 자격 확인을 완료한 한 명에게만 이 링크가 연결됩니다.</p>
          <div className="linkBox"><code>{inviteUrl || `/i/${active.code}`}</code></div>
          <div className="buttonGrid">
            <button className="secondaryButton" onClick={copyInvite}>링크 복사</button>
            <button className="primaryButton inline" onClick={shareInvite}>공유하기</button>
          </div>
          {active.inviteeAddress ? <p className="walletLine">연결 지갑: {active.inviteeAddress.slice(0, 8)}···{active.inviteeAddress.slice(-6)}</p> : null}
          <button className="dangerLink" onClick={() => setShowCancel(true)}>초대 취소하기</button>
        </section>
      ) : (
        <section className="panel emptyPanel">
          <div className="emptyIcon">◎</div><h2>진행 중인 초대가 없어요</h2>
          <p className="muted">친구를 초대하면 진행 상황이 여기에 표시돼요.</p>
        </section>
      )}

      {completed ? (
        <section className="panel rewardPanel">
          <div><span className="eyebrow">이번 주 추천 보상</span><h2>정산 참여 중</h2><p className="muted">주간 참여 결과에 따라 금액이 결정됩니다.</p></div>
          <span className="completedMark">✓</span>
        </section>
      ) : null}

      <footer className="footerLinks"><Link href="/privacy">개인정보처리방침</Link><Link href="/terms">이용약관</Link></footer>

      {showCancel ? (
        <div className="modalBackdrop" role="dialog" aria-modal="true">
          <div className="modalCard">
            <div className="warningIcon">!</div><h2>초대를 취소할까요?</h2>
            <p>초대 가능 인원은 즉시 복구됩니다. 친구는 계속 VeBetterDAO를 이용할 수 있지만, 나중에 활성화돼도 해당 초대의 추천 보상은 받을 수 없습니다.</p>
            <button className="primaryButton" onClick={() => setShowCancel(false)}>계속 초대 유지</button>
            <button className="dangerLink" onClick={cancelInvite}>초대 취소</button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
