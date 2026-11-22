-- MAXONE Sales Record schema for a new, separate Supabase project.
-- Run only against the dedicated MAXONE project, never Cotton Favor.

create extension if not exists pgcrypto;

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index shops_owner_name_unique on public.shops (created_by, lower(trim(name)));

create table public.sales_records (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  sale_date date not null,
  entry_no integer not null default 1 check (entry_no > 0),
  opening_seed_bottles integer not null default 0 check (opening_seed_bottles >= 0),
  opening_bottles integer not null default 0 check (opening_bottles >= 0),
  refill_crates integer not null default 0 check (refill_crates >= 0),
  refill_packs integer not null default 0 check (refill_packs >= 0),
  refill_bottles integer not null default 0 check (refill_bottles >= 0),
  sales_crates integer not null default 0 check (sales_crates >= 0),
  sales_packs integer not null default 0 check (sales_packs >= 0),
  sales_bottles integer not null default 0 check (sales_bottles >= 0),
  stock_adjustment_bottles integer not null default 0,
  adjustment_reason text,
  closing_bottles integer generated always as (
    opening_bottles + refill_crates * 50 + refill_packs * 10 + refill_bottles
    + stock_adjustment_bottles - sales_crates * 50 - sales_packs * 10 - sales_bottles
  ) stored,
  expiry_date date,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_record_nonnegative_closing check (
    opening_bottles + refill_crates * 50 + refill_packs * 10 + refill_bottles
    + stock_adjustment_bottles - sales_crates * 50 - sales_packs * 10 - sales_bottles >= 0
  ),
  constraint sales_record_shop_sequence_unique unique (shop_id, sale_date, entry_no)
);
create index sales_records_owner_date_idx on public.sales_records (created_by, sale_date desc);
create index sales_records_shop_date_sequence_idx on public.sales_records (shop_id, sale_date, entry_no);

create table public.sync_tombstones (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('record')),
  entity_id uuid not null,
  deleted_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (created_by, entity, entity_id)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger shops_set_updated_at before update on public.shops
for each row execute function public.set_updated_at();
create trigger sales_records_set_updated_at before update on public.sales_records
for each row execute function public.set_updated_at();
revoke all on function public.set_updated_at() from public, anon, authenticated;

alter table public.shops enable row level security;
alter table public.sales_records enable row level security;
alter table public.sync_tombstones enable row level security;

create policy "owner can read own shops" on public.shops for select to authenticated
using ((select auth.uid()) = created_by);
create policy "owner can insert own shops" on public.shops for insert to authenticated
with check ((select auth.uid()) = created_by);
create policy "owner can update own shops" on public.shops for update to authenticated
using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "owner can delete own shops" on public.shops for delete to authenticated
using ((select auth.uid()) = created_by);

create policy "owner can read own sales records" on public.sales_records for select to authenticated
using ((select auth.uid()) = created_by and exists (
  select 1 from public.shops s where s.id = shop_id and s.created_by = (select auth.uid())
));
create policy "owner can insert own sales records" on public.sales_records for insert to authenticated
with check ((select auth.uid()) = created_by and exists (
  select 1 from public.shops s where s.id = shop_id and s.created_by = (select auth.uid())
));
create policy "owner can update own sales records" on public.sales_records for update to authenticated
using ((select auth.uid()) = created_by and exists (
  select 1 from public.shops s where s.id = shop_id and s.created_by = (select auth.uid())
)) with check ((select auth.uid()) = created_by and exists (
  select 1 from public.shops s where s.id = shop_id and s.created_by = (select auth.uid())
));
create policy "owner can delete own sales records" on public.sales_records for delete to authenticated
using ((select auth.uid()) = created_by and exists (
  select 1 from public.shops s where s.id = shop_id and s.created_by = (select auth.uid())
));

create policy "owner can read own tombstones" on public.sync_tombstones for select to authenticated
using ((select auth.uid()) = created_by);
create policy "owner can insert own tombstones" on public.sync_tombstones for insert to authenticated
with check ((select auth.uid()) = created_by);
create policy "owner can update own tombstones" on public.sync_tombstones for update to authenticated
using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);

revoke all on public.shops, public.sales_records, public.sync_tombstones from anon, public;
grant select, insert, update, delete on public.shops, public.sales_records to authenticated;
grant select, insert, update on public.sync_tombstones to authenticated;
grant usage on schema public to authenticated;
