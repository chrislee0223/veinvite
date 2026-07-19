'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Brand } from './Brand';
import { useActiveWallet } from './WalletControl';
import type { InviteRecord } from '@/lib/types';

const WalletButton = dynamic(
  () => import('@vechain/vechain-kit').then((mod) => mod.WalletButton),
  { ssr: false },
);

type Step = 'landing' | 'wallet' | 'checking' | 'success' | 'missions' | 'error' | 'review';

export function InviteeClient({ code }: { code: string }) {
  const wallet = useActiveWallet();
  const [invite, setInvite] = useState<InviteRecord | null>(null);
  const [step, setStep] = useState<Step>('landing');
  const [error, setError] = useState('');
  const [demoOutcome, setDemoOutcome] = useState('success');

  useEffect(() => {
    void fetch(`/api/invites/${code}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? '유효하지 않은 링크입니다.');
        setInvite(data.invite);
      })
      .catch((reason) => { setError(reason.message); setStep('error'); });
  }, [code]);

  const claim = async () => {
    if (!wallet) { setStep('wallet'); return; }
    setStep('checking');
    await new Promise((resolve) => setTimeout(resolve, 850));
    const response = await fetch(`/api/invites/${code}/claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inviteeAddress: wallet,
        demoOutcome: demoOutcome === 'success' ? undefined : demoOutcome,
      }),
    });
    const data = await response.json();
    if (response.status === 202 || data.outcome === 'review') { setStep('review'); return; }
    if (!response.ok) { setError(data.message ?? data.error ?? '자격을 확인하지 못했습니다.'); setStep('error'); return; }
    setInvite(data.invite); setStep('success');
  };

  const completeMissions = async () => {
    const response = await fetch(`/api/invites/${code}/complete`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? '완료 상태를 확인하지 못했습니다.'); setStep('error'); return; }
    setInvite(data.invite);
  };

  if (step === 'error') {
    return <Centered><div className="errorIcon">×</div><h1>{error || '초대를 받을 수 없어요'}</h1><p className="muted">추천인에게 새로운 링크를 요청해 주세요.</p><Link className="secondaryButton linkButton" href="/">홈으로</Link></Centered>;
  }

  if (step === 'review') {
    return <Centered><div className="reviewIcon">◷</div><h1>계정을 확인하고 있어요</h1><p className="muted">검토가 완료되면 앱에서 알려드릴게요. 반복해서 연결할 필요는 없습니다.</p></Centered>;
  }

  if (step === 'checking') {
    return <Centered><div className="spinnerLarge" /><h1>자격을 확인하고 있어요</h1><p className="muted">기존 이용 이력, 다른 초대 연결 여부, 링크 상태를 확인합니다.</p><div className="checkList"><span>○ 링크 상태 확인 중</span><span>○ 기존 참여 이력 확인 중</span><span>○ 다른 초대 연결 여부 확인 중</span></div></Centered>;
  }

  if (step === 'wallet') {
    return <Centered><div className="walletVisual" /><h1>지갑을 연결해 주세요</h1><p className="muted">연결된 지갑을 기준으로 VeBetterDAO 이용 여부와 초대 자격을 확인합니다.</p><WalletButton /><button className="primaryButton" disabled={!wallet} onClick={claim}>{wallet ? '자격 확인하기' : '지갑 연결 후 계속'}</button></Centered>;
  }

  if (step === 'success') {
    return <Centered><div className="successCircle">✓</div><h1>초대가 연결됐어요</h1><p className="muted">이제 미션을 완료하고 VeBetterDAO를 직접 경험해 보세요.</p><div className="missionSummary"><span>✓ 지갑 연결</span><span>2 VeBetter 앱 3개 체험하기</span><span>3 투표 참여하기</span></div><button className="primaryButton greenButton" onClick={() => setStep('missions')}>미션 보기</button></Centered>;
  }

  if (step === 'missions') {
    const completed = invite?.status === 'COMPLETED';
    return (
      <main className="appShell">
        <header className="appHeader"><Brand /><span className="chip">초대받은 친구</span></header>
        <section className="panel missionPanel">
          <span className="eyebrow">나의 미션</span><h1>{completed ? '모든 미션 완료' : '지금 해야 할 한 가지'}</h1>
          <div className="mission done"><span>✓</span><div><b>지갑 연결</b><p>참여 지갑이 연결됐어요.</p></div><em>완료</em></div>
          <div className={`mission ${completed ? 'done' : 'current'}`}><span>{completed ? '✓' : '◎'}</span><div><b>VeBetter 앱 3개 체험하기</b><p>서로 다른 앱을 이용하고 B3TR를 획득하세요.</p></div><em>{completed ? '완료' : '진행 중'}</em></div>
          <div className={`mission ${completed ? 'done' : 'locked'}`}><span>{completed ? '✓' : '◇'}</span><div><b>투표 참여하기</b><p>B3TR를 VOT3로 바꾼 뒤 앱 투표에 참여하세요.</p></div><em>{completed ? '완료' : '잠김'}</em></div>
          {!completed ? <button className="secondaryButton" onClick={completeMissions}>데모: 모든 조건 완료 처리</button> : <div className="notice successNotice">활성화가 확인됐어요. 이제 나도 한 명을 초대할 수 있어요.</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="inviteLanding">
      <Brand compact />
      <div className="inviteOrb">↗</div>
      <span className="eyebrow">VeInvite 초대</span>
      <h1>VeBetterDAO에<br />초대받았어요</h1>
      <p>VeBetterDAO를 처음 시작하고 미션을 완료하면 나도 새로운 친구 한 명을 초대할 수 있어요.</p>
      <div className="panel eligibilityInfo"><b>참여 가능 안내</b><p className="muted">기존 VeChain 지갑을 사용 중이어도 VeBetterDAO를 이용한 적이 없다면 참여할 수 있습니다.</p></div>
      <button className="primaryButton" onClick={() => { if (wallet) void claim(); else setStep('wallet'); }} disabled={!invite}>시작하기</button>
      {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? (
        <label className="demoSelect">데모 결과<select value={demoOutcome} onChange={(event) => setDemoOutcome(event.target.value)}><option value="success">정상 연결</option><option value="existing">기존 VeBetter 이용자</option><option value="other">다른 추천인 연결</option><option value="review">안전성 검토</option></select></label>
      ) : null}
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="centeredFlow"><Brand compact />{children}</main>;
}
