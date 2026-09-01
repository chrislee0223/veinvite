import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import {
  enforceRateLimits,
  getClientIpSubject,
} from '@/lib/rateLimitServer';
import {
  detectPublicAvatarType,
  normalizePublicDisplayName,
  PUBLIC_PROFILE_BUCKET,
  PUBLIC_PROFILE_MAX_AVATAR_BYTES,
} from '@/lib/publicProfile';
import { readPublicProfile } from '@/lib/publicProfileServer';
import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  requireWalletSession,
  WalletAuthenticationError,
} from '@/lib/walletAuthServer';

export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function rateLimitProfileRequest(
  request: NextRequest,
  walletAddress: string,
  mutation: boolean,
) {
  const ip = getClientIpSubject(request);
  return enforceRateLimits([
    {
      scope: mutation ? 'public_profile_write_wallet' : 'public_profile_read_wallet',
      subject: walletAddress,
      limit: mutation ? 20 : 120,
      windowSeconds: 60,
    },
    ip
      ? {
          scope: mutation ? 'public_profile_write_ip' : 'public_profile_read_ip',
          subject: ip,
          limit: mutation ? 40 : 180,
          windowSeconds: 60,
        }
      : null,
  ]);
}

function profileError(error: unknown) {
  if (error instanceof WalletAuthenticationError) {
    return noStoreJson({ error: error.message }, error.status);
  }

  console.error('Public profile request failed:', error);
  return noStoreJson(
    { error: 'Your public profile could not be updated. Please try again.' },
    500,
  );
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireWalletSession({ request });
    const limited = await rateLimitProfileRequest(
      request,
      session.walletAddress,
      false,
    );
    if (limited) return limited;

    return noStoreJson(await readPublicProfile(session.walletAddress));
  } catch (error) {
    return profileError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await requireWalletSession({ request });
    const limited = await rateLimitProfileRequest(
      request,
      session.walletAddress,
      true,
    );
    if (limited) return limited;

    const body = (await request.json()) as { displayName?: unknown };
    const displayName = normalizePublicDisplayName(body.displayName);
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('public_wallet_profiles')
      .upsert(
        {
          wallet_address: session.walletAddress,
          display_name: displayName,
          updated_at: now,
        },
        { onConflict: 'wallet_address' },
      );

    if (error) {
      throw new Error(`Public profile name could not be saved: ${error.message}`);
    }

    return noStoreJson(await readPublicProfile(session.walletAddress));
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.message.startsWith('Display name'))
    ) {
      return noStoreJson({ error: 'Please enter a valid profile name.' }, 400);
    }
    return profileError(error);
  }
}

export async function POST(request: NextRequest) {
  let uploadedPath: string | null = null;

  try {
    const session = await requireWalletSession({ request });
    const limited = await rateLimitProfileRequest(
      request,
      session.walletAddress,
      true,
    );
    if (limited) return limited;

    const form = await request.formData();
    const avatar = form.get('avatar');

    if (!(avatar instanceof File)) {
      return noStoreJson({ error: 'Please choose an image.' }, 400);
    }

    if (avatar.size < 1 || avatar.size > PUBLIC_PROFILE_MAX_AVATAR_BYTES) {
      return noStoreJson({ error: 'Profile images must be 2 MB or smaller.' }, 400);
    }

    const bytes = new Uint8Array(await avatar.arrayBuffer());
    const detected = detectPublicAvatarType(bytes);

    if (!detected) {
      return noStoreJson(
        { error: 'Use a PNG, JPEG, or WebP profile image.' },
        400,
      );
    }

    const oldProfileResult = await supabaseAdmin
      .from('public_wallet_profiles')
      .select('avatar_path')
      .eq('wallet_address', session.walletAddress)
      .maybeSingle();

    if (oldProfileResult.error) {
      throw new Error(
        `Existing profile image could not be checked: ${oldProfileResult.error.message}`,
      );
    }

    uploadedPath = `${session.walletAddress}/${Date.now()}-${randomUUID()}.${detected.extension}`;

    const uploadResult = await supabaseAdmin.storage
      .from(PUBLIC_PROFILE_BUCKET)
      .upload(uploadedPath, bytes, {
        contentType: detected.mime,
        cacheControl: '31536000',
        upsert: false,
      });

    if (uploadResult.error) {
      throw new Error(`Profile image upload failed: ${uploadResult.error.message}`);
    }

    const now = new Date().toISOString();
    const saveResult = await supabaseAdmin
      .from('public_wallet_profiles')
      .upsert(
        {
          wallet_address: session.walletAddress,
          avatar_path: uploadedPath,
          updated_at: now,
        },
        { onConflict: 'wallet_address' },
      );

    if (saveResult.error) {
      await supabaseAdmin.storage.from(PUBLIC_PROFILE_BUCKET).remove([uploadedPath]);
      uploadedPath = null;
      throw new Error(`Profile image could not be saved: ${saveResult.error.message}`);
    }

    const oldPath = oldProfileResult.data?.avatar_path;
    if (typeof oldPath === 'string' && oldPath && oldPath !== uploadedPath) {
      const cleanup = await supabaseAdmin.storage
        .from(PUBLIC_PROFILE_BUCKET)
        .remove([oldPath]);
      if (cleanup.error) {
        console.warn('Old profile image cleanup failed:', cleanup.error.message);
      }
    }

    return noStoreJson(await readPublicProfile(session.walletAddress));
  } catch (error) {
    if (uploadedPath) {
      await supabaseAdmin.storage
        .from(PUBLIC_PROFILE_BUCKET)
        .remove([uploadedPath])
        .catch(() => undefined);
    }
    return profileError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await requireWalletSession({ request });
    const limited = await rateLimitProfileRequest(
      request,
      session.walletAddress,
      true,
    );
    if (limited) return limited;

    const current = await supabaseAdmin
      .from('public_wallet_profiles')
      .select('avatar_path')
      .eq('wallet_address', session.walletAddress)
      .maybeSingle();

    if (current.error) {
      throw new Error(`Profile image could not be loaded: ${current.error.message}`);
    }

    if (current.data) {
      const update = await supabaseAdmin
        .from('public_wallet_profiles')
        .update({
          avatar_path: null,
          updated_at: new Date().toISOString(),
        })
        .eq('wallet_address', session.walletAddress);

      if (update.error) {
        throw new Error(`Profile image could not be removed: ${update.error.message}`);
      }

      const oldPath = current.data.avatar_path;
      if (typeof oldPath === 'string' && oldPath) {
        const cleanup = await supabaseAdmin.storage
          .from(PUBLIC_PROFILE_BUCKET)
          .remove([oldPath]);
        if (cleanup.error) {
          console.warn('Removed profile image cleanup failed:', cleanup.error.message);
        }
      }
    }

    return noStoreJson(await readPublicProfile(session.walletAddress));
  } catch (error) {
    return profileError(error);
  }
}
