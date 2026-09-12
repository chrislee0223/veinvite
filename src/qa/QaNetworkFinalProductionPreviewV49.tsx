'use client';

import { useRef } from 'react';

import { QaNetworkRadialPlaygroundV45 } from './QaNetworkRadialPlaygroundV45';

export function QaNetworkFinalProductionPreviewV49() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const openSearch = () => {
    const buttons = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>('.labHeader .headerActions button') ?? [],
    );
    buttons.find((button) => button.textContent?.includes('Search'))?.click();
  };

  return (
    <div ref={rootRef} className="v49ProductionPreview">
      <header className="v49Header">
        <div>
          <h1>Network</h1>
          <p>Explore your invite network</p>
        </div>
        <button type="button" onClick={openSearch} aria-label="Search network">
          <span>⌕</span> Search
        </button>
      </header>

      <QaNetworkRadialPlaygroundV45 />

      <style jsx global>{`
        html,body,#__next{min-height:100%;background:#080807}
        body{margin:0;background:#080807;color:#f8f6ef;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        *{box-sizing:border-box}
        .v49ProductionPreview{min-height:100svh;background:#080807;padding:18px 0 28px}
        .v49Header{width:min(calc(100vw - 20px),960px);margin:0 auto 8px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 2px 10px}
        .v49Header>div{display:grid;gap:3px}.v49Header h1{margin:0;color:#f5f1e8;font-size:1.12rem;line-height:1.15;font-weight:720;letter-spacing:-.025em}.v49Header p{margin:0;color:#777064;font-size:.55rem}
        .v49Header button{height:32px;padding:0 11px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#0e0e0c;color:#b7ad9e;font-size:.5rem;display:flex;align-items:center;gap:5px}.v49Header button:hover,.v49Header button:focus-visible{border-color:rgba(244,183,40,.35);color:#ddb958;outline:none}.v49Header button span{font-size:.72rem;line-height:1}

        .v49ProductionPreview .v37Page{min-height:auto!important;padding:0 0 28px!important;background:#080807!important}
        .v49ProductionPreview .labHeader,
        .v49ProductionPreview .scenarioBar,
        .v49ProductionPreview .rules{display:none!important}
        .v49ProductionPreview .controlBar{padding:2px 2px 9px!important}
        .v49ProductionPreview .networkShell{border-color:rgba(255,255,255,.075)!important;box-shadow:0 18px 50px rgba(0,0,0,.18)}
        .v49ProductionPreview .networkTop{min-height:52px!important;padding:8px 12px!important}
        .v49ProductionPreview .networkTop .identity span:last-child{display:none!important}
        .v49ProductionPreview .stage{height:min(78svh,760px)!important;min-height:540px!important}
        .v49ProductionPreview .hint{opacity:.58}

        /* Groups are personal visual organisation, not referral topology. */
        .v49ProductionPreview .v42GroupEdges{display:none!important}

        /* Keep the empty invite path visually alive from YOU toward Available. */
        .v49ProductionPreview .slotSpoke{
          stroke:rgba(232,188,64,.34)!important;
          stroke-width:1.15!important;
          stroke-dasharray:2 10!important;
          animation:v49SlotFlow 1.75s linear infinite!important;
          filter:drop-shadow(0 0 2px rgba(244,183,40,.22));
        }
        .v49ProductionPreview .slotNode .slotCircle{
          box-shadow:0 0 0 0 rgba(244,183,40,.08),0 0 22px rgba(244,183,40,.04);
        }
        @keyframes v49SlotFlow{to{stroke-dashoffset:-48}}

        @media(max-width:640px){
          .v49ProductionPreview{padding-top:12px}
          .v49Header{padding:3px 1px 8px}.v49Header h1{font-size:1rem}.v49Header p{font-size:.52rem}.v49Header button{height:30px;padding:0 9px}
          .v49ProductionPreview .stage{height:calc(100svh - 160px)!important;min-height:520px!important}
          .v49ProductionPreview .networkTop{align-items:flex-start!important}
        }
        @media(prefers-reduced-motion:reduce){
          .v49ProductionPreview .slotSpoke{animation:none!important}
        }
      `}</style>
    </div>
  );
}
