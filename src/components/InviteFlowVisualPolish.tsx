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

      .centeredFlow > label {
        box-sizing: border-box !important;
        width: 155px !important;
        max-width: 48% !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
      }

      /* The mission screen now uses the exact same outer/header geometry as
         the invite landing screen: 22/18 page padding, a 520px content rail,
         16px header gap, and 26px from header to the first card. */
      .appShell:has(> .appHeader + .missionPanel) {
        width: 100% !important;
        max-width: none !important;
        padding: 22px 18px 42px !important;
      }

      .appShell:has(> .appHeader + .missionPanel) > .appHeader,
      .appShell:has(> .appHeader + .missionPanel) > .missionPanel {
        width: min(100%, 520px) !important;
        margin-left: auto !important;
        margin-right: auto !important;
      }

      .appShell:has(> .appHeader + .missionPanel) > .appHeader {
        gap: 16px !important;
        margin-bottom: 26px !important;
      }

      .appShell:has(> .appHeader + .missionPanel) > .missionPanel {
        margin-top: 0 !important;
      }

      /* Keep the VeInvite brand as one flex item, exactly like the other app
         headers. Only flatten the legacy role-chip/language wrapper so the
         language picker can align to the right content edge. */
      .appHeader:has(+ .missionPanel) > .brand + div {
        display: contents !important;
      }

      .appHeader:has(+ .missionPanel) .chip {
        display: none !important;
      }

      .appHeader label {
        box-sizing: border-box !important;
        width: 155px !important;
        max-width: 48% !important;
        min-width: 0 !important;
        flex: 0 1 155px !important;
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
        min-height: 44px !important;
        box-sizing: border-box !important;
        padding: 5px 34px 5px 12px !important;
        border: 1px solid rgba(255,255,255,.1) !important;
        border-radius: 13px !important;
        background: #141625 !important;
        color: #fff !important;
        font-size: .76rem !important;
        font-weight: 800 !important;
      }

      /* Keep the enhanced flag picker on the same 44px vertical rhythm. */
      .headerLanguageTrigger {
        min-height: 44px !important;
        padding-top: 5px !important;
        padding-bottom: 5px !important;
      }

      /* The small quest eyebrow duplicates the primary page heading. */
      .missionPanel > .eyebrow {
        display: none !important;
      }

      .missionPanel > h1 {
        margin: 0 0 14px !important;
      }

      /* Locked missions stay clearly unavailable without becoming illegible. */
      .missionPanel .mission.locked {
        opacity: .62 !important;
      }

      .missionPanel .mission > div {
        min-width: 0 !important;
      }

      /* Status badges are real touch targets, not just visual pills. */
      .missionPanel .mission > a,
      .missionPanel .mission > em {
        min-height: 44px !important;
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
        .appShell:has(> .appHeader + .missionPanel) {
          padding: 18px 14px 42px !important;
        }

        .appShell:has(> .appHeader + .missionPanel) > .appHeader {
          gap: 12px !important;
          margin-bottom: 22px !important;
        }

        .centeredFlow > label {
          width: 155px !important;
        }

        .centeredFlow select.languageSelect:not(.languageSelectNativeEnhanced),
        .appHeader select.languageSelect:not(.languageSelectNativeEnhanced) {
          width: 155px !important;
          min-height: 44px !important;
          padding: 5px 34px 5px 12px !important;
          border-radius: 13px !important;
          font-size: .76rem !important;
        }
      }

      @media (max-width: 360px) {
        .missionPanel {
          padding: 16px !important;
        }

        .missionPanel .mission {
          gap: 8px !important;
          padding: 12px !important;
        }

        .missionPanel .mission > span {
          width: 34px !important;
          height: 34px !important;
          flex-basis: 34px !important;
        }

        .missionPanel .mission > a,
        .missionPanel .mission > em {
          min-width: 64px !important;
          padding-left: 8px !important;
          padding-right: 8px !important;
        }
      }
    `}</style>
  );
}
