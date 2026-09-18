do $migration$
declare
  v_def text;
begin
  select pg_get_functiondef('public.get_lifetime_paid_referral_ranking_v2_internal(text,bigint)'::regprocedure)
    into v_def;
  v_def := replace(v_def, $old$
    join public.invitations i
      on i.invite_code = r.invite_code
     and lower(btrim(i.inviter_wallet)) = lower(btrim(r.recipient_wallet))
$old$, E'');
  v_def := replace(v_def, $old$
      and i.sybil_status = 'CLEAR'
      and public.security_identity_reward_gate_passes(
        i.identity_link_status,
        i.identity_link_checked_at,
        i.vote_completed_at,
        i.identity_link_policy_version,
        i.identity_link_evidence
      )
$old$, E'');
  execute v_def;

  select pg_get_functiondef('public.get_operator_public_new_user_growth(text,bigint,integer)'::regprocedure)
    into v_def;
  v_def := replace(v_def,
    $old$(i.sybil_status in ('REVIEW', 'BLOCKED') or not public.security_identity_reward_gate_passes(i.identity_link_status, i.identity_link_checked_at, i.vote_completed_at, i.identity_link_policy_version, i.identity_link_evidence)) as is_flagged$old$,
    $new$i.sybil_status in ('REVIEW', 'BLOCKED') as is_flagged$new$
  );
  v_def := replace(v_def,
    $old$
          and public.security_identity_reward_gate_passes(i.identity_link_status, i.identity_link_checked_at, i.vote_completed_at, i.identity_link_policy_version, i.identity_link_evidence)
$old$,
    E'\n'
  );
  execute v_def;

  select pg_get_functiondef('public.get_public_country_leaderboard(text,bigint,integer)'::regprocedure)
    into v_def;
  v_def := replace(v_def,
    $old$(i.sybil_status in ('REVIEW', 'BLOCKED') or not public.security_identity_reward_gate_passes(i.identity_link_status, i.identity_link_checked_at, i.vote_completed_at, i.identity_link_policy_version, i.identity_link_evidence)) as is_flagged$old$,
    $new$i.sybil_status in ('REVIEW', 'BLOCKED') as is_flagged$new$
  );
  v_def := replace(v_def,
    $old$
          and public.security_identity_reward_gate_passes(i.identity_link_status, i.identity_link_checked_at, i.vote_completed_at, i.identity_link_policy_version, i.identity_link_evidence)
$old$,
    E'\n'
  );
  execute v_def;
end;
$migration$;