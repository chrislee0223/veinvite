begin;

-- Runtime code only needs row-level CRUD on these short-lived security tables.
-- Prevent the service role from changing table structure/constraints or wiping
-- the full table in one operation. Postgres migrations still run as postgres.
revoke truncate, references, trigger
on table public.wallet_auth_challenges,
         public.wallet_auth_sessions,
         public.api_rate_limit_buckets
from service_role;

commit;
