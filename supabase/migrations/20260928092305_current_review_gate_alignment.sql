-- Managed Production migration marker.
--
-- The live database already contains the current Sybil review authority checks
-- for pre-assignment reward lifecycle transitions. This file preserves the
-- verified managed migration version in repository history.

do $$
begin
  null;
end
$$;
