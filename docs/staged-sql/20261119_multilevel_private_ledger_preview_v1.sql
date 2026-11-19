-- VeInvite multilevel v1 PRIVATE, PREVIEW-ONLY schema. 2026-11-19.
-- NOT a production migration. DO NOT run on mainnet Supabase.
-- Staging project: veinvite-preview (bpppslplhmppxzvdkwxs) ONLY.
-- No triggers on existing tables; no production payout or API route.
-- DO NOT expose this schema in Supabase Data API.
BEGIN;

CREATE SCHEMA IF NOT EXISTS veinvite_multilevel_staging;
REVOKE ALL ON SCHEMA veinvite_multilevel_staging FROM PUBLIC;
REVOKE ALL ON SCHEMA veinvite_multilevel_staging FROM anon, authenticated;

-- An explicit, normally inert feature-version checkpoint.
CREATE TABLE IF NOT EXISTS veinvite_multilevel_staging.policy_control (
  policy_version text PRIMARY KEY CHECK (policy_version = 'multilevel-v1'),
  mode text NOT NULL DEFAULT 'STAGING_ONLY'
    CHECK (mode IN ('STAGING_ONLY','PREVIEW_VALIDATED')),
  production_activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_no_live_activation
    CHECK (production_activated_at IS NULL)
);

CREATE TABLE IF NOT EXISTS veinvite_multilevel_staging.round_books (
  network text NOT NULL CHECK (network IN ('mainnet','testnet','testnet-staging')),
  policy_version text NOT NULL REFERENCES veinvite_multilevel_staging.policy_control(policy_version),
  round_id bigint NOT NULL CHECK (round_id >= 1),
  lifecycle text NOT NULL DEFAULT 'DRAFT'
    CHECK (lifecycle IN ('DRAFT','FROZEN','SEALED')),
  input_fingerprint text CHECK (input_fingerprint ~ '^[a-f0-9]{64}$'),
  participant_pool_wei numeric(78,0) NOT NULL CHECK (participant_pool_wei >= 0),
  carry_onboarding_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK (carry_onboarding_wei >= 0),
  carry_active_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK (carry_active_wei >= 0),
  carry_leader_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK (carry_leader_wei >= 0),
  budget_onboarding_wei numeric(78,0) NOT NULL CHECK (budget_onboarding_wei >= 0),
  budget_active_wei numeric(78,0) NOT NULL CHECK (budget_active_wei >= 0),
  budget_leader_wei numeric(78,0) NOT NULL CHECK (budget_leader_wei >= 0),
  budget_dust_wei numeric(78,0) NOT NULL DEFAULT 0 CHECK (budget_dust_wei >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network,policy_version,round_id),
  CONSTRAINT round_book_budget_conservation CHECK (
    participant_pool_wei + carry_onboarding_wei + carry_active_wei + carry_leader_wei =
    budget_onboarding_wei + budget_active_wei + budget_leader_wei + budget_dust_wei
  )
);

-- A source event is only recorded after real chain evidence has been checked.
-- First onboarding counts in its VOTE round, exactly one round AFTER dApps.
-- Existing/onboarded actors must have finished onboarding BEFORE this round.
CREATE TABLE IF NOT EXISTS veinvite_multilevel_staging.verified_events (
  network text NOT NULL,
  policy_version text NOT NULL,
  round_id bigint NOT NULL,
  event_key text NOT NULL CHECK (event_key ~ '^[A-Za-z0-9_-]{1,128}$'),
  event_kind text NOT NULL CHECK (event_kind IN ('ONBOARDING','ACTIVE')),
  actor_wallet text NOT NULL CHECK (actor_wallet ~ '^0x[0-9a-f]{40}$'),
  first_onboarded_round_id bigint NOT NULL CHECK (first_onboarded_round_id >= 1),
  rewarded_dapp_round_id bigint NOT NULL CHECK (rewarded_dapp_round_id >= 1),
  proof_version text NOT NULL CHECK (length(proof_version) BETWEEN 1 AND 80),
  chain_proof_fingerprint text NOT NULL CHECK (chain_proof_fingerprint ~ '^[a-f0-9]{64}$'),
  identity_clearance_ref text NOT NULL CHECK (length(identity_clearance_ref) BETWEEN 1 AND 256),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object'),
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network,policy_version,round_id,event_key),
  FOREIGN KEY (network,policy_version,round_id)
    REFERENCES veinvite_multilevel_staging.round_books(network,policy_version,round_id)
    ON DELETE RESTRICT,
  CONSTRAINT strict_round_evidence CHECK (
    (event_kind='ONBOARDING' AND first_onboarded_round_id=round_id
       AND rewarded_dapp_round_id+1=round_id)
    OR (event_kind='ACTIVE' AND first_onboarded_round_id<round_id
       AND rewarded_dapp_round_id=round_id)
  ),
  UNIQUE(network,policy_version,round_id,actor_wallet)
);
CREATE INDEX IF NOT EXISTS multilevel_events_actor_idx
  ON veinvite_multilevel_staging.verified_events(network,actor_wallet,round_id DESC);

