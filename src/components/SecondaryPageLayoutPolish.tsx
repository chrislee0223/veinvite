export function SecondaryPageLayoutPolish() {
  return (
    <style jsx global>{`
      .guidePage,
      .leaderboardPage,
      .settingsPage {
        width:min(100%,520px) !important;
      }

      .guidePage > header,
      .leaderboardPage > header,
      .settingsPage > header {
        display:none !important;
      }

      .guidePage > .steps,
      .leaderboardPage > .impactCard,
      .settingsPage > .settingsCard:first-of-type {
        margin-top:0 !important;
      }

      .guidePage > .eligibilityCard,
      .leaderboardPage > .rankingCard,
      .settingsPage > .settingsCard:not(:first-of-type) {
        margin-top:18px !important;
      }

      .leaderboardPage .rankingTopline {
        display:none !important;
      }

      /* Header and rows share the exact same four-column measurements. */
      .leaderboardPage .rankingCard {
        --rank-column:34px;
        --completed-column:78px;
        --reward-column:98px;
        --leaderboard-gap:9px;
      }

      .leaderboardPage .tableHeader,
      .leaderboardPage .rankRow {
        grid-template-columns:
          var(--rank-column)
          minmax(0,1fr)
          var(--completed-column)
          var(--reward-column) !important;
        column-gap:var(--leaderboard-gap) !important;
        row-gap:0 !important;
        align-items:center !important;
      }

      .leaderboardPage .tableHeader {
        display:grid !important;
        padding:0 12px 10px !important;
        color:#777269 !important;
        font-size:.58rem !important;
        font-weight:900 !important;
        line-height:1.2 !important;
      }

      .leaderboardPage .tableHeader span {
        min-width:0 !important;
        white-space:nowrap !important;
      }

      .leaderboardPage .tableHeader span:nth-child(1),
      .leaderboardPage .tableHeader span:nth-child(2) {
        text-align:left !important;
      }

      .leaderboardPage .tableHeader span:nth-child(3),
      .leaderboardPage .tableHeader span:nth-child(4) {
        text-align:center !important;
      }

      .leaderboardPage .rankRow {
        min-height:52px !important;
        padding:10px 12px !important;
      }

      .leaderboardPage .rankPrimary {
        grid-column:1 / 3 !important;
        min-width:0 !important;
        display:grid !important;
        grid-template-columns:var(--rank-column) minmax(0,1fr) !important;
        column-gap:var(--leaderboard-gap) !important;
        align-items:center !important;
      }

      .leaderboardPage .completedMetric {
        grid-column:3 !important;
      }

      .leaderboardPage .rewardMetric {
        grid-column:4 !important;
      }

      .leaderboardPage .rankValue {
        min-width:0 !important;
        text-align:left !important;
        font-size:.72rem !important;
        line-height:1 !important;
      }

      /* VeWorld's user-selected PFP is not exposed to dApps. Keep a neutral
       * wallet-avatar fallback beside the address until an official profile
       * API becomes available. */
      .leaderboardPage .walletCell {
        position:relative !important;
        min-width:0 !important;
        overflow:hidden !important;
        padding-left:27px !important;
        color:#bcb6aa !important;
        font-size:.7rem !important;
        line-height:22px !important;
        text-overflow:ellipsis !important;
        white-space:nowrap !important;
        text-align:left !important;
      }

      .leaderboardPage .walletCell::before {
        content:'' !important;
        position:absolute !important;
        left:0 !important;
        top:50% !important;
        width:20px !important;
        height:20px !important;
        transform:translateY(-50%) !important;
        border:1px solid rgba(255,205,80,.22) !important;
        border-radius:50% !important;
        background:
          radial-gradient(circle at 50% 35%,#eec04c 0 20%,transparent 22%),
          radial-gradient(ellipse at 50% 82%,#eec04c 0 31%,transparent 33%),
          #242116 !important;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.025) !important;
      }

      .leaderboardPage .rankMetric {
        min-width:0 !important;
        display:block !important;
        text-align:center !important;
      }

      .leaderboardPage .rankMetric small {
        display:none !important;
      }

      .leaderboardPage .rankMetric b {
        display:block !important;
        margin:0 !important;
        color:#e9e5dc !important;
        font-size:.7rem !important;
        font-weight:850 !important;
        line-height:1 !important;
        font-variant-numeric:tabular-nums !important;
        white-space:nowrap !important;
      }

      /* An unranked connected wallet has no completed referral yet. Show an
       * explicit dash instead of a stray zero that can be mistaken for reward. */
      .leaderboardPage .rankRow.trailingCurrent .completedMetric b {
        font-size:0 !important;
      }

      .leaderboardPage .rankRow.trailingCurrent .completedMetric b::after {
        content:'—' !important;
        font-size:.7rem !important;
        line-height:1 !important;
      }

      .leaderboardPage .rewardMetric b {
        white-space:nowrap !important;
      }

      @media (max-width:420px) {
        .leaderboardPage .rankingCard {
          --rank-column:30px;
          --completed-column:64px;
          --reward-column:84px;
          --leaderboard-gap:5px;
        }

        .leaderboardPage .tableHeader {
          padding-left:10px !important;
          padding-right:10px !important;
          font-size:.53rem !important;
        }

        .leaderboardPage .rankRow {
          min-height:50px !important;
          padding-left:10px !important;
          padding-right:10px !important;
        }

        .leaderboardPage .walletCell {
          padding-left:24px !important;
          font-size:.64rem !important;
        }

        .leaderboardPage .walletCell::before {
          width:18px !important;
          height:18px !important;
        }

        .leaderboardPage .rankValue,
        .leaderboardPage .rankMetric b,
        .leaderboardPage .rankRow.trailingCurrent .completedMetric b::after {
          font-size:.65rem !important;
        }
      }

      @media (max-width:360px) {
        .leaderboardPage .rankingCard {
          --rank-column:27px;
          --completed-column:58px;
          --reward-column:78px;
          --leaderboard-gap:4px;
        }

        .leaderboardPage .tableHeader {
          font-size:.49rem !important;
        }

        .leaderboardPage .walletCell {
          padding-left:22px !important;
          font-size:.6rem !important;
        }

        .leaderboardPage .walletCell::before {
          width:16px !important;
          height:16px !important;
        }

        .leaderboardPage .rankValue,
        .leaderboardPage .rankMetric b,
        .leaderboardPage .rankRow.trailingCurrent .completedMetric b::after {
          font-size:.61rem !important;
        }
      }
    `}</style>
  );
}
