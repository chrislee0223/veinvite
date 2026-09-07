-- Speed up the daily Security Client retention scan without changing its policy.

create index if not exists security_clients_retention_created_idx
  on public.security_clients(created_at, id);
