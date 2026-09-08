'use client';

import { AppNetwork } from '@/components/AppNetwork';

const PREVIEW_WALLET = '0x1111111111111111111111111111111111111111';

export default function NetworkPreviewPage() {
  return (
    <main className="previewShell">
      <div className="previewNote">
        <strong>Network UI Preview</strong>
        <span>Sample data · no wallet connection required</span>
      </div>

      <AppNetwork
        locale="ko"
        wallet={PREVIEW_WALLET}
        onConnect={() => {}}
        onInvite={() => {}}
        dataEndpoint="/ui-test/network/data"
      />

      <style jsx global>{`
        html, body { margin: 0; min-height: 100%; background: #090907; color: #f7f3e9; }
        body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        button, input, select { font-family: inherit; }
        * { box-sizing: border-box; }

        .previewShell .networkPage {
          width: min(100%, 520px);
          margin: 0 auto;
          padding-bottom: 10px;
          color: #f7f3e9;
        }
        .previewShell .networkHeader { margin: 0 2px 15px; }
        .previewShell .headerTitleRow { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .previewShell .eyebrow { display: block; color: #e8b83f; font-size: 10px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
        .previewShell .networkHeader h1 { margin: 6px 0 0; font-size: clamp(27px, 6vw, 35px); line-height: 1.06; letter-spacing: -.045em; }
        .previewShell .backButton { min-height: 38px; padding: 0 11px; border: 1px solid rgba(255,205,80,.14); border-radius: 12px; background: rgba(255,205,80,.045); color: #d7c89c; font-size: 10px; font-weight: 850; cursor: pointer; }
        .previewShell .breadcrumb { margin-top: 12px; display: flex; align-items: center; gap: 3px; overflow-x: auto; scrollbar-width: none; }
        .previewShell .breadcrumbItem { display: inline-flex; align-items: center; gap: 3px; flex: 0 0 auto; }
        .previewShell .crumbDivider { color: #57534b; }
        .previewShell .crumbButton { padding: 4px 5px; border: 0; background: transparent; color: #77736c; font-size: 10px; font-weight: 800; cursor: pointer; }
        .previewShell .crumbButton[aria-current='page'] { color: #d6cba9; }
        .previewShell .invitedByRow { margin-top: 7px; display: flex; align-items: center; gap: 7px; color: #77736c; font-size: 10px; }
        .previewShell .invitedByRow button { padding: 0; border: 0; background: transparent; color: #aaa391; font-size: inherit; font-weight: 800; cursor: pointer; }

        .previewShell .networkCard {
          border: 1px solid rgba(255,205,80,.12);
          border-radius: 26px;
          background: linear-gradient(150deg, rgba(31,29,23,.98), rgba(14,14,13,.99));
          box-shadow: 0 18px 50px rgba(0,0,0,.22);
        }
        .previewShell .networkSummary { position: relative; overflow: hidden; padding: 20px; }
        .previewShell .networkSummary::before { content: ''; position: absolute; top: -100px; right: -80px; width: 240px; height: 240px; border-radius: 50%; background: rgba(244,183,40,.105); pointer-events: none; }
        .previewShell .summaryTopline { position: relative; z-index: 1; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .previewShell .summaryTopline > div { display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; column-gap: 8px; align-items: end; }
        .previewShell .summaryLabel { grid-column: 1 / -1; color: #918a78; font-size: 10px; font-weight: 800; }
        .previewShell .summaryTopline strong { font-size: 41px; line-height: 1; letter-spacing: -.06em; color: #fff; }
        .previewShell .summaryTopline small { padding-bottom: 3px; color: #8e897d; font-size: 10px; font-weight: 800; }
        .previewShell .roundBadge { padding: 6px 9px; border: 1px solid rgba(255,210,80,.18); border-radius: 999px; background: rgba(255,210,80,.055); color: #efc65e; font-size: 10px; font-weight: 900; }
        .previewShell .metricGrid { position: relative; z-index: 1; margin-top: 18px; display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 7px; }
        .previewShell .metric { min-width: 0; min-height: 66px; padding: 9px 5px; border: 1px solid rgba(255,255,255,.065); border-radius: 15px; background: rgba(255,255,255,.025); color: #eee9de; cursor: pointer; }
        .previewShell .metric strong { display: block; font-size: 17px; letter-spacing: -.035em; }
        .previewShell .metric span { display: block; margin-top: 3px; overflow: hidden; color: #7d796f; font-size: 9px; font-weight: 850; white-space: nowrap; text-overflow: ellipsis; }
        .previewShell .metric.activeMetric { border-color: rgba(244,183,40,.25); background: rgba(244,183,40,.07); }
        .previewShell .metric.activeMetric span { color: #d2ad54; }

        .previewShell .treeStage { position: relative; z-index: 1; min-height: 188px; margin-top: 18px; padding-top: 3px; display: flex; flex-direction: column; align-items: center; }
        .previewShell .rootNode { position: relative; z-index: 3; min-width: 106px; padding: 10px 13px; border: 1px solid rgba(255,214,105,.32); border-radius: 17px; background: linear-gradient(145deg,#292113,#18150e); color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.27); cursor: default; }
        .previewShell .rootHalo { position: absolute; inset: -8px; border: 1px solid rgba(244,183,40,.075); border-radius: 23px; pointer-events: none; }
        .previewShell .nodeAvatar { display: block; font-size: 11px; font-weight: 900; }
        .previewShell .rootNode small { display: block; margin-top: 3px; color: #b99b51; font-size: 9px; font-weight: 800; }
        .previewShell .treeStem { width: 1px; height: 23px; background: linear-gradient(rgba(244,183,40,.42),rgba(244,183,40,.12)); }
        .previewShell .treeChildren { position: relative; width: 100%; display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }
        .previewShell .treeChildren.count1 { grid-template-columns: minmax(0,150px); justify-content: center; }
        .previewShell .treeChildren.count2 { grid-template-columns: repeat(2,minmax(0,150px)); justify-content: center; }
        .previewShell .treeChildren::before { content: ''; position: absolute; top: -1px; left: 16.66%; right: 16.66%; height: 1px; background: linear-gradient(90deg,transparent,rgba(244,183,40,.3) 12%,rgba(244,183,40,.3) 88%,transparent); }
        .previewShell .treeNode { position: relative; min-width: 0; min-height: 62px; padding: 12px 6px 8px; border: 1px solid rgba(255,255,255,.07); border-radius: 15px; background: rgba(7,7,7,.38); color: #dcd7cd; cursor: pointer; }
        .previewShell .treeNode::before { content: ''; position: absolute; top: -10px; left: 50%; width: 1px; height: 10px; background: rgba(244,183,40,.23); }
        .previewShell .treeNodeIcon { position: absolute; top: -8px; left: 50%; width: 18px; height: 18px; display: grid; place-items: center; transform: translateX(-50%); border: 1px solid rgba(255,255,255,.12); border-radius: 50%; background: #191711; color: #9f9a8f; font-size: 10px; font-weight: 900; }
        .previewShell .treeNode.status-qualified .treeNodeIcon, .previewShell .memberAvatar.status-qualified { border-color: rgba(83,212,151,.3); color: #65d7a0; }
        .previewShell .treeNode.status-rewarded .treeNodeIcon, .previewShell .memberAvatar.status-rewarded { border-color: rgba(244,183,40,.35); color: #f3c75c; }
        .previewShell .treeNode strong { display: block; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
        .previewShell .treeNode small { display: block; margin-top: 4px; color: #716d65; font-size: 9px; font-weight: 750; }
        .previewShell .moreNode { margin-top: 9px; padding: 5px 9px; border: 0; border-radius: 999px; background: rgba(255,255,255,.035); color: #817c70; font-size: 9px; font-weight: 850; cursor: pointer; }

        .previewShell .searchCard { margin-top: 13px; padding: 10px; }
        .previewShell .searchField { min-height: 48px; padding: 0 12px; display: flex; align-items: center; gap: 9px; border: 1px solid rgba(255,255,255,.075); border-radius: 16px; background: rgba(4,4,4,.38); color: #6e6a62; }
        .previewShell .searchField input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: #f3efe6; font-size: 12px; font-weight: 750; }
        .previewShell .searchField input::placeholder { color: #5e5b55; }
        .previewShell .clearSearch { width: 25px; height: 25px; border: 0; border-radius: 50%; background: rgba(255,255,255,.05); color: #7f7a71; cursor: pointer; }
        .previewShell .searchHint, .previewShell .noSearchResults { display: block; padding: 8px 6px 2px; color: #747068; font-size: 10px; line-height: 1.45; }
        .previewShell .searchResults { padding: 8px 4px 3px; }
        .previewShell .searchResults > strong { display: block; padding: 1px 4px 5px; color: #aaa493; font-size: 10px; }
        .previewShell .searchResults > button { width: 100%; min-height: 40px; padding: 7px 5px; display: grid; grid-template-columns: minmax(0,1fr) auto auto; align-items: center; gap: 8px; border: 0; border-top: 1px solid rgba(255,255,255,.045); background: transparent; color: #cbc5b7; text-align: left; cursor: pointer; }

        .previewShell .directSection { scroll-margin-top: 16px; margin-top: 24px; }
        .previewShell .sectionHeading { display: flex; align-items: end; justify-content: space-between; gap: 12px; padding: 0 2px 10px; }
        .previewShell .sectionHeading h2 { margin: 4px 0 0; font-size: 20px; letter-spacing: -.035em; }
        .previewShell .sortControl select { max-width: 145px; height: 34px; padding: 0 28px 0 10px; border: 1px solid rgba(255,255,255,.075); border-radius: 11px; background: #151512; color: #a8a294; font-size: 10px; font-weight: 800; }
        .previewShell .filterPill { margin: 0 0 9px; padding: 7px 9px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(244,183,40,.16); border-radius: 999px; background: rgba(244,183,40,.06); color: #d4b055; font-size: 10px; font-weight: 850; cursor: pointer; }
        .previewShell .memberList { display: grid; gap: 10px; }
        .previewShell .memberCard { padding: 15px; }
        .previewShell .memberTopRow { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .previewShell .memberIdentity { min-width: 0; flex: 1; padding: 0; display: flex; align-items: center; gap: 10px; border: 0; background: transparent; color: #eae5da; text-align: left; cursor: pointer; }
        .previewShell .memberAvatar { width: 34px; height: 34px; display: grid; place-items: center; flex: 0 0 auto; border: 1px solid rgba(255,255,255,.09); border-radius: 50%; background: #121211; color: #8d887e; font-size: 12px; font-weight: 900; }
        .previewShell .memberIdentity > span:last-child { min-width: 0; }
        .previewShell .memberIdentity strong { display: block; overflow: hidden; font-size: 12px; text-overflow: ellipsis; }
        .previewShell .memberIdentity small { display: block; margin-top: 3px; font-size: 9px; font-weight: 800; }
        .previewShell .statusText.status-in_progress { color: #827e76; }
        .previewShell .statusText.status-qualified { color: #62c994; }
        .previewShell .statusText.status-rewarded { color: #d4af50; }
        .previewShell .chevronButton { width: 30px; height: 30px; border: 0; border-radius: 50%; background: rgba(255,255,255,.035); color: #777269; font-size: 16px; cursor: pointer; }
        .previewShell .memberMetrics { margin-top: 14px; padding: 11px 0; display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); border-top: 1px solid rgba(255,255,255,.055); border-bottom: 1px solid rgba(255,255,255,.055); }
        .previewShell .memberMetrics span { min-width: 0; padding: 0 6px; border-left: 1px solid rgba(255,255,255,.045); }
        .previewShell .memberMetrics span:first-child { border-left: 0; padding-left: 0; }
        .previewShell .memberMetrics strong { display: block; color: #e6e0d3; font-size: 13px; }
        .previewShell .memberMetrics small { display: block; margin-top: 2px; overflow: hidden; color: #68645e; font-size: 8px; font-weight: 800; white-space: nowrap; text-overflow: ellipsis; }
        .previewShell .memberActions { margin-top: 11px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .previewShell .memberActions button, .previewShell .memberActions a { min-height: 29px; padding: 0; border: 0; background: transparent; color: #a49d8f; font-size: 10px; font-weight: 850; text-decoration: none; cursor: pointer; }
        .previewShell .memberActions span { margin-left: 5px; color: #625e57; }

        .previewShell .networkConnectCard, .previewShell .emptyNetwork, .previewShell .networkError { padding: 34px 24px; text-align: center; }
        .previewShell .primaryButton, .previewShell .secondaryButton { min-height: 38px; padding: 0 15px; border-radius: 12px; font-size: 10px; font-weight: 900; cursor: pointer; }
        .previewShell .primaryButton { margin-top: 18px; border: 1px solid rgba(244,183,40,.25); background: #e3aa26; color: #15120b; }
        .previewShell .secondaryButton { border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.035); color: #aaa397; }
        .previewShell .depthNotice, .previewShell .inlineError { margin-top: 12px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.055); border-radius: 12px; color: #776f65; font-size: 10px; text-align: center; }
        .previewShell .srOnly { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

        @media (max-width: 420px) {
          .previewShell .networkSummary { padding: 17px 14px; border-radius: 22px; }
          .previewShell .metricGrid { gap: 5px; }
          .previewShell .metric { min-height: 61px; padding-inline: 3px; }
          .previewShell .treeChildren { gap: 5px; }
          .previewShell .memberCard { padding: 13px; border-radius: 22px; }
          .previewShell .sectionHeading h2 { font-size: 19px; }
        }
      `}</style>

      <style jsx>{`
        .previewShell {
          min-height: 100vh;
          padding: 18px 14px 54px;
          background: radial-gradient(circle at 50% -10%, rgba(212,158,38,.08), transparent 30%), #090907;
        }
        .previewNote {
          width: min(100%, 520px);
          margin: 0 auto 18px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid rgba(255,205,80,.10);
          border-radius: 14px;
          background: rgba(255,255,255,.025);
          color: #8f8879;
          font-size: 11px;
        }
        .previewNote strong { color: #d4b057; font-size: 11px; }
        @media (max-width: 420px) {
          .previewShell { padding: 14px 10px 42px; }
          .previewNote { align-items: flex-start; flex-direction: column; gap: 3px; }
        }
      `}</style>
    </main>
  );
}
