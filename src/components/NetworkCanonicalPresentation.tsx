'use client';

import { useEffect } from 'react';

import type { Locale } from '@/lib/i18n/locales';

type NetworkSnapshot = {
  summary?: { direct?: number; network?: number };
  children?: Array<{ wallet: string; direct: number; network: number }>;
};

function shortWallet(wallet: string): string {
  if (wallet.length < 12) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

function readScale(world: HTMLElement | null | undefined): number {
  if (!world) return 1;
  const match = world.style.transform.match(/scale\(([-+0-9.]+)\)/);
  const parsed = match ? Number.parseFloat(match[1]) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 1;
}

export function NetworkCanonicalPresentation({
  wallet,
}: {
  wallet: string;
  locale: Locale;
}) {
  useEffect(() => {
    const page = document.querySelector<HTMLElement>('.networkCanvasPage');
    if (!page) return;

    let disposed = false;
    let frame = 0;
    let snapshot: NetworkSnapshot | null = null;
    let worldObserver: MutationObserver | null = null;

    page.dataset.canonicalNetwork = 'true';

    const applySnapshot = () => {
      const header = page.querySelector<HTMLElement>('.networkHeader');
      if (header) {
        header.dataset.canonicalYou = 'YOU';
        header.dataset.canonicalDirect = String(snapshot?.summary?.direct ?? 0);
        header.dataset.canonicalNetworkSize = String(snapshot?.summary?.network ?? 0);
      }

      const focusMeta = page.querySelector<HTMLElement>('.focusNode .nodeMeta small');
      if (focusMeta && snapshot?.summary) {
        focusMeta.dataset.canonicalMeta = `${snapshot.summary.direct ?? 0} direct · ${snapshot.summary.network ?? 0} network`;
      }

      const childStats = new Map(
        (snapshot?.children ?? []).map((child) => [shortWallet(child.wallet).toLowerCase(), child]),
      );
      page.querySelectorAll<HTMLElement>('.childNode').forEach((node) => {
        const label = node.querySelector<HTMLElement>('.nodeMeta strong')?.textContent?.trim().toLowerCase() ?? '';
        const child = childStats.get(label);
        const meta = node.querySelector<HTMLElement>('.nodeMeta small');
        if (meta && child) meta.dataset.canonicalMeta = `${child.direct} direct · ${child.network} net`;
      });
    };

    const refresh = () => {
      frame = 0;
      const stage = page.querySelector<HTMLElement>('.networkStage');
      const world = page.querySelector<HTMLElement>('.world');
      const crumbs = page.querySelectorAll('.breadcrumbs .crumb').length;
      page.dataset.canonicalDepth = crumbs > 1 ? 'deep' : 'root';
      if (stage) {
        stage.dataset.canonicalZoom = `${Math.round(readScale(world) * 100)}%`;
        stage.dataset.canonicalHint = 'Hold a node to edit · drag canvas · pinch to zoom';
      }
      applySnapshot();
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(refresh);
    };

    const world = page.querySelector<HTMLElement>('.world');
    if (world) {
      worldObserver = new MutationObserver(schedule);
      worldObserver.observe(world, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    const graphObserver = new MutationObserver(schedule);
    graphObserver.observe(page, { childList: true, subtree: true });
    schedule();

    const controller = new AbortController();
    void fetch(`/api/network?wallet=${encodeURIComponent(wallet)}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => (response.ok ? response.json() as Promise<NetworkSnapshot> : null))
      .then((data) => {
        if (!data || disposed) return;
        snapshot = data;
        schedule();
      })
      .catch(() => {
        // Presentation metadata is optional. AppNetwork remains authoritative.
      });

    return () => {
      disposed = true;
      controller.abort();
      graphObserver.disconnect();
      worldObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      delete page.dataset.canonicalNetwork;
      delete page.dataset.canonicalDepth;
    };
  }, [wallet]);

  return (
    <style jsx global>{`
      .networkCanvasPage[data-canonical-network='true']{
        width:min(100%,560px)!important;margin:0 auto!important;overflow:hidden!important;
        border:1px solid rgba(225,177,51,.22)!important;border-radius:22px!important;
        background:#050605!important;box-shadow:0 18px 48px rgba(0,0,0,.28)!important
      }
      .networkCanvasPage[data-canonical-network='true'] .networkHeader{
        min-height:46px!important;padding:11px 14px 8px!important;box-sizing:border-box!important;
        display:flex!important;align-items:baseline!important;justify-content:flex-start!important;gap:15px!important;
        border:0!important;background:#050605!important
      }
      .networkCanvasPage[data-canonical-network='true'] .networkHeader>*{display:none!important}
      .networkCanvasPage[data-canonical-network='true'] .networkHeader:before{
        content:attr(data-canonical-you);flex:none;color:#e3b735;font-size:.67rem;font-weight:950;letter-spacing:.01em
      }
      .networkCanvasPage[data-canonical-network='true'] .networkHeader:after{
        content:'Direct ' attr(data-canonical-direct) '    Network ' attr(data-canonical-network-size) '    All on one canvas';
        min-width:0;color:#706b62;font-size:.55rem;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis
      }
      .networkCanvasPage[data-canonical-network='true'] .networkToolbar{display:none!important}
      .networkCanvasPage[data-canonical-network='true'][data-canonical-depth='deep'] .networkToolbar{
        min-height:32px!important;padding:3px 9px!important;display:flex!important;border:0!important;background:#050605!important
      }
      .networkCanvasPage[data-canonical-network='true'][data-canonical-depth='deep'] .networkToolbar .searchWrap{display:none!important}
      .networkCanvasPage[data-canonical-network='true'] .networkStage{
        position:relative!important;height:clamp(590px,66dvh,790px)!important;overflow:hidden!important;
        border-top:1px solid rgba(226,177,51,.12)!important;touch-action:none!important;
        background:radial-gradient(circle at 50% 46%,rgba(226,177,51,.035),transparent 34%),#020302!important
      }
      .networkCanvasPage[data-canonical-network='true'] .networkStage:before{
        content:attr(data-canonical-zoom);position:absolute;z-index:67;top:10px;left:151px;width:58px;height:32px;
        box-sizing:border-box;display:grid;place-items:center;border:1px solid rgba(226,177,51,.16);border-radius:9px;
        background:rgba(25,23,16,.96);color:#b8953d;font-size:.51rem;font-weight:850;pointer-events:none
      }
      .networkCanvasPage[data-canonical-network='true'] .networkStage:after{
        content:attr(data-canonical-hint);position:absolute;z-index:3;left:50%;bottom:13px;transform:translateX(-50%);
        max-width:calc(100% - 28px);color:#4f4a43;font-size:.48rem;font-weight:600;white-space:nowrap;pointer-events:none
      }

      .networkCanvasPage[data-canonical-network='true'] .layoutControls,
      .networkCanvasPage[data-canonical-network='true'] .viewControls{display:contents!important}
      .networkCanvasPage[data-canonical-network='true'] .layoutControls button,
      .networkCanvasPage[data-canonical-network='true'] .viewControls button{
        position:absolute!important;z-index:68!important;top:10px!important;height:32px!important;min-height:32px!important;min-width:0!important;
        padding:0 7px!important;border:1px solid rgba(226,177,51,.15)!important;border-radius:9px!important;
        background:rgba(10,10,9,.96)!important;color:#817b70!important;font:inherit!important;font-size:.49rem!important;font-weight:800!important;
        box-shadow:0 7px 18px rgba(0,0,0,.18)!important
      }
      .networkCanvasPage[data-canonical-network='true'] .layoutControls .editLayoutButton{left:10px!important;width:98px!important}
      .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(4){left:116px!important;width:31px!important}
      .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(3){left:214px!important;width:31px!important}
      .networkCanvasPage[data-canonical-network='true'] .layoutControls .groupsButton{left:253px!important;width:75px!important;color:#998044!important}
      .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(1){right:65px!important;width:62px!important}
      .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(1):after{content:' YOU';font-size:.46rem;font-weight:850}
      .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(2){right:10px!important;width:48px!important}
      .networkCanvasPage[data-canonical-network='true'][data-layout-editing='true'] .layoutControls{
        position:absolute!important;z-index:70!important;left:8px!important;right:8px!important;top:8px!important;
        display:flex!important;align-items:center!important;gap:5px!important
      }
      .networkCanvasPage[data-canonical-network='true'][data-layout-editing='true'] .layoutControls button{
        position:static!important;width:auto!important;flex:1 1 auto!important
      }
      .networkCanvasPage[data-canonical-network='true'][data-layout-editing='true'] .viewControls,
      .networkCanvasPage[data-canonical-network='true'][data-layout-editing='true'] .networkStage:before{display:none!important}

      .networkCanvasPage[data-canonical-network='true'] .edge{
        fill:none!important;stroke:rgba(164,134,67,.27)!important;stroke-width:1.15!important;vector-effect:non-scaling-stroke!important
      }
      .networkCanvasPage[data-canonical-network='true'] .edge.rewarded{stroke:rgba(210,166,54,.39)!important}
      .networkCanvasPage[data-canonical-network='true'] .continuationEdge{
        fill:none!important;stroke:rgba(174,142,66,.20)!important;stroke-width:1.05!important;stroke-linecap:round!important;vector-effect:non-scaling-stroke!important
      }
      .networkCanvasPage[data-canonical-network='true'] .slotEdge{
        stroke:rgba(219,173,49,.28)!important;stroke-width:1.2!important;stroke-dasharray:none!important;
        animation:canonicalInviteLine 4.8s ease-in-out infinite!important
      }

      .networkCanvasPage[data-canonical-network='true'] .personNode{
        width:106px!important;height:104px!important;min-width:0!important;padding:0!important;display:block!important;overflow:visible!important;
        border:0!important;border-radius:0!important;background:transparent!important;color:#d7d1c7!important;box-shadow:none!important
      }
      .networkCanvasPage[data-canonical-network='true'] .personNode:hover,
      .networkCanvasPage[data-canonical-network='true'] .personNode.selected{border:0!important;background:transparent!important;box-shadow:none!important}
      .networkCanvasPage[data-canonical-network='true'] .personNode .identity{
        position:absolute!important;left:50%!important;top:50%!important;width:70px!important;height:70px!important;
        transform:translate(-50%,-50%)!important;display:grid!important;place-items:center!important
      }
      .networkCanvasPage[data-canonical-network='true'] .personNode .avatarSlot{
        width:68px!important;height:68px!important;display:grid!important;place-items:center!important;
        border:1px solid rgba(215,172,55,.30)!important;border-radius:50%!important;background:rgba(5,6,5,.97)!important;
        box-shadow:0 0 0 1px rgba(215,172,55,.025)!important
      }
      .networkCanvasPage[data-canonical-network='true'] .personNode .neutralAvatar{
        width:15px!important;height:15px!important;border:0!important;border-radius:50%!important;background:#e6b83c!important;
        color:transparent!important;box-shadow:0 0 11px rgba(230,184,60,.14)!important
      }
      .networkCanvasPage[data-canonical-network='true'] .personNode .neutralAvatar svg,
      .networkCanvasPage[data-canonical-network='true'] .personNode .avatarSlot img,
      .networkCanvasPage[data-canonical-network='true'] .personNode .identityLabel{display:none!important}
      .networkCanvasPage[data-canonical-network='true'] .personNode .nodeMeta{
        position:absolute!important;left:50%!important;top:calc(50% + 42px)!important;width:132px!important;transform:translateX(-50%)!important;
        display:grid!important;justify-items:center!important;gap:4px!important;pointer-events:none!important
      }
      .networkCanvasPage[data-canonical-network='true'] .personNode .nodeMeta strong{
        max-width:126px!important;color:#d8d2c8!important;font-size:.62rem!important;font-weight:850!important;white-space:nowrap!important
      }
      .networkCanvasPage[data-canonical-network='true'] .personNode .nodeMeta small{
        color:#625d55!important;font-size:.48rem!important;font-weight:650!important;line-height:1.2!important;white-space:nowrap!important
      }
      .networkCanvasPage[data-canonical-network='true'] .personNode .nodeMeta small[data-canonical-meta]{font-size:0!important}
      .networkCanvasPage[data-canonical-network='true'] .personNode .nodeMeta small[data-canonical-meta]:after{
        content:attr(data-canonical-meta);font-size:.48rem!important
      }
      .networkCanvasPage[data-canonical-network='true'] .focusNode{width:132px!important;height:132px!important}
      .networkCanvasPage[data-canonical-network='true'] .focusNode .identity{width:72px!important;height:72px!important}
      .networkCanvasPage[data-canonical-network='true'] .focusNode .avatarSlot{
        width:68px!important;height:68px!important;border:1.8px solid rgba(229,181,44,.86)!important;
        background:radial-gradient(circle,rgba(224,176,41,.10),rgba(5,6,5,.98) 64%)!important;
        box-shadow:0 0 0 9px rgba(207,162,38,.065),0 0 23px rgba(220,171,40,.09)!important
      }
      .networkCanvasPage[data-canonical-network='true'] .focusNode .neutralAvatar{width:18px!important;height:18px!important}
      .networkCanvasPage[data-canonical-network='true'] .focusNode .nodeMeta{top:calc(50% + 52px)!important}
      .networkCanvasPage[data-canonical-network='true'] .focusNode .nodeMeta strong{
        color:#e5b93b!important;font-size:.68rem!important;letter-spacing:.02em!important
      }

      .networkCanvasPage[data-canonical-network='true'] .slotNode{
        width:74px!important;height:74px!important;min-width:74px!important;padding:0!important;overflow:visible!important;
        border:1.35px dashed rgba(219,172,42,.58)!important;border-radius:50%!important;background:rgba(218,171,42,.015)!important;
        color:#d4a832!important;display:grid!important;place-items:center!important;align-content:center!important;
        animation:canonicalAvailableGlow 4.8s ease-in-out infinite!important
      }
      .networkCanvasPage[data-canonical-network='true'] .slotNode span{font-size:1.15rem!important;font-weight:350!important;line-height:1!important}
      .networkCanvasPage[data-canonical-network='true'] .slotNode small{
        position:absolute!important;left:50%!important;top:calc(100% + 10px)!important;max-width:110px!important;transform:translateX(-50%)!important;
        color:#bdb6aa!important;font-size:.55rem!important;font-weight:850!important;white-space:nowrap!important
      }

      .networkCanvasPage[data-canonical-network='true'] .groupNode{
        border-style:dashed!important;border-color:rgba(221,174,46,.48)!important;background:rgba(10,10,8,.96)!important;
        box-shadow:0 0 22px rgba(219,170,41,.035)!important;transition:border-color 180ms ease,box-shadow 180ms ease,opacity 180ms ease!important
      }
      .networkCanvasPage[data-canonical-network='true'] .groupNode:hover,
      .networkCanvasPage[data-canonical-network='true'] .groupNode.selected{
        border-color:rgba(235,188,60,.75)!important;box-shadow:0 0 24px rgba(226,177,49,.11)!important
      }

      .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .childNode,
      .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .slotNode,
      .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .groupNode{
        animation:canonicalBranchBloom 470ms cubic-bezier(.18,.82,.2,1) both!important
      }
      .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .continuationEdge{
        stroke-dasharray:74!important;stroke-dashoffset:74;
        animation:canonicalContinuationGrow 430ms cubic-bezier(.2,.75,.2,1) 90ms both!important
      }
      .networkCanvasPage[data-canonical-network='true'] .profileCard{
        animation:canonicalProfileIn 180ms cubic-bezier(.2,.8,.2,1) both!important
      }

      @keyframes canonicalInviteLine{
        0%,18%,100%{stroke:rgba(219,173,49,.21);filter:drop-shadow(0 0 0 rgba(235,187,55,0))}
        38%{stroke:rgba(236,187,54,.36);filter:drop-shadow(0 0 2px rgba(235,187,55,.16))}
        58%{stroke:rgba(244,195,62,.58);filter:drop-shadow(0 0 4px rgba(235,187,55,.24))}
        72%{stroke:rgba(221,174,49,.27);filter:drop-shadow(0 0 1px rgba(235,187,55,.06))}
      }
      @keyframes canonicalAvailableGlow{
        0%,52%,100%{border-color:rgba(219,172,42,.54);box-shadow:0 0 0 rgba(226,177,49,0)}
        64%{border-color:rgba(237,190,64,.82);box-shadow:0 0 18px rgba(226,177,49,.11)}
        77%{border-color:rgba(219,172,42,.56);box-shadow:0 0 7px rgba(226,177,49,.035)}
      }
      @keyframes canonicalBranchBloom{from{opacity:0;scale:.84}to{opacity:1;scale:1}}
      @keyframes canonicalContinuationGrow{from{stroke-dashoffset:74;opacity:.08}to{stroke-dashoffset:0;opacity:1}}
      @keyframes canonicalProfileIn{from{opacity:0;scale:.975}to{opacity:1;scale:1}}

      @media(max-width:560px){
        .networkCanvasPage[data-canonical-network='true']{border-radius:20px!important}
        .networkCanvasPage[data-canonical-network='true'] .networkHeader{min-height:43px!important;padding:10px 11px 7px!important;gap:9px!important}
        .networkCanvasPage[data-canonical-network='true'] .networkHeader:before{font-size:.62rem}
        .networkCanvasPage[data-canonical-network='true'] .networkHeader:after{font-size:.49rem}
        .networkCanvasPage[data-canonical-network='true'] .networkStage{height:clamp(610px,64dvh,780px)!important}
        .networkCanvasPage[data-canonical-network='true'] .layoutControls .editLayoutButton{left:7px!important;width:76px!important;padding:0 5px!important}
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(4){left:88px!important;width:30px!important}
        .networkCanvasPage[data-canonical-network='true'] .networkStage:before{left:122px;width:55px;font-size:.46rem}
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(3){left:181px!important;width:30px!important}
        .networkCanvasPage[data-canonical-network='true'] .layoutControls .groupsButton{left:216px!important;width:62px!important;padding:0 4px!important}
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(1){right:51px!important;width:51px!important;padding:0 4px!important}
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(2){right:6px!important;width:40px!important;padding:0 3px!important}
        .networkCanvasPage[data-canonical-network='true'] .layoutControls button,
        .networkCanvasPage[data-canonical-network='true'] .viewControls button{font-size:.44rem!important}
      }
      @media(max-width:390px){
        .networkCanvasPage[data-canonical-network='true'] .layoutControls .editLayoutButton{width:70px!important}
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(4){left:81px!important;width:28px!important}
        .networkCanvasPage[data-canonical-network='true'] .networkStage:before{left:113px;width:52px}
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(3){left:169px!important;width:28px!important}
        .networkCanvasPage[data-canonical-network='true'] .layoutControls .groupsButton{left:201px!important;width:58px!important}
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(1){right:46px!important;width:47px!important}
        .networkCanvasPage[data-canonical-network='true'] .viewControls button:nth-child(2){right:4px!important;width:38px!important}
      }
      @media(prefers-reduced-motion:reduce){
        .networkCanvasPage[data-canonical-network='true'] .slotEdge,
        .networkCanvasPage[data-canonical-network='true'] .slotNode,
        .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .childNode,
        .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .slotNode,
        .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .groupNode,
        .networkCanvasPage[data-canonical-network='true'] .worldContent.nav-forward .continuationEdge,
        .networkCanvasPage[data-canonical-network='true'] .profileCard{animation:none!important}
      }
    `}</style>
  );
}
