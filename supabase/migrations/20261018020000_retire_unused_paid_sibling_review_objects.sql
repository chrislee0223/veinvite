-- Retire only the redundant 2026-10-17 paid-sibling operator review workflow.
-- The app route/UI was removed and verified READY in Production first.
-- Preserve Sybil watch, post-payout audit, historical invalidation,
-- all Sybil decisions, reward receipts and already-applied migration history.
-- No CASCADE: any unexpected external dependency must abort atomically.
begin;

do $guard$
begin
  if (select count(*) from public.sybil_v2_paid_sibling_review_decisions) <> 0 then
    raise exception 'PAID_SIBLING_REVIEW_RETIRE_HAS_DECISIONS';
  end if;
end
$guard$;

drop function public.resolve_sybil_v2_paid_sibling_recheck(text,text,uuid,text,text,text) restrict;
drop view public.operator_sybil_v2_paid_sibling_recheck_candidates restrict;
drop table public.sybil_v2_paid_sibling_review_decisions restrict;

commit;
