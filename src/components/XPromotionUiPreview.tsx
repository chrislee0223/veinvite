'use client';

import { useMemo, useState } from 'react';

type PromotionPreviewState =
  | 'BASE_PAID'
  | 'OPEN'
  | 'VERIFYING'
  | 'RETENTION'
  | 'PAYOUT_PENDING'
  | 'PAID'
  | 'EXPIRED';

const STATES: Array<{
  id: PromotionPreviewState;
  label: string;
  description: string;
}> = [
  {
    id: 'BASE_PAID',
    label: '기본 보상 지급',
    description: '기본 Referral 보상이 막 지급된 직후',
  },
  {
    id: 'OPEN',
    label: 'X 공유 가능',
    description: '24시간 안에 X 공유 보너스를 받을 수 있는 상태',
  },
  {
    id: 'VERIFYING',
    label: '게시물 확인 중',
    description: 'X Post 링크를 제출했고 서버가 확인 중인 상태',
  },
  {
    id: 'RETENTION',
    label: '24시간 유지 확인',
    description: '첫 확인 완료 후 동일 Post가 공개 상태인지 확인 중',
  },
  {
    id: 'PAYOUT_PENDING',
    label: '지급 준비',
    description: '최종 조건 통과 후 +10 B3TR 지급 대기',
  },
  {
    id: 'PAID',
    label: '추가 보상 지급 완료',
    description: '+10 B3TR까지 실제 지급 완료',
  },
  {
    id: 'EXPIRED',
    label: '기회 종료',
    description: '24시간 내 공유하지 않아 Promotion 몫이 반환된 상태',
  },
];

const BASE_AMOUNT = '183.91';
const PROMO_AMOUNT = '10';

