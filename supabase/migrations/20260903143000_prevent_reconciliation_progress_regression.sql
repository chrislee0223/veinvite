-- Prevent an older overlapping chain-reconciliation request from rolling a
-- modern accepted invitation backwards after a newer request has already saved
-- more progress. This matters when the invitee has multiple tabs/devices open
-- or the daily reconciliation worker overlaps a foreground refresh.
--
-- Raw impact evidence remains the authoritative reward source. This guard only
-- makes the derived invitation checkpoint monotonic for modern invitations
-- that already have an immutable eligibility proof.

begin;

create or replace function public.prevent_invitation_reconciliation_progress_regression()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Legacy/proofless rows remain outside this protection because they can still
  -- require explicit operator correction. Modern accepted invitations have an
  -- immutable eligibility_check_id and their post-activation chain evidence is
  -- append-only, so derived progress must never move backwards.
  if old.eligibility_check_id is null then
    return new;
  end if;

  -- A stale activity scan can finish after a newer scan and otherwise write
  -- apps_completed=1/2 over an already verified value of 3. Preserve both the
  -- count and its third-app checkpoint when the incoming snapshot is older.
  if coalesce(new.apps_completed, 0) < coalesce(old.apps_completed, 0) then
    new.apps_completed := old.apps_completed;
    new.apps_completed_at := old.apps_completed_at;
    new.apps_completed_block := old.apps_completed_block;
  end if;

  if coalesce(new.rewards_received, 0) < coalesce(old.rewards_received, 0) then
    new.rewards_received := old.rewards_received;
  end if;

  -- Once the third-app checkpoint exists, a same-count refresh must not erase
  -- its provenance because another node response omitted metadata transiently.
  if coalesce(old.apps_completed, 0) >= 3
     and coalesce(new.apps_completed, 0) >= 3 then
    if new.apps_completed_at is null then
      new.apps_completed_at := old.apps_completed_at;
    end if;
    if new.apps_completed_block is null then
      new.apps_completed_block := old.apps_completed_block;
    end if;
  end if;

  -- The reconciliation watermark represents the newest fully scanned chain
  -- height. If an older overlapping scan finishes later, keep the newer block
  -- and its timestamp/completion marker instead of advertising a regression.
  if old.impact_last_synced_block is not null
     and new.impact_last_synced_block is not null
     and new.impact_last_synced_block < old.impact_last_synced_block then
    new.impact_last_synced_block := old.impact_last_synced_block;
    new.impact_last_synced_at := old.impact_last_synced_at;
    new.impact_sync_complete_at := old.impact_sync_complete_at;
  end if;

  -- A completed evidence reconciliation is based on immutable raw mission
  -- events. A later incomplete/stale scan may request NULL, but must not erase
  -- the already verified completion checkpoint.
  if old.impact_sync_complete_at is not null
     and new.impact_sync_complete_at is null then
    new.impact_sync_complete_at := old.impact_sync_complete_at;
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_invitation_reconciliation_progress_regression()
  from public, anon, authenticated;

-- Trigger names execute alphabetically for the same timing/event in PostgreSQL.
-- `prevent_...` runs before `sync_invitation_reward_eligibility`, so reward
-- eligibility sees the protected monotonic checkpoint rather than a stale
-- lower app count.
drop trigger if exists prevent_invitation_reconciliation_progress_regression
  on public.invitations;

create trigger prevent_invitation_reconciliation_progress_regression
before update of
  apps_completed,
  rewards_received,
  apps_completed_at,
  apps_completed_block,
  impact_last_synced_block,
  impact_last_synced_at,
  impact_sync_complete_at
on public.invitations
for each row
execute function public.prevent_invitation_reconciliation_progress_regression();

commit;
