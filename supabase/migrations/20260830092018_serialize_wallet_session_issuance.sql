create unique index if not exists wallet_auth_sessions_one_unrevoked_per_wallet_idx
on public.wallet_auth_sessions (wallet_address)
where revoked_at is null;

create or replace function public.issue_wallet_session_after_verified_challenge(
  p_challenge_id bigint,
  p_wallet_address text,
  p_used_at timestamptz,
  p_token_hash text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_challenge_id is null or p_challenge_id < 1 then
    raise exception 'invalid challenge id';
  end if;

  if p_wallet_address is null or p_wallet_address !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid wallet address';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid session token hash';
  end if;

  if p_used_at is null or p_expires_at is null or p_expires_at <= p_used_at then
    raise exception 'invalid session time window';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('veinvite_wallet_session_' || p_wallet_address, 0)
  );

  update public.wallet_auth_challenges
  set used_at = p_used_at
  where id = p_challenge_id
    and wallet_address = p_wallet_address
    and used_at is null
    and expires_at > p_used_at;

  if not found then
    return false;
  end if;

  update public.wallet_auth_sessions
  set revoked_at = p_used_at
  where wallet_address = p_wallet_address
    and revoked_at is null;

  insert into public.wallet_auth_sessions (
    wallet_address,
    token_hash,
    expires_at
  ) values (
    p_wallet_address,
    p_token_hash,
    p_expires_at
  );

  return true;
end;
$$;

revoke all on function public.issue_wallet_session_after_verified_challenge(bigint, text, timestamptz, text, timestamptz) from public;
revoke all on function public.issue_wallet_session_after_verified_challenge(bigint, text, timestamptz, text, timestamptz) from anon;
revoke all on function public.issue_wallet_session_after_verified_challenge(bigint, text, timestamptz, text, timestamptz) from authenticated;
grant execute on function public.issue_wallet_session_after_verified_challenge(bigint, text, timestamptz, text, timestamptz) to service_role;
