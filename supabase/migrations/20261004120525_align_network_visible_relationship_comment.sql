comment on function public.read_referral_network_focus_v2(
  text, text, text, bigint, timestamptz, timestamptz
) is
  'Reads the private Network tree from the visible referral edge source. Visible members are limited to rewarded, fully qualified, or authoritative current-progress relationships; incomplete legacy backfills and canary/test child wallets are excluded.';