-- A single event can benefit multiple independent ancestor wallets, but
-- all amounts must fit inside one already verified per-event budget.
CREATE TABLE IF NOT EXISTS veinvite_multilevel_staging.entitlements (
  entitlement_key text PRIMARY KEY CHECK (length(entitlement_key) BETWEEN 5 AND 400),
  network text NOT NULL,
  policy_version text NOT NULL,
  round_id bigint NOT NULL,
  event_key text NOT NULL,
  category text NOT NULL CHECK (category IN ('onboarding','active','leader')),
  recipient_wallet text NOT NULL CHECK (recipient_wallet ~ '^0x[0-9a-f]{40}$'),
  level_no smallint NOT NULL,
  gross_wei numeric(78,0) NOT NULL CHECK (gross_wei > 0),
  base_wei numeric(78,0) GENERATED ALWAYS AS (gross_wei - floor(gross_wei/10)) STORED,
  x_share_wei numeric(78,0) GENERATED ALWAYS AS (floor(gross_wei/10)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (network,policy_version,round_id)
    REFERENCES veinvite_multilevel_staging.round_books(network,policy_version,round_id)
    ON DELETE RESTRICT,
  CONSTRAINT entitlement_level_shape CHECK (
    (category='leader' AND level_no=0)
    OR (category IN ('onboarding','active') AND level_no BETWEEN 1 AND 5)
  ),
  UNIQUE(network,policy_version,round_id,category,event_key,level_no,recipient_wallet)
);
CREATE INDEX IF NOT EXISTS multilevel_entitlements_wallet_idx
  ON veinvite_multilevel_staging.entitlements(network,recipient_wallet,round_id DESC);

-- X share opportunities are per entitlement, NEVER per invite code.
-- Post id is globally unique to prevent submitting one X post for multiple rewards.
CREATE TABLE IF NOT EXISTS veinvite_multilevel_staging.x_share_proofs (
  entitlement_key text PRIMARY KEY REFERENCES veinvite_multilevel_staging.entitlements(entitlement_key)
    ON DELETE RESTRICT,
  claimed_base_at timestamptz NOT NULL,
  post_deadline_at timestamptz NOT NULL,
  x_post_id text UNIQUE,
  x_author_id text,
  x_post_created_at timestamptz,
  verify_after_at timestamptz,
  verification_state text NOT NULL DEFAULT 'OFFERED'
    CHECK (verification_state IN ('OFFERED','POST_PENDING','HOLDING','VERIFIED','REJECTED','EXPIRED','API_UNAVAILABLE')),
  verification_ref text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT share_deadline_equals_24h CHECK (post_deadline_at=claimed_base_at+interval '24 hours'),
  CONSTRAINT share_post_is_after_claim CHECK (x_post_created_at IS NULL OR
    (x_post_created_at>=claimed_base_at AND x_post_created_at<=post_deadline_at)),
  CONSTRAINT share_hold_min_24h CHECK (
    x_post_created_at IS NULL OR verify_after_at IS NULL OR
    verify_after_at >= x_post_created_at+interval '24 hours'
  ),
  CONSTRAINT share_verified_requires_proof CHECK (
    verification_state<>'VERIFIED'
    OR (x_post_id IS NOT NULL AND x_author_id IS NOT NULL AND
        verification_ref IS NOT NULL AND verify_after_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS multilevel_x_verify_due_idx
  ON veinvite_multilevel_staging.x_share_proofs(verify_after_at)
  WHERE verification_state IN ('POST_PENDING','HOLDING','API_UNAVAILABLE');

-- A payout attempt has a durable unique key even if a server crashes.
-- It cannot itself transfer tokens; real payout must reconcile chain txs.
CREATE TABLE IF NOT EXISTS veinvite_multilevel_staging.claim_legs (
  claim_leg_key text PRIMARY KEY CHECK (length(claim_leg_key) BETWEEN 5 AND 420),
  entitlement_key text NOT NULL REFERENCES veinvite_multilevel_staging.entitlements(entitlement_key)
    ON DELETE RESTRICT,
  component text NOT NULL CHECK (component IN ('BASE','X')),
  state text NOT NULL DEFAULT 'RESERVED'
    CHECK (state IN ('RESERVED','READY','SUBMITTED','CONFIRMED','EXPIRED','HELD_FOR_REVIEW')),
  amount_wei numeric(78,0) NOT NULL CHECK (amount_wei >= 0),
  tx_id text UNIQUE CHECK (tx_id IS NULL OR tx_id ~ '^0x[0-9a-f]{64}$'),
  confirmed_block bigint CHECK (confirmed_block IS NULL OR confirmed_block >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entitlement_key,component),
  CONSTRAINT no_unconfirmed_payout_claim CHECK (
    state<>'CONFIRMED' OR (tx_id IS NOT NULL AND confirmed_block IS NOT NULL)
  ),
  CONSTRAINT no_submitted_without_tx CHECK (
    state NOT IN ('SUBMITTED','CONFIRMED') OR tx_id IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS multilevel_claims_pending_idx
  ON veinvite_multilevel_staging.claim_legs(state,created_at)
  WHERE state IN ('READY','SUBMITTED','HELD_FOR_REVIEW');

-- Append-only return records: no legitimate protection is released twice.
CREATE TABLE IF NOT EXISTS veinvite_multilevel_staging.return_ledger (
  return_key text PRIMARY KEY CHECK (length(return_key) BETWEEN 5 AND 420),
  network text NOT NULL,
  policy_version text NOT NULL,
  source_round_id bigint NOT NULL,
  destination_round_id bigint NOT NULL,
  reason text NOT NULL CHECK (reason IN (
    'MISSING_UPLINE','INACTIVE_UPLINE','EMPTY_CATEGORY_GENERAL',
    'CLAIM_EXPIRED','X_EXPIRED','ROUNDING_DUST'
  )),
  category text NOT NULL CHECK (category IN ('onboarding','active','leader','general')),
  amount_wei numeric(78,0) NOT NULL CHECK (amount_wei >= 0),
  source_entitlement_key text REFERENCES veinvite_multilevel_staging.entitlements(entitlement_key)
    ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (network,policy_version,source_round_id)
    REFERENCES veinvite_multilevel_staging.round_books(network,policy_version,round_id)
    ON DELETE RESTRICT,
  CONSTRAINT returns_only_to_future CHECK (destination_round_id>source_round_id)
);
CREATE INDEX IF NOT EXISTS multilevel_returns_destination_idx
  ON veinvite_multilevel_staging.return_ledger(network,policy_version,destination_round_id);

-- All tables RLS-on and inaccessible to anon/authenticated: preview admin-only.
ALTER TABLE veinvite_multilevel_staging.policy_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE veinvite_multilevel_staging.round_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE veinvite_multilevel_staging.verified_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE veinvite_multilevel_staging.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE veinvite_multilevel_staging.x_share_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE veinvite_multilevel_staging.claim_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE veinvite_multilevel_staging.return_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA veinvite_multilevel_staging FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA veinvite_multilevel_staging FROM PUBLIC, anon, authenticated;

INSERT INTO veinvite_multilevel_staging.policy_control(policy_version,mode)
VALUES ('multilevel-v1','STAGING_ONLY')
ON CONFLICT (policy_version) DO NOTHING;
COMMIT;
