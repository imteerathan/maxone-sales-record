# MAXONE Sales Record Test Report

## Global stock ledger correction

- Stock engine: 19 assertions passed.
- Cross-shop chain: a sale event at Shop B inherits the previous closing balance from Shop A.
- Refill: added to central stock before calculating the event's sale deduction.
- Timestamp ordering: events are ordered by transaction date/time, with deterministic creation-time and SalesID tie-breakers.
- Multiple events at one shop/date: no longer rejected by the app or database uniqueness constraint.
- Manual balance correction: signed difference carries forward to later events, including events at other shops.
- Edit/delete propagation: the engine recalculates the full later company-wide ledger.
- Initial warehouse balance: transferred to the new first event when the former first event is deleted.
- Negative closing stock: rejected.
- Unit conversion: integer bottles, 10 bottles/pack, 50 bottles/case.

## Database migration

Applied to the dedicated MAXONE Supabase project:
- Added `transaction_at` to `public.sales_records` and backfilled existing records using sale date plus creation time.
- Removed `sales_record_shop_sequence_unique`, allowing multiple same-day events at one shop.
- Removed the obsolete shop/date sequence index and added a global transaction-time index.
- Documented `id` as hidden SalesID and `shop_id` as sale-location metadata, not stock ownership.
- Confirmed RLS remains enabled on all app tables.

Existing cloud data was not rewritten or deleted. At migration inspection, one existing sales record was present; its values were left unchanged.

## Static checks

- `node --check src/app.js`: passed.
- `node --check src/stock-engine.js`: passed.
- `node tests/stock-engine.test.js`: passed, 16 assertions.

## Not yet verified

- Real Supabase signup/sign-in and full two-way sync after the ledger migration.
- Physical iPhone 6 / 6s / SE (1st generation) Safari and offline behavior.
- Real `.xlsx` open/format check in Excel and Numbers.
- Full browser interaction test with a real account and representative data.

The test suite validates the calculation engine, not every end-to-end browser workflow. Do not treat this build as production-validated yet.


## Second-fix regression tests

- Added migration test using legacy records from three shops with conflicting old per-shop opening seeds (300, 900, 700 bottles).
- Confirmed only the earliest warehouse seed (300) is retained.
- Confirmed all later opening and closing balances are rebuilt globally in timestamp order, replacing stale legacy closing balances.
- Startup now rebuilds IndexedDB before rendering the form. Cloud sync rebuilds again after merging remote rows and writes corrected balances back to Supabase.
- Service worker cache bumped to `maxone-sales-v3-global-ledger-migration` to prevent the old JS bundle from remaining active.


## v0.3 checks

- JavaScript parse checks for `src/app.js`, `src/db.js`, and `src/stock-engine.js`: passed.
- `tests/stock-engine.test.js`: 22 global-stock-ledger assertions passed in the isolated JavaScript test run.
- Supabase reset verification: `shops = 0`, `sales_records = 0`, `sync_tombstones = 0` immediately after reset.
- UI browser/device interaction and automatic Vercel deployment are not verified by these checks.
