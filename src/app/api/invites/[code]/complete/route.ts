import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/serverStore';
import { verifyActivation } from '@/lib/vebetter/missionVerifier';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const key = code.toUpperCase();
  const invite = demoStore.invites.get(key);
  if (!invite || !invite.inviteeAddress) {
    return NextResponse.json({ error: 'Active invite not found.' }, { status: 404 });
  }

  const verification = verifyActivation({
    walletConnected: true,
    distinctVeBetterAppsUsed: 3,
    b3trEarned: true,
    convertedToVot3: true,
    voted: true,
  });

  if (!verification.complete) {
    return NextResponse.json({ error: verification.reason }, { status: 422 });
  }

  invite.status = 'COMPLETED';
  invite.rewardEligibility = 'ELIGIBLE';
  invite.updatedAt = new Date().toISOString();
  demoStore.invites.set(key, invite);

  return NextResponse.json({ invite, verification });
}
