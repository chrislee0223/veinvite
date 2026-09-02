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

      /*
       * Leaderboard geometry is proportional to the card width, not to any
       * screenshot or device width. Header and every data row use this exact
       * same 12 / 40 / 20 / 28 split, so each value remains centered directly
       * below its label at every responsive size.
       */
      .leaderboardPage .tableHeader,
      .leaderboardPage .rankRow {
        width:100% !important;
        min-width:0 !important;
        display:grid !important;
        grid-template-columns:12fr 40fr 20fr 28fr !important;
        column-gap:0 !important;
        align-items:center !important;
        box-sizing:border-box !important;
        padding-left:12px !important;
        padding-right:12px !important;
      }

      .leaderboardPage .tableHeader > span,
      .leaderboardPage .rankValue,
      .leaderboardPage .walletCell,
      .leaderboardPage .completedMetric,
      .leaderboardPage .rewardMetric {
        min-width:0 !important;
        justify-self:stretch !important;
        text-align:center !important;
      }

      .leaderboardPage .rankingCard {
        --leaderboard-row-height:50px;
      }

      /*
       * Styled-jsx does not reliably reach rows created inside helper renderers.
       * Keep the five-row viewport and row height authoritative here so exactly
       * five ranks are visible before the user scrolls through ranks 1-100.
       */
      .leaderboardPage .rankScroll {
        width:100% !important;
        height:calc(var(--leaderboard-row-height) * 5) !important;
        max-height:calc(var(--leaderboard-row-height) * 5) !important;
        overflow-y:auto !important;
        overscroll-behavior:contain !important;
        scrollbar-width:thin;
        scrollbar-color:rgba(244,183,40,.45) transparent;
      }

      .leaderboardPage .rankScroll::-webkit-scrollbar {
        width:5px;
      }

      .leaderboardPage .rankScroll::-webkit-scrollbar-track {
        background:transparent;
      }

      .leaderboardPage .rankScroll::-webkit-scrollbar-thumb {
        border-radius:999px;
        background:rgba(244,183,40,.45);
      }

      .leaderboardPage .rankRow,
      .leaderboardPage .rankRow.featured,
      .leaderboardPage .rankRow.compact {
        height:var(--leaderboard-row-height) !important;
        min-height:var(--leaderboard-row-height) !important;
        max-height:var(--leaderboard-row-height) !important;
      }

      .leaderboardPage .rankValue {
        grid-column:1 !important;
      }

      /* Restrained podium treatment: color and a thin halo, no oversized medal UI. */
      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
        width:27px !important;
        height:27px !important;
        justify-self:center !important;
        display:grid !important;
        place-items:center !important;
        border:1px solid currentColor !important;
        border-radius:999px !important;
        font-weight:950 !important;
      }

      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(1) .rankValue {
        color:#f1bd34 !important;
        background:rgba(241,189,52,.08) !important;
        box-shadow:0 0 12px rgba(241,189,52,.08) !important;
      }

      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(2) .rankValue {
        color:#c8cbd0 !important;
        background:rgba(200,203,208,.06) !important;
        box-shadow:0 0 10px rgba(200,203,208,.05) !important;
      }

      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(3) .rankValue {
        color:#c98252 !important;
        background:rgba(201,130,82,.07) !important;
        box-shadow:0 0 10px rgba(201,130,82,.05) !important;
      }

      .leaderboardPage .walletCell {
        grid-column:2 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:9px !important;
        overflow:hidden !important;
      }

      .leaderboardPage .walletAvatar {
        flex:0 0 22px !important;
        width:22px !important;
        height:22px !important;
        display:block !important;
        overflow:hidden !important;
        border:1px solid rgba(255,205,80,.22) !important;
        border-radius:50% !important;
        background:
          radial-gradient(circle at 50% 35%,#eec04c 0 20%,transparent 22%),
          radial-gradient(ellipse at 50% 82%,#eec04c 0 31%,transparent 33%),
          #242116 !important;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.025) !important;
      }

      .leaderboardPage .walletText {
        flex:0 1 auto !important;
        max-width:calc(100% - 31px) !important;
        min-width:0 !important;
        overflow:hidden !important;
        text-overflow:ellipsis !important;
        white-space:nowrap !important;
      }

      .leaderboardPage .completedMetric {
        grid-column:3 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
      }

      .leaderboardPage .rewardMetric {
        grid-column:4 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
      }

      .leaderboardPage .rankMetric b {
        min-width:0 !important;
        white-space:nowrap !important;
      }

      /*
       * Outside-Top-100/unranked wallet stays visually inside the same table.
       * The compact vertical ellipsis communicates skipped ranks without a
       * separate My Rank card or a horizontal divider.
       */
      .leaderboardPage .rankDivider {
        min-height:18px !important;
        margin:0 !important;
        padding:0 !important;
        display:grid !important;
        place-items:center !important;
        border:0 !important;
        color:#777269 !important;
        font-size:1rem !important;
        line-height:1 !important;
        letter-spacing:0 !important;
      }

      .leaderboardPage .rankDivider::before,
      .leaderboardPage .rankDivider::after {
        display:none !important;
      }

      .leaderboardPage .rankRow.trailingCurrent {
        height:var(--leaderboard-row-height) !important;
        min-height:var(--leaderboard-row-height) !important;
        max-height:var(--leaderboard-row-height) !important;
        border-bottom:0 !important;
      }

      .leaderboardPage .rankContextNote {
        margin:2px 0 0 !important;
        padding:0 6px !important;
        font-size:.68rem !important;
        line-height:1.35 !important;
      }

      @media (max-width:420px) {
        .leaderboardPage .rankingCard {
          --leaderboard-row-height:46px;
        }
        .leaderboardPage .tableHeader,
        .leaderboardPage .rankRow {
          padding-left:8px !important;
          padding-right:8px !important;
        }
        .leaderboardPage .walletCell {
          gap:6px !important;
        }
        .leaderboardPage .walletAvatar {
          flex-basis:18px !important;
          width:18px !important;
          height:18px !important;
        }
        .leaderboardPage .walletText {
          max-width:calc(100% - 24px) !important;
        }
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
          width:24px !important;
          height:24px !important;
        }
      }

      @media (max-width:360px) {
        .leaderboardPage .rankingCard {
          --leaderboard-row-height:44px;
        }
        .leaderboardPage .tableHeader,
        .leaderboardPage .rankRow {
          padding-left:6px !important;
          padding-right:6px !important;
        }
        .leaderboardPage .walletCell {
          gap:5px !important;
        }
        .leaderboardPage .walletAvatar {
          flex-basis:16px !important;
          width:16px !important;
          height:16px !important;
        }
        .leaderboardPage .walletText {
          max-width:calc(100% - 21px) !important;
        }
        .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
          width:22px !important;
          height:22px !important;
        }
      }
    `}</style>
  );
}