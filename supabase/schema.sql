-- P2PCash off-chain indexer schema.
-- Source of truth for balances/loans is always the Stellar chain + anchor;
-- these tables only cache state for a fast UI.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  stellar_public_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists loans (
  id uuid primary key default gen_random_uuid(),
  borrower_id uuid not null references profiles (id) on delete cascade,
  collateral_asset text not null,
  collateral_amount numeric not null check (collateral_amount > 0),
  borrowed_usdc_amount numeric not null check (borrowed_usdc_amount > 0),
  try_amount numeric not null check (try_amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'repaid', 'liquidated', 'defaulted')),
  created_at timestamptz not null default now(),
  due_at timestamptz
);

create table if not exists deposits (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references profiles (id) on delete cascade,
  try_amount numeric not null check (try_amount > 0),
  usdc_amount numeric,
  anchor_ref text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'converting', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  borrower_id uuid not null references profiles (id) on delete cascade,
  loan_id uuid references loans (id) on delete set null,
  try_amount numeric not null check (try_amount > 0),
  usdc_amount numeric not null check (usdc_amount > 0),
  iban text not null,
  anchor_ref text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists transactions_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  kind text not null,
  reference_table text not null,
  reference_id uuid not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists loans_borrower_id_idx on loans (borrower_id);
create index if not exists deposits_lender_id_idx on deposits (lender_id);
create index if not exists withdrawals_borrower_id_idx on withdrawals (borrower_id);
create index if not exists withdrawals_loan_id_idx on withdrawals (loan_id);
create index if not exists transactions_log_profile_id_idx on transactions_log (profile_id);

-- Row Level Security: only the service role (used by server-side API routes)
-- may read/write. The browser client never talks to these tables directly.
alter table profiles enable row level security;
alter table loans enable row level security;
alter table deposits enable row level security;
alter table withdrawals enable row level security;
alter table transactions_log enable row level security;
