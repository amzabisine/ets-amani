-- ETS AMANI — initial schema.
-- Money is stored as whole cents (bigint) so calculations are always exact.

create table users (
  id bigint generated always as identity primary key,
  username text unique not null,
  pass_hash text not null,
  salt text not null,
  role text not null check (role in ('owner', 'viewer')),
  created_at timestamptz not null default now()
);

create table sessions (
  token text primary key,
  user_id bigint not null references users(id) on delete cascade,
  expires timestamptz not null
);

create table settings (key text primary key, value text);

create table accounts (
  id bigint generated always as identity primary key,
  provider text not null,
  label text not null default '',
  kind text not null check (kind in ('virtual', 'cash', 'bank')),
  currency text not null,
  on_dashboard boolean not null default true,
  archived boolean not null default false
);

create table customers (
  id bigint generated always as identity primary key,
  name text not null,
  phone text not null default '',
  note text not null default ''
);

create table rentals (
  id bigint generated always as identity primary key,
  property text not null,
  customer_id bigint not null references customers(id),
  monthly bigint not null check (monthly > 0),
  currency text not null,
  start_month text not null,          -- YYYY-MM
  end_month text,
  active boolean not null default true,
  note text not null default ''
);

-- One row per operation (transfer, exchange, loan, rent payment, …)
create table txns (
  id bigint generated always as identity primary key,
  date date not null,
  created_at timestamptz not null default now(),
  type text not null,
  currency text not null,
  amount bigint not null check (amount > 0),
  to_currency text,
  to_amount bigint,
  rate double precision,
  ref_rate double precision,
  customer_id bigint references customers(id),
  rental_id bigint references rentals(id),
  period text,                        -- YYYY-MM, for rent payments
  category text not null default '',
  note text not null default '',
  debt_delta bigint not null default 0, -- positive = the customer owes the business
  pnl bigint not null default 0,        -- profit (+) or loss (-) of this operation
  pnl_currency text,
  user_id bigint references users(id) on delete set null
);

-- The ledger: every operation moves money in (+) or out (-) of accounts.
-- An account balance is always the sum of its entries.
create table entries (
  id bigint generated always as identity primary key,
  txn_id bigint not null references txns(id) on delete cascade,
  account_id bigint not null references accounts(id),
  amount bigint not null
);

create index entries_account_idx on entries(account_id);
create index entries_txn_idx on entries(txn_id);
create index txns_date_idx on txns(date);
create index txns_customer_idx on txns(customer_id);

-- Lock every table: only the Express server (which connects with the database
-- password) can read or write. Supabase's public API keys get nothing.
alter table users enable row level security;
alter table sessions enable row level security;
alter table settings enable row level security;
alter table accounts enable row level security;
alter table customers enable row level security;
alter table rentals enable row level security;
alter table txns enable row level security;
alter table entries enable row level security;
