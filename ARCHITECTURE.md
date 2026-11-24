# MAXONE Sales Record Architecture

## Stored stock balances

Opening and closing quantities are stored as independently editable cases, packs, and bottles. Opening stock is optional and is not inferred from another record. Closing stock is manually editable by default. The optional auto-calculation subtracts same-unit sales from the most recent earlier-date closing value; it does not convert units or rewrite other records. A shop is the sale location. Every transaction has a hidden, stable UUID `SalesID` (`sales_records.id`) and a transaction timestamp (`transaction_at`).

For each event:

`closing[unit] = previous_date_closing[unit] - sales_today[unit]`

If there is no earlier-date closing value for a unit, that unit remains blank until the user enters a value. Opening stock remains a separate optional report value.

A date may contain multiple events, including multiple events at the same shop. Time determines their order. `shop_id` is descriptive sale-location metadata only.

Saving or deleting a record does not recalculate or rewrite balances in other records. The local changes and audit event are committed atomically in IndexedDB.

## Units

Cases, packs, and bottles are stored and calculated independently for this report.

## Local-first storage

IndexedDB stores shop/location names, sales ledger events, audit snapshots, and pending cloud-delete operations. The stable SalesID is never displayed in the user interface. The UI commits local data before reporting a successful save. Cloud sync is asynchronous and must not block offline use.

## Sync strategy

Push local records and pending tombstones when the app opens and when the browser returns online. Pull remote changes after authentication. Use stable SalesIDs for idempotent upserts. Never delete local data merely because a cloud write fails.

## Export

Excel and PDF exports preserve the supplied 12-column grouped table layout. Sales totals are summed by unit and displayed with unit labels; zero totals are left blank. Internal SalesID is not displayed or exported.

## Workbook boundary

The source workbook has five historical rows dated 16-20 November 2569. Opening stock is blank and some balances do not reconcile with the new global-ledger rule. Those rows are not imported as validated transactions. Shop names are preloaded as selectable locations only.

## Expiry

One expiry date is stored per sales record, matching the source workbook. Lot-level expiry tracking is not included.