export function XPromotionUiPreview() {
  const [state, setState] =
    useState<PromotionPreviewState>('BASE_PAID');

  const copy = useMemo(() => {
    switch (state) {
      case 'BASE_PAID':
      case 'OPEN':
        return {
          title: `+${BASE_AMOUNT} B3TR 지급 완료`,
          body: '친구 초대 보상이 지급되었습니다.',
          action: `X에 공유하고 +${PROMO_AMOUNT} B3TR`,
          hint: '24시간 안에 공유할 수 있어요.',
          tone: 'reward',
        };
      case 'VERIFYING':
        return {
          title: 'X 게시물 확인 중',
          body: '제출한 게시물과 VeInvite 링크를 확인하고 있어요.',
          action: null,
          hint: '확인 중에는 게시물을 삭제하거나 바꾸지 마세요.',
          tone: 'neutral',
        };
      case 'RETENTION':
        return {
          title: 'X 공유가 확인됐어요',
          body: `24시간 후에도 같은 게시물이 공개 상태면 +${PROMO_AMOUNT} B3TR가 자동 지급됩니다.`,
          action: null,
          hint: '17시간 남음',
          tone: 'neutral',
        };
      case 'PAYOUT_PENDING':
        return {
          title: 'X 공유 조건 확인 완료',
          body: `+${PROMO_AMOUNT} B3TR 지급을 준비하고 있어요.`,
          action: null,
          hint: '지급 완료 후 알림으로 알려드려요.',
          tone: 'neutral',
        };
      case 'PAID':
        return {
          title: `+${PROMO_AMOUNT} B3TR 지급 완료`,
          body: 'X Promotion Bonus가 지급되었습니다.',
          action: null,
          hint: null,
          tone: 'reward',
        };
      case 'EXPIRED':
        return {
          title: 'X 공유 보너스 기회 종료',
          body: '공유 기한이 지나 Promotion 몫은 다시 보상 재원으로 돌아갔습니다.',
          action: null,
          hint: null,
          tone: 'muted',
        };
    }
  }, [state]);

  return (
    <section className="xPromotionPreview">
      <header className="previewIntro">
        <div>
          <span>PREVIEW ONLY</span>
          <h2>X Promotion 보상 흐름</h2>
          <p>
            실제 지갑·X API·DB·보상 지급과 연결되지 않는 UI 미리보기입니다.
          </p>
        </div>
        <div className="amountRule">
          <small>예시 총 보상</small>
          <strong>193.91 B3TR</strong>
          <span>183.91 기본 + 최대 10 X</span>
        </div>
      </header>

      <div className="stateGrid">
        {STATES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={state === item.id ? 'selected' : ''}
            onClick={() => setState(item.id)}
          >
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </button>
        ))}
      </div>

      <div className="phonePreview">
        <div className="receiptCard">
          <div className="receiptTop">
            <span>보상 영수증</span>
            <span className="statusPill">
              {state === 'PAID'
                ? 'PAID'
                : state === 'EXPIRED'
                  ? 'CLOSED'
                  : state === 'BASE_PAID' || state === 'OPEN'
                    ? 'AVAILABLE'
                    : 'IN PROGRESS'}
            </span>
          </div>

          <div className="baseReward">
            <small>Referral Reward</small>
            <strong>+{BASE_AMOUNT} B3TR</strong>
            <span>지급 완료</span>
          </div>

          <div className={`promotionLine ${state.toLowerCase()}`}>
            <div>
              <small>X Promotion Bonus</small>
              <strong>+{PROMO_AMOUNT} B3TR</strong>
            </div>
            <span className="promotionState">{copy.title}</span>
          </div>

          {copy.hint ? (
            <p className="receiptHint">{copy.hint}</p>
          ) : null}

          {copy.action ? (
            <button type="button" className="shareAction">
              {copy.action}
            </button>
          ) : null}
        </div>

        <aside className={`rewardToast ${copy.tone}`}>
          <strong>{copy.title}</strong>
          <p>{copy.body}</p>
          {copy.hint ? <small>{copy.hint}</small> : null}
          {copy.action ? (
            <button type="button">{copy.action}</button>
          ) : null}
        </aside>
      </div>

      <div className="rules">
        <strong>이 미리보기에서 확인할 것</strong>
        <span>
          새 메뉴를 만들지 않고 기존 보상 영수증과 하단 팝업 안에서만
          X Promotion이 자연스럽게 이어지는지 확인합니다.
        </span>
        <span>
          X 상태가 바뀌어도 Referral 1건이라는 의미와 기존 보상 영수증은
          그대로 유지됩니다.
        </span>
      </div>

      <style jsx>{`
        .xPromotionPreview{width:min(100%,920px);margin:0 auto;padding:18px;box-sizing:border-box;color:#f7f4eb}
        .previewIntro{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
        .previewIntro>div:first-child{min-width:0}
        .previewIntro span:first-child{color:#f4b728;font-size:.62rem;font-weight:950;letter-spacing:.11em}
        .previewIntro h2{margin:5px 0 0;font-size:clamp(1.55rem,5vw,2.2rem);letter-spacing:-.045em}
        .previewIntro p{max-width:560px;margin:8px 0 0;color:#8f8992;font-size:.72rem;line-height:1.55}
        .amountRule{flex:0 0 auto;min-width:180px;padding:12px 14px;display:grid;gap:3px;border:1px solid rgba(244,183,40,.18);border-radius:16px;background:rgba(244,183,40,.06)}
        .amountRule small,.amountRule span{color:#8c846f;font-size:.58rem}
        .amountRule strong{color:#f6d36e;font-size:.9rem}
        .stateGrid{margin-top:16px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
        .stateGrid button{min-height:72px;padding:9px;display:grid;gap:3px;align-content:center;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.025);color:#9a949d;font:inherit;text-align:left;cursor:pointer}
        .stateGrid button strong{font-size:.68rem}
        .stateGrid button small{color:#68636b;font-size:.56rem;line-height:1.35}
        .stateGrid button.selected{border-color:rgba(244,183,40,.3);background:rgba(244,183,40,.09);color:#f2ca5b}
        .phonePreview{position:relative;margin-top:20px;min-height:520px;padding:28px 18px 150px;box-sizing:border-box;border:1px solid rgba(255,255,255,.07);border-radius:32px;background:radial-gradient(circle at 50% 0,rgba(244,183,40,.1),transparent 31%),#090908;overflow:hidden}
        .receiptCard{width:min(100%,520px);margin:0 auto;padding:18px;box-sizing:border-box;border:1px solid rgba(255,255,255,.07);border-radius:20px;background:rgba(255,255,255,.025)}
        .receiptTop{display:flex;justify-content:space-between;align-items:center;gap:12px;color:#8e8880;font-size:.62rem;font-weight:800}
        .statusPill{padding:5px 8px;border-radius:999px;background:rgba(244,183,40,.08);color:#d9bb61!important;font-size:.52rem!important}
        .baseReward{margin-top:16px;padding:14px;display:grid;gap:4px;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:rgba(255,255,255,.02)}
        .baseReward small,.promotionLine small{color:#767169;font-size:.56rem}
        .baseReward strong,.promotionLine strong{color:#fff0ae;font-size:1rem;font-variant-numeric:tabular-nums}
        .baseReward span{color:#71c59d;font-size:.56rem;font-weight:850}
        .promotionLine{margin-top:9px;padding:14px;display:flex;justify-content:space-between;align-items:center;gap:16px;border:1px solid rgba(244,183,40,.12);border-radius:14px;background:rgba(244,183,40,.04)}
        .promotionLine>div{display:grid;gap:4px}
        .promotionState{max-width:52%;color:#a8a098;font-size:.58rem;line-height:1.4;text-align:right}
        .promotionLine.paid{border-color:rgba(76,220,155,.22);background:rgba(76,220,155,.045)}
        .promotionLine.expired{opacity:.58}
        .receiptHint{margin:10px 0 0;color:#898178;font-size:.6rem;line-height:1.45}
        .shareAction{width:100%;min-height:44px;margin-top:13px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:#f6f5f1;color:#0c0c0b;font:inherit;font-size:.72rem;font-weight:950;cursor:pointer}
        .rewardToast{position:absolute;left:50%;bottom:26px;width:min(calc(100% - 36px),520px);box-sizing:border-box;transform:translateX(-50%);padding:15px 16px;display:grid;gap:6px;border:1px solid rgba(255,205,80,.24);border-radius:17px;background:rgba(27,24,18,.98);box-shadow:0 18px 55px rgba(0,0,0,.46);text-align:center}
        .rewardToast strong{color:#fff4c5;font-size:.82rem}
        .rewardToast p{margin:0;color:#aca59a;font-size:.67rem;line-height:1.45}
        .rewardToast small{color:#8f8679;font-size:.58rem}
        .rewardToast button{min-height:40px;margin-top:4px;border:1px solid rgba(255,255,255,.15);border-radius:11px;background:#f6f5f1;color:#0c0c0b;font:inherit;font-size:.68rem;font-weight:950;cursor:pointer}
        .rewardToast.muted{border-color:rgba(255,255,255,.08);background:rgba(25,25,23,.98)}
        .rules{margin-top:15px;padding:14px;display:grid;gap:6px;border:1px solid rgba(255,255,255,.06);border-radius:15px;background:rgba(255,255,255,.02)}
        .rules strong{font-size:.69rem}
        .rules span{color:#7e7972;font-size:.62rem;line-height:1.45}
        @media(max-width:760px){.previewIntro{display:grid}.amountRule{width:100%;box-sizing:border-box}.stateGrid{grid-template-columns:1fr 1fr}}
      `}</style>
    </section>
  );
}
