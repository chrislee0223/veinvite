-- PostgreSQL does not allow CREATE OR REPLACE VIEW to rename existing output
-- columns in place. The future graph redesign intentionally renames the old
-- parent_wallet output to sponsor_wallet and adds placement_parent_wallet.
--
-- No database object depends on this server-only read model. Drop only the view
-- so the following sponsor/placement migration can recreate it with the new,
-- explicit semantics. Canonical invitations/referral ledgers remain untouched.

drop view if exists public.qualified_referral_network_edges;
