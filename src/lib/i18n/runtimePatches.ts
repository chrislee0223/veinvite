// Centralized runtime registration for locale packs and copy patches.
//
// Import order is part of the localization contract:
// 1. register every locale dictionary,
// 2. apply broad shared hardening,
// 3. apply increasingly specific product/policy fixes,
// 4. finish with locale- and navigation-specific polish.
//
// Keep these side-effect imports in this reviewed order.
import '@/lib/i18n/localePacks/registerExpandedLocales';
import '@/lib/i18n/inviteLandingFinalPolish';
import '@/lib/i18n/copyHardening';
import '@/lib/i18n/inviteeMissionCopyPolish';
import '@/lib/i18n/inviteeConversionPolicyPolish';
import '@/lib/i18n/guideCopyFinalHardening';
import '@/lib/i18n/guideNaturalnessPolish';
import '@/lib/i18n/guideVot3PolicyPolish';
import '@/lib/i18n/secondaryPageCopyHardening';
import '@/lib/i18n/referralLinkCopy';
import '@/lib/i18n/referralLinkCopyFinalHardening';
import '@/lib/i18n/guideRewardClaimHardening';
import '@/lib/i18n/greekFinalPolish';
import '@/lib/i18n/networkNavigationCopyPolish';
