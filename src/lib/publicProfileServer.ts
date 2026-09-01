import { supabaseAdmin } from '@/lib/supabaseServer';
import {
  PUBLIC_PROFILE_BUCKET,
  type PublicWalletProfile,
} from '@/lib/publicProfile';

type ProfileRow = {
  wallet_address: string;
  display_name: string | null;
  avatar_path: string | null;
};

function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  const { data } = supabaseAdmin.storage
    .from(PUBLIC_PROFILE_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl || null;
}

export function normalizePublicProfileRow(
  row: ProfileRow,
): PublicWalletProfile {
  return {
    walletAddress: row.wallet_address,
    displayName: row.display_name,
    avatarUrl: avatarUrl(row.avatar_path),
  };
}

export async function readPublicProfiles(
  walletAddresses: string[],
): Promise<Map<string, PublicWalletProfile>> {
  const uniqueWallets = Array.from(
    new Set(walletAddresses.map((wallet) => wallet.toLowerCase())),
  );

  if (uniqueWallets.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from('public_wallet_profiles')
    .select('wallet_address, display_name, avatar_path')
    .in('wallet_address', uniqueWallets);

  if (error) {
    throw new Error(`Public profiles could not be loaded: ${error.message}`);
  }

  return new Map(
    ((data ?? []) as ProfileRow[]).map((row) => {
      const profile = normalizePublicProfileRow(row);
      return [profile.walletAddress, profile] as const;
    }),
  );
}

export async function readPublicProfile(
  walletAddress: string,
): Promise<PublicWalletProfile> {
  const { data, error } = await supabaseAdmin
    .from('public_wallet_profiles')
    .select('wallet_address, display_name, avatar_path')
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (error) {
    throw new Error(`Public profile could not be loaded: ${error.message}`);
  }

  if (!data) {
    return {
      walletAddress,
      displayName: null,
      avatarUrl: null,
    };
  }

  return normalizePublicProfileRow(data as ProfileRow);
}
