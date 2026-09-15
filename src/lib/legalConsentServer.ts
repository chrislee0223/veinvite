import 'server-only';

import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
} from '@/lib/legalConsent';
import { supabaseAdmin } from '@/lib/supabaseServer';

export type CurrentLegalConsent = {
  accepted_at: string;
  acceptance_source: string;
};

export async function readCurrentLegalConsent(
  walletAddress: string,
): Promise<CurrentLegalConsent | null> {
  const { data, error } = await supabaseAdmin
    .from('wallet_legal_consents')
    .select('accepted_at, acceptance_source')
    .eq('wallet_address', walletAddress.toLowerCase())
    .eq('terms_version', CURRENT_TERMS_VERSION)
    .eq('privacy_version', CURRENT_PRIVACY_VERSION)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Legal consent lookup failed: ${error.message}`,
    );
  }

  if (!data) {
    return null;
  }

  return {
    accepted_at: String(data.accepted_at),
    acceptance_source: String(data.acceptance_source),
  };
}
