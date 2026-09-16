drop trigger if exists ab_invitations_security_client_gate on public.invitations;
create trigger ab_invitations_security_client_gate
before insert or update of sybil_status, sybil_source, sybil_checked_at, sybil_reason, sybil_risk_level, sybil_risk_score, invitee_wallet, vote_completed_at
on public.invitations
for each row
execute function public.enforce_security_client_identity_gate();
