import { NextRequest, NextResponse } from 'next/server';
import { checkEligibility } from '@/lib/vebetter/eligibility';
import { demoStore, normalizeAddress } from '@/lib/serverStore';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const key = code.toUpperCase();
  const invite = demoStore.invites.get(key);
  if (!invite || invite.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Invite link is invalid or cancelled.' }, { status: 404 });
  }
  if (invite.inviteeAddress) {
    return NextResponse.json({ error: 'This invite link has already been used.' }, { status: 409 });
  }

  const body = (await request.json()) as {
    inviteeAddress?: string;
    demoOutcome?: string;
  };
  if (!body.inviteeAddress) {
    return NextResponse.json({ error: 'inviteeAddress is required' }, { status: 400 });
  }

  const inviteeAddress = normalizeAddress(body.inviteeAddress);
  if (demoStore.inviteeToCode.has(inviteeAddress)) {
    return NextResponse.json(
      { outcome: 'already_referred', message: '이미 다른 추천인에게 연결된 지갑입니다.' },
      { status: 422 },
    );
  }

  const eligibility = await checkEligibility({
    inviterAddress: invite.inviterAddress,
    inviteeAddress,
    requestedDemoOutcome: body.demoOutcome,
  });

  if (eligibility.outcome === 'review') {
    // Reserve the link for the first wallet while the account is reviewed.
    invite.inviteeAddress = inviteeAddress;
    invite.status = 'UNDER_REVIEW';
    invite.updatedAt = new Date().toISOString();
    invite.rewardEligibility = 'PENDING';
    demoStore.invites.set(key, invite);
    demoStore.inviteeToCode.set(inviteeAddress, key);
    return NextResponse.json({ outcome: eligibility.outcome, message: eligibility.message, invite }, { status: 202 });
  }

  if (eligibility.outcome !== 'eligible') {
    return NextResponse.json(eligibility, { status: 422 });
  }

  // The first successful claimant wins. A production database must enforce this atomically.
  invite.inviteeAddress = inviteeAddress;
  invite.status = 'ACTIVATING';
  invite.updatedAt = new Date().toISOString();
  invite.rewardEligibility = 'PENDING';
  demoStore.invites.set(key, invite);
  demoStore.inviteeToCode.set(inviteeAddress, key);

  return NextResponse.json({ outcome: 'eligible', message: eligibility.message, invite });
}
