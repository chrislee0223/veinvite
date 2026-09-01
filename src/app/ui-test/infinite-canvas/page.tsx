import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { InfiniteReferralCanvasPreview } from '@/components/InfiniteReferralCanvasPreview';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'VeInvite Infinite Canvas Preview',
  robots: {
    index: false,
    follow: false,
  },
};

export default function InfiniteCanvasUiTestPage() {
  const allowed =
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  if (!allowed) {
    notFound();
  }

  return (
    <main className="infiniteCanvasTestPage">
      <div className="infiniteCanvasTestTopbar">
        <div>
          <span>VEINVITE UI TEST</span>
          <strong>Infinite Referral Canvas</strong>
        </div>
        <Link href="/ui-test">전체 UI 테스트로 돌아가기</Link>
      </div>

      <section className="infiniteCanvasTestIntro">
        <span>FUTURE ROUND PREVIEW</span>
        <h1>2-Slot Infinite Canvas</h1>
        <p>
          실제 운영 데이터와 분리된 UI/UX 미리보기입니다. 화면을 드래그하고,
          마우스 휠이나 모바일 핀치로 확대·축소하면서 초대 네트워크가 어떻게
          퍼지는지 확인할 수 있습니다.
        </p>
        <div>
          <b>현재 운영</b>
          <span>초대 슬롯 1개 · 보상 규칙 변경 없음</span>
          <b>미리보기</b>
          <span>2개 가지 · 무한 세대 시각화</span>
        </div>
      </section>

      <InfiniteReferralCanvasPreview />

      <section className="infiniteCanvasTestChecklist">
        <span>REVIEW POINTS</span>
        <h2>볼 때 체크할 부분</h2>
        <div>
          <article>
            <strong>01</strong>
            <p>2개 가지가 자연스럽게 퍼져 보이는지</p>
          </article>
          <article>
            <strong>02</strong>
            <p>줌아웃했을 때 큰 나무처럼 보이는지</p>
          </article>
          <article>
            <strong>03</strong>
            <p>노드를 눌렀을 때 해당 사용자 중심으로 탐색하기 편한지</p>
          </article>
          <article>
            <strong>04</strong>
            <p>모바일에서 드래그·핀치 줌이 답답하지 않은지</p>
          </article>
        </div>
      </section>

      <style>{`
        .infiniteCanvasTestPage {
          min-height:100vh;
          padding:18px 0 70px;
          background:
            radial-gradient(circle at 50% -10%,rgba(105,68,132,.24),transparent 36%),
            #09070d;
        }
        .infiniteCanvasTestTopbar,
        .infiniteCanvasTestIntro,
        .infiniteCanvasTestChecklist {
          width:min(calc(100% - 32px),1120px);
          box-sizing:border-box;
          margin-left:auto;
          margin-right:auto;
        }
        .infiniteCanvasTestTopbar {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
          padding:8px 4px 16px;
        }
        .infiniteCanvasTestTopbar div {
          display:flex;
          align-items:center;
          gap:10px;
          color:#f5f0e7;
        }
        .infiniteCanvasTestTopbar span {
          color:#f4b728;
          font-size:.62rem;
          font-weight:950;
          letter-spacing:.12em;
        }
        .infiniteCanvasTestTopbar strong {
          font-size:.86rem;
        }
        .infiniteCanvasTestTopbar a {
          min-height:38px;
          padding:0 12px;
          display:inline-flex;
          align-items:center;
          justify-content:center;
          border:1px solid rgba(244,183,40,.17);
          border-radius:12px;
          background:rgba(244,183,40,.07);
          color:#e9cf83;
          font-size:.7rem;
          font-weight:850;
          text-decoration:none;
        }
        .infiniteCanvasTestIntro {
          padding:28px 26px 22px;
          border:1px solid rgba(255,255,255,.07);
          border-radius:26px;
          background:linear-gradient(145deg,rgba(45,26,57,.62),rgba(14,10,20,.88));
          color:#f8f4ea;
        }
        .infiniteCanvasTestIntro > span,
        .infiniteCanvasTestChecklist > span {
          color:#f4b728;
          font-size:.64rem;
          font-weight:950;
          letter-spacing:.11em;
        }
        .infiniteCanvasTestIntro h1 {
          margin:8px 0 0;
          font-size:clamp(1.8rem,5vw,3.4rem);
          line-height:1;
          letter-spacing:-.055em;
        }
        .infiniteCanvasTestIntro p {
          max-width:720px;
          margin:14px 0 0;
          color:#a49aa9;
          font-size:.82rem;
          line-height:1.75;
        }
        .infiniteCanvasTestIntro > div {
          margin-top:20px;
          display:grid;
          grid-template-columns:auto 1fr auto 1fr;
          gap:8px 12px;
          align-items:center;
          padding:12px 14px;
          border:1px solid rgba(255,255,255,.055);
          border-radius:15px;
          background:rgba(0,0,0,.18);
          color:#99909f;
          font-size:.7rem;
        }
        .infiniteCanvasTestIntro b {
          color:#e2dae6;
          font-size:.68rem;
        }
        .infiniteCanvasTestChecklist {
          margin-top:18px;
          padding:22px;
          border:1px solid rgba(255,255,255,.055);
          border-radius:22px;
          background:rgba(255,255,255,.025);
          color:#f7f2e9;
        }
        .infiniteCanvasTestChecklist h2 {
          margin:6px 0 14px;
          font-size:1.05rem;
          letter-spacing:-.03em;
        }
        .infiniteCanvasTestChecklist > div {
          display:grid;
          grid-template-columns:repeat(4,1fr);
          gap:9px;
        }
        .infiniteCanvasTestChecklist article {
          min-height:94px;
          padding:14px;
          border:1px solid rgba(255,255,255,.055);
          border-radius:15px;
          background:rgba(0,0,0,.15);
        }
        .infiniteCanvasTestChecklist article strong {
          color:#f4b728;
          font-size:.66rem;
        }
        .infiniteCanvasTestChecklist article p {
          margin:7px 0 0;
          color:#9a929e;
          font-size:.7rem;
          line-height:1.55;
        }
        @media (max-width:760px) {
          .infiniteCanvasTestPage { padding-top:10px; }
          .infiniteCanvasTestTopbar,
          .infiniteCanvasTestIntro,
          .infiniteCanvasTestChecklist {
            width:min(calc(100% - 20px),1120px);
          }
          .infiniteCanvasTestTopbar {
            align-items:flex-start;
            flex-direction:column;
          }
          .infiniteCanvasTestIntro {
            padding:22px 16px 16px;
            border-radius:21px;
          }
          .infiniteCanvasTestIntro > div {
            grid-template-columns:auto 1fr;
          }
          .infiniteCanvasTestChecklist {
            padding:16px;
          }
          .infiniteCanvasTestChecklist > div {
            grid-template-columns:1fr 1fr;
          }
        }
        @media (max-width:430px) {
          .infiniteCanvasTestChecklist > div {
            grid-template-columns:1fr;
          }
        }
      `}</style>
    </main>
  );
}
