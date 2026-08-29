begin;

-- Supabase default privileges may grant service_role broader table privileges
-- at creation time. Keep this audit evidence append-only even for application
-- server code: it may read and insert snapshots, but cannot update, delete, or
-- truncate them.
revoke all on table public.sybil_onchain_snapshots
  from service_role;

grant select, insert on table public.sybil_onchain_snapshots
  to service_role;

revoke update, delete, truncate
  on table public.sybil_onchain_snapshots
  from service_role;

commit;
