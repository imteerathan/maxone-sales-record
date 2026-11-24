-- MAXONE v0.4: independent unit balances, optional calculation, shared authenticated workspace.
alter table public.sales_records
  add column if not exists opening_cases integer not null default 0 check (opening_cases >= 0),
  add column if not exists opening_packs integer not null default 0 check (opening_packs >= 0),
  add column if not exists opening_loose_bottles integer not null default 0 check (opening_loose_bottles >= 0),
  add column if not exists closing_cases integer not null default 0 check (closing_cases >= 0),
  add column if not exists closing_packs integer not null default 0 check (closing_packs >= 0),
  add column if not exists closing_loose_bottles integer not null default 0 check (closing_loose_bottles >= 0),
  add column if not exists stock_calculation_enabled boolean not null default false,
  add column if not exists sale_time time not null default time '00:00';

-- Every authenticated MAXONE account sees the same shops, sales and deletion markers.
drop policy if exists "owner can read own shops" on public.shops;
drop policy if exists "owner can insert own shops" on public.shops;
drop policy if exists "owner can update own shops" on public.shops;
drop policy if exists "owner can delete own shops" on public.shops;
drop policy if exists "owner can read own sales records" on public.sales_records;
drop policy if exists "owner can insert own sales records" on public.sales_records;
drop policy if exists "owner can update own sales records" on public.sales_records;
drop policy if exists "owner can delete own sales records" on public.sales_records;
drop policy if exists "owner can read own tombstones" on public.sync_tombstones;
drop policy if exists "owner can insert own tombstones" on public.sync_tombstones;
drop policy if exists "owner can update own tombstones" on public.sync_tombstones;

create policy "authenticated shared shops read" on public.shops for select to authenticated using (true);
create policy "authenticated shared shops insert" on public.shops for insert to authenticated with check (true);
create policy "authenticated shared shops update" on public.shops for update to authenticated using (true) with check (true);
create policy "authenticated shared shops delete" on public.shops for delete to authenticated using (true);

create policy "authenticated shared sales read" on public.sales_records for select to authenticated using (true);
create policy "authenticated shared sales insert" on public.sales_records for insert to authenticated with check (true);
create policy "authenticated shared sales update" on public.sales_records for update to authenticated using (true) with check (true);
create policy "authenticated shared sales delete" on public.sales_records for delete to authenticated using (true);

create policy "authenticated shared tombstones read" on public.sync_tombstones for select to authenticated using (true);
create policy "authenticated shared tombstones insert" on public.sync_tombstones for insert to authenticated with check (true);
create policy "authenticated shared tombstones update" on public.sync_tombstones for update to authenticated using (true) with check (true);

create unique index if not exists shops_shared_name_unique on public.shops (lower(trim(name)));
