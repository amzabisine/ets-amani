-- Currencies become a list the owner can extend (USD stays the base currency).
create table currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  name text not null default '',
  position int generated always as identity
);
insert into currencies(code, name) values ('USD', 'US Dollar'), ('CDF', 'Congolese Franc');
alter table currencies enable row level security;

-- One reference (cost) rate per currency: 1 USD = ? of that currency.
update settings set key = 'ref_rate_CDF' where key = 'ref_rate';

-- An exchange rate now always reads "1 unit of what I give = ? of what I receive".
-- Rates into USD used to be stored the other way round (1 USD = ? CDF): flip them.
update exchange_rates set rate = 1 / rate where to_currency = 'USD' and rate > 1;
update txns set rate = 1 / rate where type = 'exchange' and to_currency = 'USD' and rate > 1;
comment on column exchange_rates.rate is '1 unit of from_currency = rate units of to_currency';
