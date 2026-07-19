create type invite_status as enum (
  'PENDING_ACCEPTANCE', 'ACTIVATING', 'UNDER_REVIEW', 'COMPLETED', 'CANCELLED'
);

create type reward_eligibility as enum ('NONE', 'PENDING', 'ELIGIBLE', 'FORFEITED');

create table invites (
  code text primary key,
  inviter_address text not null,
  invitee_address text unique,
  status invite_status not null default 'PENDING_ACCEPTANCE',
  reward_eligibility reward_eligibility not null default 'NONE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  completed_at timestamptz
);

create unique index one_active_invite_per_inviter
on invites (lower(inviter_address))
where status in ('PENDING_ACCEPTANCE', 'ACTIVATING', 'UNDER_REVIEW');

create table activation_checks (
  id bigserial primary key,
  invite_code text not null references invites(code),
  wallet_connected boolean not null default false,
  distinct_apps_used integer not null default 0,
  b3tr_earned boolean not null default false,
  converted_to_vot3 boolean not null default false,
  voted boolean not null default false,
  risk_score numeric(5,2),
  checked_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb
);

create table reward_settlements (
  id bigserial primary key,
  round_id text not null,
  invite_code text not null references invites(code),
  inviter_address text not null,
  amount_b3tr_wei numeric(78,0) not null,
  status text not null default 'PENDING',
  transaction_id text,
  proof jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);
