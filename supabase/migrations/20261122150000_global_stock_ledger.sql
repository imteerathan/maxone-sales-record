-- MAXONE only. Converts ordering to a single company-wide stock ledger.
-- shop_id remains the sale location, never a stock ownership key.
alter table public.sales_records
  add column if not exists transaction_at timestamptz;

update public.sales_records
set transaction_at = sale_date::timestamp + created_at::time
where transaction_at is null;

alter table public.sales_records
  alter column transaction_at set default now(),
  alter column transaction_at set not null;

-- Multiple transactions at the same shop on the same date are valid.
alter table public.sales_records
  drop constraint if exists sales_record_shop_sequence_unique;

drop index if exists public.sales_records_shop_date_sequence_idx;
create index if not exists sales_records_transaction_at_idx
  on public.sales_records (created_by, transaction_at, created_at, id);

comment on column public.sales_records.id is
  'Internal SalesID. Stable unique identifier; not displayed to users.';
comment on column public.sales_records.transaction_at is
  'Local transaction moment represented as timestamptz; orders the global stock ledger.';
comment on column public.sales_records.shop_id is
  'Shop/location where the sale happened. Stock is not partitioned by shop.';
