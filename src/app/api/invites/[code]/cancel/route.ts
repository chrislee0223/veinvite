import { NextRequest, NextResponse } from 'next/server';
import { demoStore, normalizeAddress } from '@/lib/serverStore';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const key = code.toUpperCase();
  const invite = demoStore.invites.get(key);
  if (!invite) {
    return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  }

  const body = (await request.json()) as { inviterAddress?: string };
  if (!body.inviterAddress || normalizeAddress(body.inviterAddress) !== normalizeAddress(invite.inviterAddress)) {
    return NextResponse.json({ error: 'Not authorized to cancel this invite.' }, { status: 403 });
  }

  invite.status = 'CANCELLED';
  invite.rewardEligibility = 'FORFEITED';
  invite.updatedAt = new Date().toISOString();
  demoStore.invites.set(key, invite);
  // Keep the invitee-to-code record after acceptance so the wallet cannot be referred again.

  return NextResponse.json({ invite });
}
