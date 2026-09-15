-- Harden vote-allocation analytics as a server-only surface and enrich
-- officially verified dApp identities used by historical VeInvite votes.

revoke all on table public.invite_vote_allocations
  from public, anon, authenticated;
grant select, insert, update, delete on table public.invite_vote_allocations
  to service_role;

-- Preserve any already-verified operator/dApp metadata. Only unresolved rows
-- are upgraded from official VeChain App Hub identities.
insert into public.vebetter_dapp_registry (
  app_id,
  display_name,
  category,
  metadata_source,
  verified_at,
  updated_at
) values
  (
    '0x29acc8863cf2ab7a82d16c62d61ca84b6650cede4c4fd69073148c875349021e',
    'VeInvite',
    'utilities',
    'VEBETTER_OFFICIAL',
    transaction_timestamp(),
    transaction_timestamp()
  ),
  (
    '0x9643ed1637948cc571b23f836ade2bdb104de88e627fa6e8e3ffef1ee5a1739a',
    'GreenCart',
    'sustainability',
    'VEBETTER_OFFICIAL',
    transaction_timestamp(),
    transaction_timestamp()
  ),
  (
    '0x698555a1fc7b34a52900e3df2d68dd380fa3dfae3b3ed65dba0d230cdab17689',
    'ST3PR',
    'sustainability',
    'VEBETTER_OFFICIAL',
    transaction_timestamp(),
    transaction_timestamp()
  ),
  (
    '0x5bb2ef79e3b23a39d13b02cea56780627ce65664e1cb037232a615583f6c4d77',
    'A ZeLoop Spotter',
    'sustainability',
    'VEBETTER_OFFICIAL',
    transaction_timestamp(),
    transaction_timestamp()
  ),
  (
    '0xa4325c8c40e72a4d8b909280bdff79dc6adbb3be659af7ab38c439fe63e5a7b8',
    'Avoco',
    'sustainability',
    'VEBETTER_OFFICIAL',
    transaction_timestamp(),
    transaction_timestamp()
  ),
  (
    '0x48da6c6f7c8746eaed3cf9068f4e56821a0e1fff9e96c0d4de52893ce4c7b47d',
    'Eat Up',
    'sustainability',
    'VEBETTER_OFFICIAL',
    transaction_timestamp(),
    transaction_timestamp()
  )
on conflict (app_id) do update
set
  display_name = excluded.display_name,
  category = excluded.category,
  metadata_source = excluded.metadata_source,
  verified_at = excluded.verified_at,
  updated_at = excluded.updated_at
where public.vebetter_dapp_registry.metadata_source = 'UNRESOLVED';
