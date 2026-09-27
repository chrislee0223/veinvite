// Central runtime entrypoint for all side-effect copy patches.
//
// Order matters: expanded locale dictionaries must exist before shared
// hardening runs, and later product-specific passes intentionally refine
// earlier copy. Keep AppProviders importing this one module instead of
// distributing the ordering contract across the app shell.
import './localePacks/registerExpandedLocales';
import './inviteLandingFinalPolish';
import './copyHardening';
import './inviteeMissionCopyPolish';
import './inviteeConversionPolicyPolish';
import './guideCopyFinalHardening';
import './guideNaturalnessPolish';
import './guideVot3PolicyPolish';
import './secondaryPageCopyHardening';
import './referralLinkCopy';
import './referralLinkCopyFinalHardening';
import './guideRewardClaimHardening';
import './greekFinalPolish';
import './networkNavigationCopyPolish';
