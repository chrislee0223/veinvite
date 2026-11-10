import { NextRequest, NextResponse } from 'next/server';

import { getVeBetterNetworkConfig } from '@/lib/vebetter/network';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession, WalletAuthenticationError,
} from '@/lib/walletAuthServer';

export const dynamic = 'force-dynamic';
const CODE = /^[A-HJ-NP-Z2-9]{7}$/u;

/**
 * Read-only, wallet-authenticated list of X obligations still reserved/held.
 * UI consumes the existing authoritative X status endpoint for each match.
 * No user can query another wallet's pending bonus, and no payout path changes.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireWalletSession({ request });
    const wallet = session.walletAddress.toLowerCase();
    const { network } = getVeBetterNetworkConfig();
    const result = await supabaseAdmin
      .from('reward_x_promotion_obligations')
      .select('invite_code')
      .eq('network', network)
      .eq('recipient_wallet', wallet)
      .in('financial_state', ['RESERVED', 'HELD'])
      .order('created_at', { ascending: false })
      .limit(64);

    if (result.error) throw new Error('Active X obligations are unavailable.');
    const rows = (result.data ?? []) as Array<{ invite_code: unknown }>;
    const inviteCodes = [
      ...new Set(rows.map(row => row.invite_code).filter(
        (value): value is string => typeof value === 'string' && CODE.test(value),
      )),
    ];
    return NextResponse.json(
      { inviteCodes },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof WalletAuthenticationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    console.error('Unable to read active X reward offers.');
    return NextResponse.json(
      { error: 'Active X reward offers are temporarily unavailable.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
