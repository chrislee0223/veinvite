import { NextRequest, NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function authResponse(error: unknown): NextResponse | null {
  if (!(error instanceof WalletAuthenticationError)) return null;
  return noStoreJson({ error: error.message }, error.status);
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireWalletSession({ request });
    const walletAddress = session.walletAddress.toLowerCase();
    const { data, error } = await supabaseAdmin
      .from('network_public_profiles')
      .select('public_enabled, discoverable, updated_at')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (error) throw error;

    return noStoreJson({
      walletAddress,
      publicEnabled: data?.public_enabled === true,
      discoverable: data?.discoverable === true,
      updatedAt: data?.updated_at ?? null,
    });
  } catch (error) {
    const response = authResponse(error);
    if (response) return response;
    console.error('Failed to read Public Network visibility:', error);
    return noStoreJson(
      { code: 'PUBLIC_VISIBILITY_READ_FAILED', error: 'Public Network visibility could not be checked.' },
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return noStoreJson({ code: 'INVALID_ORIGIN', error: 'Invalid request origin.' }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ code: 'INVALID_BODY', error: 'Invalid JSON body.' }, 400);
  }

  if (typeof body !== 'object' || body === null) {
    return noStoreJson({ code: 'INVALID_BODY', error: 'Invalid request body.' }, 400);
  }

  const publicEnabled = 'publicEnabled' in body ? body.publicEnabled : null;
  const requestedDiscoverable = 'discoverable' in body ? body.discoverable : null;
  if (typeof publicEnabled !== 'boolean' || typeof requestedDiscoverable !== 'boolean') {
    return noStoreJson(
      { code: 'INVALID_VISIBILITY', error: 'publicEnabled and discoverable must be boolean.' },
      400,
    );
  }

  const discoverable = publicEnabled ? requestedDiscoverable : false;

  try {
    const session = await requireWalletSession({ request });
    const walletAddress = session.walletAddress.toLowerCase();
    const updatedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('network_public_profiles')
      .upsert(
        {
          wallet_address: walletAddress,
          public_enabled: publicEnabled,
          discoverable,
          updated_at: updatedAt,
        },
        { onConflict: 'wallet_address' },
      );

    if (error) throw error;

    return noStoreJson({
      walletAddress,
      publicEnabled,
      discoverable,
      updatedAt,
    });
  } catch (error) {
    const response = authResponse(error);
    if (response) return response;
    console.error('Failed to save Public Network visibility:', error);
    return noStoreJson(
      { code: 'PUBLIC_VISIBILITY_SAVE_FAILED', error: 'Public Network visibility could not be saved.' },
      500,
    );
  }
}
