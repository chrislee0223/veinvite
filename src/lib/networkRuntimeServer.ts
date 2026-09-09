import { supabaseAdmin } from '@/lib/supabaseServer';

export type NetworkRuntimeMode = 'off' | 'canary' | 'on';
export type NetworkRuntimeSurface = 'my' | 'public';

type RuntimeRow = {
  enabled: boolean;
  my_mode: NetworkRuntimeMode | null;
  public_mode: NetworkRuntimeMode | null;
};

function isRuntimeMode(value: unknown): value is NetworkRuntimeMode {
  return value === 'off' || value === 'canary' || value === 'on';
}

async function isCanaryWallet(walletAddress: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('network_runtime_canary_wallets')
    .select('wallet_address')
    .eq('wallet_address', walletAddress.toLowerCase())
    .maybeSingle();

  if (error) {
    console.error('Failed to read Network canary allowlist:', error);
    return false;
  }

  return Boolean(data?.wallet_address);
}

export async function canUseNetworkSurface(
  surface: NetworkRuntimeSurface,
  walletAddress?: string | null,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('network_runtime_config')
    .select('enabled, my_mode, public_mode')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error('Failed to read Network runtime configuration:', error);
    return false;
  }

  const row = data as RuntimeRow;
  const fallbackMyMode: NetworkRuntimeMode = row.enabled ? 'on' : 'off';
  const mode = surface === 'my'
    ? (isRuntimeMode(row.my_mode) ? row.my_mode : fallbackMyMode)
    : (isRuntimeMode(row.public_mode) ? row.public_mode : 'off');

  if (mode === 'on') return true;
  if (mode === 'off' || !walletAddress) return false;

  return isCanaryWallet(walletAddress);
}
