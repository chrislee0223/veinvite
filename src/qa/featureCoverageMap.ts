export type QaCoverageLevel = 'direct' | 'legacy';

export type QaSurfaceCoverage = {
  id: string;
  label: string;
  level: QaCoverageLevel;
  watchedPaths: string[];
  scenarioIds: string[];
};

export const QA_SURFACE_COVERAGE: QaSurfaceCoverage[] = [
  {
    id: 'invite-entry',
    label: '초대 진입',
    level: 'direct',
    watchedPaths: [
      'src/components/InviteLandingV2.tsx',
      'src/app/r/',
    ],
    scenarioIds: [
      'invite-landing-ko-mobile',
      'invite-landing-en-desktop',
      'invite-landing-disabled',
      'invite-demo-review',
    ],
  },
  {
    id: 'mission-reward',
    label: '미션·보상',
    level: 'direct',
    watchedPaths: [
      'src/components/UiTestLab.tsx',
      'src/components/Mission',
      'src/components/Reward',
      'src/app/api/progress/',
      'src/app/api/rewards/',
    ],
    scenarioIds: ['mission-reward-preview'],
  },
  {
    id: 'notifications',
    label: '알림',
    level: 'direct',
    watchedPaths: ['src/components/NotificationUiPreview.tsx', 'src/components/Notification'],
    scenarioIds: ['notification-preview'],
  },
  {
    id: 'eligibility',
    label: '자격 확인',
    level: 'direct',
    watchedPaths: ['src/components/InviteRejectionPreview.tsx', 'src/app/api/invitations/'],
    scenarioIds: ['eligibility-preview'],
  },
  {
    id: 'referral-network',
    label: '추천 네트워크',
    level: 'direct',
    watchedPaths: ['src/components/InfiniteReferralCanvasPreview.tsx', 'src/lib/referral'],
    scenarioIds: ['network-preview'],
  },
  {
    id: 'leaderboard',
    label: '리더보드',
    level: 'legacy',
    watchedPaths: ['src/components/PublicLeaderboard.tsx', 'src/app/podium-', 'src/app/api/leaderboard/'],
    scenarioIds: ['existing-preview-hub'],
  },
  {
    id: 'settings',
    label: '설정·약관',
    level: 'legacy',
    watchedPaths: ['src/components/AppSettings.tsx', 'src/components/LegalDocumentSheet.tsx'],
    scenarioIds: ['existing-preview-hub'],
  },
];

export function validateQaSurfaceCoverage(knownScenarioIds: Set<string>): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const surface of QA_SURFACE_COVERAGE) {
    if (seen.has(surface.id)) errors.push(`duplicate QA surface id: ${surface.id}`);
    seen.add(surface.id);
    if (!surface.watchedPaths.length) errors.push(`missing watched paths: ${surface.id}`);
    if (!surface.scenarioIds.length) errors.push(`missing scenarios: ${surface.id}`);
    for (const scenarioId of surface.scenarioIds) {
      if (!knownScenarioIds.has(scenarioId)) {
        errors.push(`unknown scenario ${scenarioId} in surface ${surface.id}`);
      }
    }
  }

  return errors;
}
