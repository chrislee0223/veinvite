'use client';

import { useMemo, useState } from 'react';

import {
  InfiniteReferralCanvas,
  type ReferralCanvasNode,
} from '@/components/InfiniteReferralCanvas';

const baseNodes: ReferralCanvasNode[] = [
  { id: 'me', parentId: null, walletLabel: '0x52b4...8917', status: 'ROOT' },
  { id: 'a', parentId: 'me', slot: 1, walletLabel: '0x8e94...9411', status: 'NEW', missionProgress: 4 },
  { id: 'b', parentId: 'me', slot: 2, walletLabel: '0xc12b...e8d7', status: 'RETURNING', missionProgress: 4 },

  { id: 'c', parentId: 'a', slot: 1, walletLabel: '0x3507...1b73', status: 'NEW', missionProgress: 3 },
  { id: 'd', parentId: 'a', slot: 2, walletLabel: '0x6132...82f8', status: 'PENDING', missionProgress: 1 },
  { id: 'e', parentId: 'b', slot: 1, walletLabel: '0xe422...892b', status: 'NEW', missionProgress: 2 },
  { id: 'f', parentId: 'b', slot: 2, walletLabel: '0x4f18...5a21', status: 'NEW', missionProgress: 4 },

  { id: 'g', parentId: 'c', slot: 1, walletLabel: '0x22b1...c440', status: 'NEW', missionProgress: 4 },
  { id: 'h', parentId: 'c', slot: 2, walletLabel: '0xa320...ef73', status: 'RETURNING', missionProgress: 2 },
  { id: 'i', parentId: 'd', slot: 1, walletLabel: '0x819c...2a06', status: 'PENDING', missionProgress: 0 },
  { id: 'd-open-2', parentId: 'd', slot: 2, walletLabel: '', status: 'OPEN' },
  { id: 'e-open-1', parentId: 'e', slot: 1, walletLabel: '', status: 'OPEN' },
  { id: 'j', parentId: 'e', slot: 2, walletLabel: '0x2af0...77de', status: 'NEW', missionProgress: 1 },
  { id: 'k', parentId: 'f', slot: 1, walletLabel: '0xd041...ab92', status: 'NEW', missionProgress: 4 },
  { id: 'l', parentId: 'f', slot: 2, walletLabel: '0x0b87...133f', status: 'NEW', missionProgress: 3 },

  { id: 'g-open-1', parentId: 'g', slot: 1, walletLabel: '', status: 'OPEN' },
  { id: 'm', parentId: 'g', slot: 2, walletLabel: '0x997e...601b', status: 'NEW', missionProgress: 2 },
  { id: 'h-open-1', parentId: 'h', slot: 1, walletLabel: '', status: 'OPEN' },
  { id: 'h-open-2', parentId: 'h', slot: 2, walletLabel: '', status: 'OPEN' },
  { id: 'j-open-1', parentId: 'j', slot: 1, walletLabel: '', status: 'OPEN' },
  { id: 'n', parentId: 'j', slot: 2, walletLabel: '0x1a70...9c42', status: 'PENDING', missionProgress: 0 },
  { id: 'o', parentId: 'k', slot: 1, walletLabel: '0x6ed4...aa83', status: 'NEW', missionProgress: 4 },
  { id: 'k-open-2', parentId: 'k', slot: 2, walletLabel: '', status: 'OPEN' },
  { id: 'l-open-1', parentId: 'l', slot: 1, walletLabel: '', status: 'OPEN' },
  { id: 'p', parentId: 'l', slot: 2, walletLabel: '0xb63a...0d14', status: 'RETURNING', missionProgress: 1 },

  { id: 'o-open-1', parentId: 'o', slot: 1, walletLabel: '', status: 'OPEN' },
  { id: 'q', parentId: 'o', slot: 2, walletLabel: '0x5c19...ba42', status: 'NEW', missionProgress: 2 },
  { id: 'q-open-1', parentId: 'q', slot: 1, walletLabel: '', status: 'OPEN' },
  { id: 'q-open-2', parentId: 'q', slot: 2, walletLabel: '', status: 'OPEN' },
];

