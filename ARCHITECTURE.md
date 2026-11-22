# MAXONE Sales Record Architecture

## Global company stock ledger

MAXONE owns one central stock balance. A shop is only the location where a sale transaction occurs; a shop never owns or partitions stock. Every transaction has a hidden, stable UUID `SalesID` (`sales_records.id`) and a transaction timestamp (`transaction_at`). Records are ordered globally by transaction timestamp, then creation timestamp, then SalesID for deterministic ties.

For each event:

`closing = opening + refill_to_company_stock - sales +/- manual_adjustment`

The first event in the ledger carries the initial warehouse opening balance. Every later event inherits the previous event's closing balance, even when the shop differs. A refill is an inbound movement into the central stock at that event's timestamp. It is not stock owned by the shop.

A date may contain multiple events, including multiple events at the same shop. Time determines their order. `shop_id` is descriptive sale-location metadata only.

A manual correction is stored as a signed adjustment and flows into every later event. Editing, deleting, or changing the timestamp of an event requires recalculating the entire later global ledger. Calculate all results before committing; reject a change if any event would result in negative stock. The local changes and audit event are committed atomically in IndexedDB.

When the earliest event is deleted or moved later, its initial warehouse balance must be transferred to the new earliest event so that the ledger's starting balance is not lost.

## Units

All quantities are integer bottles:
- 10 bottles = 1 pack
- 5 packs = 1 case
- 1 case = 50 bottles

## Local-first storage

IndexedDB stores shop/location names, sales ledger events, audit snapshots, and pending cloud-delete operations. The stable SalesID is never displayed in the user interface. The UI commits local data before reporting a successful save. Cloud sync is asynchronous and must not block offline use.

## Sync strategy

Push local ledger events and pending tombstones when the app opens and when the browser returns online. Pull remote changes after authentication. Use stable SalesIDs for idempotent upserts. Recalculate the global ledger after edits/deletes. Never delete local data merely because a cloud write fails.

## Export

The primary Excel sheet preserves source columns A-L. A second `รายละเอียดเพิ่มเติม` sheet includes transaction date/time, shop, refill quantities, and stock adjustment details. Internal SalesID is not displayed or exported.

## Workbook boundary

The source workbook has five historical rows dated 16-20 November 2569. Opening stock is blank and some balances do not reconcile with the new global-ledger rule. Those rows are not imported as validated transactions. Shop names are preloaded as selectable locations only.

## Expiry

One expiry date is stored per sales record, matching the source workbook. Lot-level expiry tracking is not included.
