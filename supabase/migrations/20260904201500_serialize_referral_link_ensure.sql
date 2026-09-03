-- Serialize permanent referral-link creation per inviter so concurrent Home
-- refreshes remain idempotent without generating unique-constraint errors in
-- PostgreSQL logs. Key collisions are handled as a normal retryable result.

create or replace function public.ensure_active_referral_link(
  p_inviter_wallet text,
  p_referral_key text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_wallet text := lower(btrim(p_inviter_wallet));
  v_key text := btrim(p_referral_key);
  v_existing public.referral_links%rowtype;
  v_inserted public.referral_links%rowtype;
begin
  if v_wallet !~ '^0x[0-9a-f]{40}$' then
    raise exception 'INVALID_INVITER_WALLET';
  end if;

  if v_key !~ '^[A-Za-z0-9_-]{22,64}$' then
    raise exception 'INVALID_REFERRAL_KEY';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'veinvite_referral_link_ensure_' || v_wallet,
      0
    )
  );

  select *
  into v_existing
  from public.referral_links r
  where lower(r.inviter_wallet) = v_wallet
    and r.status = 'ACTIVE'
  order by r.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'created', false,
      'referralKey', v_existing.referral_key,
      'createdAt', v_existing.created_at,
      'reason', 'ACTIVE_EXISTING'
    );
  end if;

  insert into public.referral_links(
    inviter_wallet,
    referral_key,
    status
  ) values (
    v_wallet,
    v_key,
    'ACTIVE'
  )
  on conflict do nothing
  returning * into v_inserted;

  if found then
    return jsonb_build_object(
      'created', true,
      'referralKey', v_inserted.referral_key,
      'createdAt', v_inserted.created_at,
      'reason', 'CREATED'
    );
  end if;

  -- Defensive re-read in case an active row appeared through another trusted
  -- path. The inviter advisory lock makes this unlikely for VeInvite itself,
  -- but returning the durable row is safer than surfacing a false failure.
  select *
  into v_existing
  from public.referral_links r
  where lower(r.inviter_wallet) = v_wallet
    and r.status = 'ACTIVE'
  order by r.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'created', false,
      'referralKey', v_existing.referral_key,
      'createdAt', v_existing.created_at,
      'reason', 'ACTIVE_EXISTING'
    );
  end if;

  return jsonb_build_object(
    'created', false,
    'reason', 'KEY_COLLISION'
  );
end;
$$;

revoke all on function public.ensure_active_referral_link(text, text)
  from public, anon, authenticated;
grant execute on function public.ensure_active_referral_link(text, text)
  to service_role;

comment on function public.ensure_active_referral_link(text, text) is
  'Server-only idempotent permanent referral-link ensure. Serializes by inviter and treats rare key collisions as retryable results instead of PostgreSQL errors.';