export function InfiniteReferralCanvasPreview() {
  const [locale, setLocale] = useState<'ko' | 'en'>('ko');
  const [lastSlot, setLastSlot] = useState<string | null>(null);
  const nodes = useMemo(() => baseNodes, []);
  const ko = locale === 'ko';

  return (
    <section className="infiniteCanvasPreviewSection">
      <header className="infiniteCanvasPreviewHeader">
        <div>
          <span>INFINITE CANVAS · 2-SLOT CONCEPT</span>
          <h2>{ko ? 'VeInvite 초대 네트워크 캔버스' : 'VeInvite Referral Network Canvas'}</h2>
          <p>
            {ko
              ? '다음 업데이트용 사전 제작 화면입니다. 현재 114라운드의 초대 제한과 보상 규칙은 변경하지 않습니다.'
              : 'Prebuilt for a future update. The current Round 114 invite limit and reward rules remain unchanged.'}
          </p>
        </div>
        <div className="infiniteCanvasLocaleToggle" aria-label="Preview language">
          <button
            type="button"
            className={locale === 'ko' ? 'active' : ''}
            onClick={() => setLocale('ko')}
          >
            한국어
          </button>
          <button
            type="button"
            className={locale === 'en' ? 'active' : ''}
            onClick={() => setLocale('en')}
          >
            EN
          </button>
        </div>
      </header>

      <div className="infiniteCanvasPolicyStrip">
        <strong>{ko ? '현재 운영' : 'Live now'}</strong>
        <span>{ko ? '1개 초대 슬롯 유지' : '1 invite slot remains live'}</span>
        <i>→</i>
        <strong>{ko ? '미리 준비' : 'Prepared'}</strong>
        <span>{ko ? '2개 가지 · 무한 확대 캔버스' : '2 branches · infinite zoom canvas'}</span>
      </div>

      <InfiniteReferralCanvas
        nodes={nodes}
        locale={locale}
        onInviteSlotClick={(node) => setLastSlot(node.id)}
      />

      <footer className="infiniteCanvasPreviewFooter">
        <div>
          <strong>{ko ? '설계 원칙' : 'Design rule'}</strong>
          <p>
            {ko
              ? '트리는 여러 세대까지 시각화하지만, 향후 보상을 연결하더라도 직접 초대한 1단계 관계만 보상 대상으로 유지하는 구조를 전제로 합니다.'
              : 'The tree can visualize unlimited generations, while any future reward integration should keep rewards limited to direct, first-level referrals.'}
          </p>
        </div>
        <div>
          <strong>{ko ? '빈 슬롯 동작' : 'Open slot action'}</strong>
          <p>
            {lastSlot
              ? (ko
                ? `미리보기 슬롯 ${lastSlot}을 선택했습니다. 현재는 실제 초대가 생성되지 않습니다.`
                : `Preview slot ${lastSlot} selected. No real invite is created.`)
              : (ko
                ? '점선 + 초대 노드를 누르면 나중에 실제 초대 생성 동작을 연결할 자리입니다.'
                : 'Dashed + Invite nodes are placeholders for the future invite creation action.')}
          </p>
        </div>
      </footer>

      <style>{`
        .infiniteCanvasPreviewSection {
          width:min(calc(100% - 32px),1120px);
          box-sizing:border-box;
          margin:34px auto 0;
          padding:20px;
          border:1px solid rgba(244,183,40,.14);
          border-radius:28px;
          background:linear-gradient(160deg,rgba(30,20,41,.78),rgba(12,9,17,.9));
          color:#f8f4ea;
        }
        .infiniteCanvasPreviewHeader {
          margin-bottom:15px;
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap:18px;
        }
        .infiniteCanvasPreviewHeader span {
          color:#f4b728;
          font-size:.64rem;
          font-weight:950;
          letter-spacing:.1em;
        }
        .infiniteCanvasPreviewHeader h2 {
          margin:6px 0 0;
          font-size:clamp(1.15rem,3vw,1.65rem);
          letter-spacing:-.035em;
        }
        .infiniteCanvasPreviewHeader p {
          max-width:680px;
          margin:8px 0 0;
          color:#99919f;
          font-size:.76rem;
          line-height:1.65;
        }
        .infiniteCanvasLocaleToggle {
          flex:0 0 auto;
          display:flex;
          gap:5px;
          padding:4px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:12px;
          background:rgba(255,255,255,.03);
        }
        .infiniteCanvasLocaleToggle button {
          min-height:32px;
          padding:0 10px;
          border:0;
          border-radius:9px;
          background:transparent;
          color:#817a87;
          font-size:.67rem;
          font-weight:900;
          cursor:pointer;
        }
        .infiniteCanvasLocaleToggle button.active {
          background:rgba(244,183,40,.14);
          color:#f4c85a;
        }
        .infiniteCanvasPolicyStrip {
          margin:0 0 13px;
          padding:10px 12px;
          display:flex;
          align-items:center;
          justify-content:center;
          gap:8px;
          flex-wrap:wrap;
          border:1px solid rgba(255,255,255,.055);
          border-radius:14px;
          background:rgba(0,0,0,.18);
          color:#8f8795;
          font-size:.68rem;
        }
        .infiniteCanvasPolicyStrip strong {
          color:#d8d1dc;
          font-size:.65rem;
        }
        .infiniteCanvasPolicyStrip i {
          color:#f4b728;
          font-style:normal;
        }
        .infiniteCanvasPreviewFooter {
          margin-top:13px;
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:10px;
        }
        .infiniteCanvasPreviewFooter > div {
          padding:13px 14px;
          border:1px solid rgba(255,255,255,.055);
          border-radius:15px;
          background:rgba(255,255,255,.025);
        }
        .infiniteCanvasPreviewFooter strong {
          color:#d8d1dc;
          font-size:.68rem;
        }
        .infiniteCanvasPreviewFooter p {
          margin:5px 0 0;
          color:#8f8795;
          font-size:.68rem;
          line-height:1.55;
        }
        @media (max-width:700px) {
          .infiniteCanvasPreviewSection {
            width:min(calc(100% - 20px),1120px);
            padding:12px;
            border-radius:22px;
          }
          .infiniteCanvasPreviewHeader {
            align-items:flex-start;
            flex-direction:column;
          }
          .infiniteCanvasLocaleToggle { align-self:flex-end; }
          .infiniteCanvasPreviewFooter { grid-template-columns:1fr; }
        }
      `}</style>
    </section>
  );
}
