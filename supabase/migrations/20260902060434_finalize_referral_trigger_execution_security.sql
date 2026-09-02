create or replace function public.sync_referral_relationship_from_invitation()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
    v_entry_class text;
    v_network text;
begin
    if new.invitee_wallet is null
       or new.activated_at is null
       or new.status not in ('UNDER_REVIEW', 'ACTIVATING', 'COMPLETED') then
        return new;
    end if;

    select e.entry_class, e.network
      into v_entry_class, v_network
    from public.eligibility_check_events e
    where (new.eligibility_check_id is not null and e.id = new.eligibility_check_id)
       or (new.eligibility_check_id is null and e.invite_code = new.invite_code)
    order by case when new.eligibility_check_id is not null and e.id = new.eligibility_check_id then 0 else 1 end,
             e.created_at desc,
             e.id desc
    limit 1;

    insert into public.referral_relationships (
        parent_wallet, child_wallet, source_invitation_id, source_invite_code,
        relationship_effective_at, relationship_effective_block, network,
        rule_version, source_kind, slot, entry_class_at_activation,
        invitation_created_at, source_snapshot
    ) values (
        lower(btrim(new.inviter_wallet)), lower(btrim(new.invitee_wallet)),
        new.id, new.invite_code, new.activated_at, new.activation_block,
        coalesce(new.activation_network, v_network), 'v1_single_invite', 'live_v1',
        null, v_entry_class, new.created_at,
        jsonb_build_object(
            'status_at_recording', new.status,
            'invitation_updated_at', new.updated_at,
            'activated_at', new.activated_at,
            'activation_block', new.activation_block,
            'activation_network', new.activation_network,
            'eligibility_check_id', new.eligibility_check_id,
            'resolved_network', coalesce(new.activation_network, v_network),
            'entry_class', v_entry_class
        )
    )
    on conflict (source_invitation_id) do nothing;

    return new;
end;
$$;
revoke all on function public.sync_referral_relationship_from_invitation() from public, anon, authenticated, service_role;
