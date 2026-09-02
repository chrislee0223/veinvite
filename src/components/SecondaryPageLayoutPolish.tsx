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
       * Keep the five-row viewport authoritative here so exactly five ranks are
       * visible before the user scrolls through ranks 1-100 on every viewport.
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

      /*
       * Keep the podium understated: ranks 1-3 use only gold, silver, and bronze
       * numerals. No circle, laurel, badge, image, or pseudo-element decoration.
       * The number stays centered by the same rank column geometry as every row.
       */
      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue {
        width:100% !important;
        height:auto !important;
        justify-self:stretch !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        box-sizing:border-box !important;
        padding:0 !important;
        border:0 !important;
        border-radius:0 !important;
        background:transparent !important;
        box-shadow:none !important;
        font-weight:950 !important;
        line-height:1 !important;
        font-variant-numeric:tabular-nums !important;
      }

      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::before,
      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(-n+3) .rankValue::after {
        content:none !important;
        display:none !important;
      }

      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(1) .rankValue {
        color:#f1bd34 !important;
      }

      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(2) .rankValue {
        color:#c8cbd0 !important;
      }

      .leaderboardPage .rankScroll .rows > .rankRow:nth-child(3) .rankValue {
        color:#c98252 !important;
      }

      .leaderboardPage .walletCell {
        grid-column:2 !important;
        display:flex !important;
        align-items:center !important;
        justify-content:center !important;
        gap:9px !important;
        overflow:hidden !important;
      }

      /*
       * When VeChain Kit resolves an avatar, show that image by itself. No
       * VeInvite-colored layer sits behind it and the image is not enlarged or
       * cropped. The neutral fallback appears only while the avatar host is empty.
       */
      .leaderboardPage .walletAvatar {
        flex:0 0 22px !important;
        width:22px !important;
        height:22px !important;
        display:block !important;
        overflow:hidden !important;
        border:0 !important;
        border-radius:50% !important;
        background:transparent !important;
        box-shadow:none !important;
      }

      .leaderboardPage .walletAvatar:empty {
        border:1px solid rgba(255,205,80,.22) !important;
        background:
          radial-gradient(circle at 50% 35%,#eec04c 0 20%,transparent 22%),
          radial-gradient(ellipse at 50% 82%,#eec04c 0 31%,transparent 33%),
          #242116 !important;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.025) !important;
      }

      .leaderboardPage .walletAvatar img {
        width:100% !important;
        height:100% !important;
        display:block !important;
        object-fit:contain !important;
        object-position:center !important;
        border-radius:inherit !important;
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
       * A ranked connected wallet stays in the normal table geometry and is
       * identified only by a restrained translucent fill. No outline, side rule,
       * shadow, or extra label is added.
       */
      .leaderboardPage .rankRow.current,
      .leaderboardPage .rankRow.current:hover,
      .leaderboardPage .rankRow.current:focus,
      .leaderboardPage .rankRow.current:focus-visible {
        background:linear-gradient(
          90deg,
          rgba(244,183,40,.10) 0%,
          rgba(244,183,40,.055) 52%,
          rgba(244,183,40,.08) 100%
        ) !important;
        border:0 !important;
        outline:0 !important;
        box-shadow:none !important;
        border-radius:10px !important;
      }

      .leaderboardPage .rankRow.current::before,
      .leaderboardPage .rankRow.current::after {
        border:0 !important;
        outline:0 !important;
        box-shadow:none !important;
      }

      .leaderboardPage .rankRow.current .walletText,
      .leaderboardPage .rankRow.current .rankMetric b {
        color:#fff8e7 !important;
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
      }
    `}</style>
  );
}
