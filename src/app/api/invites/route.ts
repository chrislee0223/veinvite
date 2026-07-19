import { NextRequest, NextResponse } from 'next/server';
import { createCode, demoStore, isActiveStatus, normalizeAddress } from '@/lib/serverStore';
import type { InviteRecord } from '@/lib/types';

export async function GET(request: NextRequest) {
  const inviterAddress = request.nextUrl.searchParams.get('inviter');
  if (!inviterAddress) {
    return NextResponse.json({ error: 'inviter query parameter is required' }, { status: 400 });
  }

  const normalized = normalizeAddress(inviterAddress);
  const matches = Array.from(demoStore.invites.values())
    .filter((invite) => normalizeAddress(invite.inviterAddress) === normalized)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return NextResponse.json({ invites: matches });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { inviterAddress?: string };
  if (!body.inviterAddress) {
    return NextResponse.json({ error: 'inviterAddress is required' }, { status: 400 });
  }

  const inviterAddress = normalizeAddress(body.inviterAddress);
  const active = Array.from(demoStore.invites.values()).find(
    (invite) => normalizeAddress(invite.inviterAddress) === inviterAddress && isActiveStatus(invite.status),
  );

  if (active) {
    return NextResponse.json(
      { error: 'Only one active invitation is allowed.', invite: active },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const invite: InviteRecord = {
    code: createCode(),
    inviterAddress,
    status: 'PENDING_ACCEPTANCE',
    createdAt: now,
    updatedAt: now,
    rewardEligibility: 'NONE',
  };
  demoStore.invites.set(invite.code, invite);

  return NextResponse.json({ invite }, { status: 201 });
}
