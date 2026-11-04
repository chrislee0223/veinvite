-- Standalone PostgreSQL 17 concurrency QA, NOT a Supabase migration.
\set ON_ERROR_STOP on
CREATE SCHEMA reward_admission_lab;
REVOKE ALL ON SCHEMA reward_admission_lab FROM PUBLIC;
DO $f$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $f$;
CREATE TABLE reward_admission_lab.pool(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 physical_wei numeric(78,0) NOT NULL CHECK(physical_wei>=0),
 external_holds_wei numeric(78,0) NOT NULL CHECK(external_holds_wei>=0),
 held_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK(held_wei>=0),
 unresolved_old_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK(unresolved_old_wei>=0),
 observed_at timestamptz NOT NULL,
 evidence_verified boolean NOT NULL,
 paused boolean NOT NULL DEFAULT true
);
CREATE TABLE reward_admission_lab.cohorts(
 id bigint PRIMARY KEY,
 receipt_id bigint UNIQUE NOT NULL,
 budget_wei numeric(78,0) NOT NULL CHECK(budget_wei>=0),
 committed_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK(committed_wei>=0),
 held_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK(held_wei>=0),
 floor_wei numeric(78,0) NOT NULL CHECK(floor_wei>0),
 receipt_verified boolean NOT NULL DEFAULT false,
 admission_open boolean NOT NULL DEFAULT false
);
CREATE TABLE reward_admission_lab.invites(
 code text PRIMARY KEY, cohort_id bigint NOT NULL REFERENCES reward_admission_lab.cohorts(id),
 receipt_id bigint NOT NULL, verified boolean NOT NULL,
 status text NOT NULL CHECK(status IN ('ACTIVE','CANCELLED','SYBIL_BLOCKED','COMPLETED','PAID'))
);
CREATE TABLE reward_admission_lab.reservations(
 code text PRIMARY KEY REFERENCES reward_admission_lab.invites(code),
 cohort_id bigint NOT NULL REFERENCES reward_admission_lab.cohorts(id),
 amount_wei numeric(78,0) NOT NULL CHECK(amount_wei>0),
 status text NOT NULL CHECK(status IN ('HELD','RELEASED')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION reward_admission_lab.reserve(p_code text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path TO pg_catalog,reward_admission_lab
AS $f$
DECLARE
 p reward_admission_lab.pool%rowtype;
 c reward_admission_lab.cohorts%rowtype;
 i reward_admission_lab.invites%rowtype;
 r reward_admission_lab.reservations%rowtype;
 cohort bigint;
BEGIN
 -- One lock order for all financial operations: global pool -> cohort -> invite.
 SELECT * INTO p FROM reward_admission_lab.pool WHERE id=true FOR UPDATE;
 IF NOT FOUND THEN RETURN 'MISSING_POOL'; END IF;
 SELECT cohort_id INTO cohort FROM reward_admission_lab.invites WHERE code=p_code;
 IF NOT FOUND THEN RETURN 'INVALID_INVITE'; END IF;
 SELECT * INTO c FROM reward_admission_lab.cohorts WHERE id=cohort FOR UPDATE;
 SELECT * INTO i FROM reward_admission_lab.invites WHERE code=p_code FOR UPDATE;
 SELECT * INTO r FROM reward_admission_lab.reservations WHERE code=p_code FOR UPDATE;
 IF FOUND THEN RETURN CASE WHEN r.status='HELD' THEN 'ALREADY_RESERVED' ELSE 'TERMINAL' END; END IF;
 IF NOT i.verified OR i.status<>'ACTIVE' OR i.receipt_id<>c.receipt_id THEN RETURN 'INVALID_INVITE'; END IF;
 IF p.paused OR NOT c.admission_open THEN RETURN 'PAUSED'; END IF;
 IF NOT p.evidence_verified OR NOT c.receipt_verified THEN RETURN 'UNVERIFIED'; END IF;
 IF p.observed_at>clock_timestamp()+interval '1 minute'
     OR clock_timestamp()-p.observed_at>interval '5 minutes' THEN RETURN 'STALE'; END IF;
 IF p.unresolved_old_wei>0 THEN RETURN 'OLDER_LIABILITY'; END IF;
 IF c.committed_wei+c.held_wei>c.budget_wei OR
     p.external_holds_wei+p.held_wei>p.physical_wei THEN RETURN 'INCONSISTENT'; END IF;
 IF c.budget_wei-c.committed_wei-c.held_wei<c.floor_wei OR
     p.physical_wei-p.external_holds_wei-p.held_wei<c.floor_wei THEN RETURN 'INSUFFICIENT'; END IF;
 UPDATE reward_admission_lab.pool SET held_wei=held_wei+c.floor_wei WHERE id=true;
 UPDATE reward_admission_lab.cohorts SET held_wei=held_wei+c.floor_wei WHERE id=c.id;
 INSERT INTO reward_admission_lab.reservations(code,cohort_id,amount_wei,status)
 VALUES(p_code,c.id,c.floor_wei,'HELD');
 RETURN 'RESERVED';
END $f$;
CREATE FUNCTION reward_admission_lab.release_terminal(p_code text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path TO pg_catalog,reward_admission_lab
AS $f$
DECLARE
 c reward_admission_lab.cohorts%rowtype;
 i reward_admission_lab.invites%rowtype;
 r reward_admission_lab.reservations%rowtype;
 cid bigint;
 ph numeric(78,0);
BEGIN
 PERFORM 1 FROM reward_admission_lab.pool WHERE id=true FOR UPDATE;
 SELECT cohort_id INTO cid FROM reward_admission_lab.invites WHERE code=p_code;
 IF NOT FOUND THEN RETURN 'INVALID_INVITE'; END IF;
 SELECT * INTO c FROM reward_admission_lab.cohorts WHERE id=cid FOR UPDATE;
 SELECT * INTO i FROM reward_admission_lab.invites WHERE code=p_code FOR UPDATE;
 SELECT * INTO r FROM reward_admission_lab.reservations WHERE code=p_code FOR UPDATE;
 IF NOT FOUND THEN RETURN 'NO_RESERVATION'; END IF;
 IF r.status='RELEASED' THEN RETURN 'ALREADY_RELEASED'; END IF;
 IF i.status NOT IN ('CANCELLED','SYBIL_BLOCKED') THEN RETURN 'NOT_TERMINAL'; END IF;
 SELECT held_wei INTO ph FROM reward_admission_lab.pool WHERE id=true;
 IF ph<r.amount_wei OR c.held_wei<r.amount_wei THEN RETURN 'INCONSISTENT'; END IF;
 UPDATE reward_admission_lab.pool SET held_wei=held_wei-r.amount_wei WHERE id=true;
 UPDATE reward_admission_lab.cohorts SET held_wei=held_wei-r.amount_wei WHERE id=c.id;
 UPDATE reward_admission_lab.reservations SET status='RELEASED' WHERE code=p_code;
 RETURN 'RELEASED';
END $f$;
REVOKE ALL ON ALL TABLES IN SCHEMA reward_admission_lab FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION reward_admission_lab.reserve(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION reward_admission_lab.release_terminal(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SCHEMA reward_admission_lab FROM anon,authenticated;
-- Fake numbers only: two cohorts each have 5 B3TR, global pool only 5.
INSERT INTO reward_admission_lab.pool(id,physical_wei,external_holds_wei,observed_at,evidence_verified,paused)
VALUES(true,5*power(10::numeric,18),0,now(),true,false);
INSERT INTO reward_admission_lab.cohorts(id,receipt_id,budget_wei,floor_wei,receipt_verified,admission_open)
VALUES(123,1001,5*power(10::numeric,18),5*power(10::numeric,18),true,true),
 (124,1002,5*power(10::numeric,18),5*power(10::numeric,18),true,true);
INSERT INTO reward_admission_lab.invites(code,cohort_id,receipt_id,verified,status)
VALUES('FAKE-A',123,1001,true,'ACTIVE'),('FAKE-B',124,1002,true,'ACTIVE'),
 ('FAKE-INELIGIBLE',123,1001,false,'ACTIVE');