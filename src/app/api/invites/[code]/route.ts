import { NextRequest, NextResponse } from 'next/server';
import { demoStore } from '@/lib/serverStore';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const invite = demoStore.invites.get(code.toUpperCase());
  if (!invite || invite.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Invite link is invalid or cancelled.' }, { status: 404 });
  }
  return NextResponse.json({ invite });
}
