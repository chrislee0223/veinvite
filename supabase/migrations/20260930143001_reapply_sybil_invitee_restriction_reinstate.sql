begin;

-- Production received an idempotent reapplication of
-- add_sybil_invitee_restriction_reinstate while the rollout was being
-- verified. The schema/data outcome is identical to the original migration.
-- This repository migration is intentionally a no-op so migration history
-- remains one-to-one and auditable across Production and source control.

select 1;

commit;
