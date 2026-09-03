import { NextRequest, NextResponse } from 'next/server';

import { isReferralKey } from '@/lib/referralLinks';
import { supabaseAdmin } from '@/lib/supabaseServer';

type ReferralLinkRow = {
  id: string;
};

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  const { key } = await context.params;
  const normalizedKey = key.trim();

  if (!isReferralKey(normalizedKey)) {
    return NextResponse.json(
      { outcome: 'invalid_link' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const { data: linkData, error: linkError } = await supabaseAdmin
    .from('referral_links')
    .select('id')
    .eq('referral_key', normalizedKey)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (linkError) {
    console.error('Failed to load referral link:', linkError);
    return NextResponse.json(
      { outcome: 'server_error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const link = (linkData as ReferralLinkRow | null) ?? null;
  if (!link) {
    return NextResponse.json(
      { outcome: 'invalid_link' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // A valid permanent link remains open even while both concurrency slots are
  // busy because an already-participating wallet may be revisiting this same
  // link. Capacity is therefore not actionable until the wallet authenticates.
  // Keep this public endpoint to one indexed link lookup; the claim endpoint
  // performs the cheap capacity precheck and the atomic reservation guard.
  return NextResponse.json(
    { outcome: 'available' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
