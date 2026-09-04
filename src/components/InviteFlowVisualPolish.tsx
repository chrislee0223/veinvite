'use client';

/**
 * Keeps direct-referral screens on the same shell and header scale as Home.
 * The legacy invite clients still own their flow logic; these overrides only
 * normalize the shared visual frame and the enhanced language picker.
 */
export function InviteFlowVisualPolish() {
  return (
    <style jsx global>{`
      .inviteLanding,
      .centeredFlow,
      .appShell {
        width: min(100%, 520px) !important;
      }

      .centeredFlow > .brandCompact img {
        width: 38px !important;
        height: 38px !important;
        min-width: 38px !important;
        min-height: 38px !important;
        max-width: 38px !important;
        max-height: 38px !important;
        flex: 0 0 38px !important;
      }

      .centeredFlow > label,
      .appHeader label {
        box-sizing: border-box !important;
        width: 155px !important;
        max-width: 48% !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
      }

      .centeredFlow > label > span[aria-hidden='true'],
      .appHeader label > span[aria-hidden='true'] {
        display: none !important;
      }

      .centeredFlow select.languageSelect:not(.languageSelectNativeEnhanced),
      .appHeader select.languageSelect:not(.languageSelectNativeEnhanced) {
        width: 155px !important;
        max-width: 100% !important;
        min-height: 48px !important;
        box-sizing: border-box !important;
        padding: 7px 34px 7px 12px !important;
        border: 1px solid rgba(255,255,255,.1) !important;
        border-radius: 13px !important;
        background: #141625 !important;
        color: #fff !important;
        font-size: .76rem !important;
        font-weight: 800 !important;
      }

      /* Mission screen: keep the header intentionally minimal and aligned to
         the same outer edges as the mission panel below it. */
      .appHeader:has(+ .missionPanel) .chip {
        display: none !important;
      }

      /* The small “My Quest” eyebrow duplicates the main mission heading.
         Hiding it here also lets the title reclaim the space cleanly. */
      .missionPanel > .eyebrow {
        display: none !important;
      }

      .missionPanel > .eyebrow + h1 {
        margin: 0 0 14px !important;
      }

      /* Locked missions should read as unavailable without becoming hard to
         read, especially on dim mobile displays. */
      .missionPanel .mission.locked {
        opacity: .62 !important;
      }

      .errorIcon {
        position: relative !important;
        width: 96px !important;
        height: 96px !important;
        font-size: 0 !important;
      }

      .errorIcon::before,
      .errorIcon::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 50%;
        width: 30px;
        height: 3px;
        border-radius: 999px;
        background: #fff;
        transform-origin: center;
      }

      .errorIcon::before {
        transform: translate(-50%, -50%) rotate(45deg);
      }

      .errorIcon::after {
        transform: translate(-50%, -50%) rotate(-45deg);
      }

      @media (max-width: 560px) {
        .centeredFlow > label,
        .appHeader label {
          width: 155px !important;
        }

        .centeredFlow select.languageSelect:not(.languageSelectNativeEnhanced),
        .appHeader select.languageSelect:not(.languageSelectNativeEnhanced) {
          width: 155px !important;
          min-height: 48px !important;
          padding: 7px 34px 7px 12px !important;
          border-radius: 13px !important;
          font-size: .76rem !important;
        }
      }
    `}</style>
  );
}
