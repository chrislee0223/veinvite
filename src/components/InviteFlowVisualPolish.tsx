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

      .centeredFlow label:has(> select.languageSelect),
      .appHeader label:has(> select.languageSelect) {
        box-sizing: border-box !important;
        width: 155px !important;
        max-width: 48% !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
      }

      .centeredFlow select.languageSelect:not(.languageSelectNativeEnhanced),
      .appHeader select.languageSelect:not(.languageSelectNativeEnhanced) {
        width: 155px !important;
        max-width: 100% !important;
        height: 40px !important;
        box-sizing: border-box !important;
        padding: 0 28px 0 11px !important;
        border: 1px solid rgba(255,255,255,.1) !important;
        border-radius: 13px !important;
        background: #141625 !important;
        color: #fff !important;
        font-size: .76rem !important;
        font-weight: 800 !important;
      }

      .headerLanguageChevron {
        width: 8px !important;
        height: 8px !important;
        justify-self: center !important;
        border-right: 1.5px solid currentColor !important;
        border-bottom: 1.5px solid currentColor !important;
        color: #9892a5 !important;
        font-size: 0 !important;
        line-height: 0 !important;
        transform: translateY(-2px) rotate(45deg) !important;
      }

      @media (max-width: 560px) {
        .centeredFlow select.languageSelect:not(.languageSelectNativeEnhanced),
        .appHeader select.languageSelect:not(.languageSelectNativeEnhanced) {
          height: 34px !important;
          border-radius: 11px !important;
          font-size: .68rem !important;
        }
      }
    `}</style>
  );
}
