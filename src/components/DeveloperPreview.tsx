'use client';

import { useState } from 'react';

import { Brand } from './Brand';
import { HomeClient } from './HomeClient';
import { NotificationUiPreview } from './NotificationUiPreview';

type PreviewView = 'app' | 'notifications';

export function DeveloperPreview() {
  const [view, setView] = useState<PreviewView>('notifications');

  return (
    <main className="devPreviewShell">
      <header className="devHeader">
        <div className="devBrandRow">
          <Brand />
          <span className="devBadge">DEVELOPER PREVIEW</span>
        </div>
        <div className="devCopy">
          <h1>VeInvite 개발자 미리보기</h1>
          <p>
            실제 앱에 반영하기 전에 화면을 확인하는 전용 공간입니다.
            Production에서는 열리지 않고, Preview 배포에서만 사용할 수 있습니다.
          </p>
        </div>
      </header>

      <nav className="devTabs" aria-label="Developer preview sections">
        <button
          type="button"
          className={view === 'app' ? 'active' : ''}
          onClick={() => setView('app')}
        >
          <strong>실제 앱 화면</strong>
          <small>현재 HomeClient를 Preview 환경에서 렌더링</small>
        </button>
        <button
          type="button"
          className={view === 'notifications' ? 'active' : ''}
          onClick={() => setView('notifications')}
        >
          <strong>알림센터</strong>
          <small>과거 이력 · 읽음/안읽음 · 상대시간 · 예외 상태</small>
        </button>
      </nav>

      <section className="devStatusBar" role="status">
        <span className="statusDot" />
        {view === 'app' ? (
          <span>
            <b>Preview 환경:</b> 현재 HomeClient를 보여주되 클릭은 잠겨 있습니다.
            Preview 배포는 Production DB 접근이 코드에서 차단되어 있습니다.
          </span>
        ) : (
          <span>
            <b>테스트 데이터:</b> 알림 디자인만 확인하며 실제 지갑·DB·보상·초대 상태는 변경하지 않습니다.
          </span>
        )}
      </section>

      {view === 'app' ? (
        <section className="livePreviewFrame" aria-label="Current VeInvite app UI">
          <div className="interactionLock" aria-hidden="true" />
          <HomeClient />
        </section>
      ) : (
        <section className="featurePreviewFrame" aria-label="Notification center preview">
          <NotificationUiPreview />
        </section>
      )}

      <footer className="devFooter">
        <strong>SAFE PREVIEW</strong>
        <span>승인 전까지 Production 코드·DB에는 적용하지 않습니다.</span>
      </footer>

      <style jsx global>{`
        .devPreviewShell {
          min-height:100svh;
          box-sizing:border-box;
          padding:18px 16px 64px;
          color:#f8f6ef;
          background:#080807;
        }
        .devHeader,
        .devTabs,
        .devStatusBar,
        .devFooter {
          width:min(100%,760px);
          box-sizing:border-box;
          margin-left:auto;
          margin-right:auto;
        }
        .devHeader {
          padding:4px 0 0;
        }
        .devBrandRow {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:14px;
        }
        .devBadge {
          padding:7px 9px;
          border:1px solid rgba(244,183,40,.22);
          border-radius:999px;
          background:rgba(244,183,40,.08);
          color:#e9c85f;
          font-size:.58rem;
          font-weight:950;
          letter-spacing:.08em;
          white-space:nowrap;
        }
        .devCopy {
          margin-top:20px;
        }
        .devCopy h1 {
          margin:0;
          font-size:clamp(1.7rem,5vw,2.5rem);
          letter-spacing:-.045em;
        }
        .devCopy p {
          max-width:660px;
          margin:8px 0 0;
          color:#969086;
          font-size:.78rem;
          line-height:1.6;
        }
        .devTabs {
          margin-top:18px;
          padding:5px;
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:5px;
          border:1px solid rgba(255,255,255,.07);
          border-radius:18px;
          background:rgba(255,255,255,.025);
        }
        .devTabs button {
          min-height:62px;
          padding:10px 12px;
          display:grid;
          gap:4px;
          align-content:center;
          border:1px solid transparent;
          border-radius:14px;
          background:transparent;
          color:#8f8a81;
          font:inherit;
          text-align:left;
          cursor:pointer;
        }
        .devTabs button strong {
          font-size:.78rem;
        }
        .devTabs button small {
          color:#666159;
          font-size:.61rem;
          line-height:1.35;
        }
        .devTabs button.active {
          border-color:rgba(244,183,40,.26);
          background:rgba(244,183,40,.09);
          color:#f3cf68;
        }
        .devTabs button.active small {
          color:#9f9169;
        }
        .devStatusBar {
          margin-top:12px;
          padding:11px 13px;
          display:flex;
          align-items:flex-start;
          gap:9px;
          border:1px solid rgba(98,214,154,.16);
          border-radius:14px;
          background:rgba(50,153,108,.06);
          color:#99958d;
          font-size:.67rem;
          line-height:1.5;
        }
        .devStatusBar b { color:#c6c2ba; }
        .statusDot {
          flex:0 0 8px;
          width:8px;
          height:8px;
          margin-top:4px;
          border-radius:50%;
          background:#58d39a;
          box-shadow:0 0 12px rgba(88,211,154,.45);
        }
        .livePreviewFrame,
        .featurePreviewFrame {
          position:relative;
          width:min(100%,900px);
          box-sizing:border-box;
          margin:18px auto 0;
        }
        .livePreviewFrame {
          overflow:hidden;
          border:1px solid rgba(255,255,255,.07);
          border-radius:24px;
          background:#080807;
        }
        .livePreviewFrame .interactionLock {
          position:absolute;
          inset:0;
          z-index:9998;
          cursor:not-allowed;
          background:transparent;
        }
        .livePreviewFrame .screen {
          margin:0;
        }
        .featurePreviewFrame .notificationPreview {
          margin-top:0;
        }
        .devFooter {
          margin-top:20px;
          padding-top:14px;
          display:flex;
          justify-content:center;
          gap:8px;
          border-top:1px solid rgba(255,255,255,.05);
          color:#666159;
          font-size:.61rem;
          text-align:center;
        }
        .devFooter strong { color:#8f8a81; }
        @media (max-width:560px) {
          .devPreviewShell { padding:14px 0 48px; }
          .devHeader,
          .devTabs,
          .devStatusBar,
          .devFooter {
            width:calc(100% - 32px);
          }
          .devTabs { grid-template-columns:1fr; }
          .livePreviewFrame,
          .featurePreviewFrame {
            width:100%;
            margin-top:14px;
          }
          .livePreviewFrame { border-left:0; border-right:0; border-radius:0; }
          .devFooter { flex-direction:column; }
        }
      `}</style>
    </main>
  );
}
