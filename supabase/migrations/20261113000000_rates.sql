-- Rates: default exchange rates per direction, and transfer prices per amount range.
-- These only pre-fill the forms; the owner can still change the figure on each operation.

create table exchange_rates (
  id bigint generated always as identity primary key,
  from_currency text not null,          -- the currency I give
  to_currency text not null,            -- the currency I receive
  rate double precision not null check (rate > 0), -- 1 USD = ? of the other currency
  updated_at timestamptz not null default now(),
  unique (from_currency, to_currency)
);

create table transfer_fees (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('deposit', 'withdraw')),
  provider text not null default '',    -- '' = every network
  currency text not null,
  min_amount bigint not null check (min_amount >= 0),
  max_amount bigint check (max_amount is null or max_amount >= min_amount), -- null = no upper limit
  fee bigint not null default 0 check (fee >= 0),                          -- fixed price, in cents
  percent double precision not null default 0 check (percent >= 0 and percent <= 100)
);

alter table exchange_rates enable row level security;
alter table transfer_fees enable row level security;
