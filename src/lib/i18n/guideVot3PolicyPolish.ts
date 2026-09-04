import { GUIDE_MISSION_STEP_COPY } from './guideMissionStepCopy';
import { INVITEE_COPY } from './inviteeCopy';
import { SUPPORTED_LOCALES } from './locales';

// Keep the inviter-facing Guide aligned with the same localized mission policy
// shown to invitees. This prevents the retired 1 B3TR minimum from drifting
// back into the Guide while keeping the conversion and vote requirements clear.
for (const locale of SUPPORTED_LOCALES) {
  const guideMission = GUIDE_MISSION_STEP_COPY[locale];
  const inviteeMission = INVITEE_COPY[locale];

  if (!guideMission || !inviteeMission) continue;

  guideMission.description = [
    `${inviteeMission.appMission}.`,
    inviteeMission.conversionMissionDescription,
    inviteeMission.voteMissionDescription,
  ].join(' ');
}
