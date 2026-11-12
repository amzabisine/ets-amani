-- Rentals of different kinds (car, apartment, shop…), billed per day, week or month.
alter table rentals rename column monthly to rate;      -- price for one day / week / month
alter table rentals add column type text not null default 'apartment';
alter table rentals add column period_unit text not null default 'month' check (period_unit in ('day', 'week', 'month'));
alter table rentals add column start_date date;
alter table rentals add column end_date date;           -- planned return / end; null = open-ended
alter table rentals add column details jsonb not null default '{}'; -- attributes of the type (plate number, address…)

update rentals set
  start_date = (start_month || '-01')::date,
  end_date = case when end_month is null then null else ((end_month || '-01')::date + interval '1 month - 1 day')::date end;

alter table rentals alter column start_date set not null;
alter table rentals drop column start_month;
alter table rentals drop column end_month;
