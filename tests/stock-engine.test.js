'use strict';
var assert = require('assert');
var S = require('../src/stock-engine.js');
function equal(a, b, message) { assert.deepStrictEqual(a, b, message); }
var opening = S.unitsToBottles({ cases: 4, packs: 4, bottles: 4 });
var sold = S.unitsToBottles({ cases: 1, packs: 4, bottles: 3 });
equal(S.bottlesToUnits(opening - sold), { cases: 3, packs: 0, bottles: 1 }, 'worked example');
var first = S.recalculate([{ id: 'a', shopId: 'A', transactionAt: '2026-11-22T08:00:00+07:00', openingSeedBottles: opening,
  refillBottles: 10, salesBottles: sold }])[0];
equal(first.closingUnits, { cases: 3, packs: 1, bottles: 1 }, 'refill added before sale');
// Migration from legacy per-shop rows: preserve only the first warehouse seed and
// discard later shop-specific opening seeds before rebuilding the shared ledger.
var legacy = S.normalizeLedger([
  { id: 'legacy-shop-b', shopId: 'B', transactionAt: '2026-11-22T10:00:00+07:00', openingSeedBottles: 700, salesBottles: 50, closingBottles: 650 },
  { id: 'legacy-shop-a', shopId: 'A', transactionAt: '2026-11-22T08:00:00+07:00', openingSeedBottles: 300, salesBottles: 20, closingBottles: 280 },
  { id: 'legacy-shop-c', shopId: 'C', transactionAt: '2026-11-22T09:00:00+07:00', openingSeedBottles: 900, salesBottles: 10, closingBottles: 890 }
]);
equal(legacy.map(function (r) { return r.openingSeedBottles; }), [300, 0, 0], 'legacy migration keeps only earliest warehouse seed');
var migrated = S.recalculate(legacy);
equal(migrated.map(function (r) { return r.openingBottles; }), [300, 280, 270], 'legacy shop balances rebuilt from one global stock chain');
equal(migrated.map(function (r) { return r.closingBottles; }), [280, 270, 220], 'legacy stale closing balances overwritten globally');

// Different shops share the same company stock ledger, ordered by transaction time.
var globalChain = S.recalculate([
  { id: 'later', shopId: 'SHOP-B', transactionAt: '2026-11-22T10:00:00+07:00', openingSeedBottles: 999, refillBottles: 20, salesBottles: 30 },
  { id: 'first', shopId: 'SHOP-A', transactionAt: '2026-11-22T08:00:00+07:00', openingSeedBottles: 200, refillBottles: 0, salesBottles: 40 },
  { id: 'middle', shopId: 'SHOP-C', transactionAt: '2026-11-22T09:00:00+07:00', openingSeedBottles: 888, refillBottles: 50, salesBottles: 10 }
]);
equal(globalChain.map(function (r) { return r.id; }), ['first','middle','later'], 'sort globally by transaction timestamp');
equal(globalChain[1].openingBottles, 160, 'other shop inherits global previous closing');
equal(globalChain[1].closingBottles, 200, 'middle event closing');
equal(globalChain[2].openingBottles, 200, 'later shop inherits global balance, ignores its own seed');
equal(globalChain[2].closingBottles, 190, 'global balance after later event');
// Manual correction flows into the next event even when it is another shop.
var adjusted = S.recalculate([
  { id: 'a', shopId: 'A', transactionAt: '2026-11-22T08:00:00+07:00', openingSeedBottles: 100, refillBottles: 0, salesBottles: 10, closingOverrideBottles: 95 },
  { id: 'b', shopId: 'B', transactionAt: '2026-11-22T09:00:00+07:00', openingSeedBottles: 500, refillBottles: 0, salesBottles: 5 }
]);
equal(adjusted[0].adjustmentBottles, 5, 'manual adjustment amount');
equal(adjusted[1].openingBottles, 95, 'adjustment carries across shops');
assert.throws(function () { S.recalculate([{ id: 'x', transactionAt: '2026-11-22T08:00:00+07:00', openingSeedBottles: 10, salesBottles: 11 }]); }, /สต๊อกไม่เพียงพอ/);
assert.throws(function () { S.unitsToBottles({ cases: 1.5, packs: 0, bottles: 0 }); });
// Editing an earlier event propagates through all later events regardless of shop.
var before = S.recalculate([
  { id: 'one', shopId: 'A', transactionAt: '2026-11-22T08:00:00+07:00', openingSeedBottles: 500, salesBottles: 50 },
  { id: 'two', shopId: 'B', transactionAt: '2026-11-22T09:00:00+07:00', salesBottles: 20 },
  { id: 'three', shopId: 'C', transactionAt: '2026-11-22T10:00:00+07:00', salesBottles: 10 }
]);
var after = S.recalculate([
  { id: 'one', shopId: 'A', transactionAt: '2026-11-22T08:00:00+07:00', openingSeedBottles: 500, salesBottles: 100 },
  { id: 'two', shopId: 'B', transactionAt: '2026-11-22T09:00:00+07:00', salesBottles: 20 },
  { id: 'three', shopId: 'C', transactionAt: '2026-11-22T10:00:00+07:00', salesBottles: 10 }
]);
equal(before[1].openingBottles, 450, 'before edit');
equal(after[1].openingBottles, 400, 'edited stock carried to other shop');
equal(after[2].closingBottles, 370, 'edit recalculated entire chain');
var deleted = S.recalculate([
  { id: 'one', shopId: 'A', transactionAt: '2026-11-22T08:00:00+07:00', openingSeedBottles: 500, salesBottles: 50 },
  { id: 'three', shopId: 'C', transactionAt: '2026-11-22T10:00:00+07:00', salesBottles: 10 }
]);
equal(deleted[1].openingBottles, 450, 'delete event reconnects global chain');

// Deleting the first ledger event transfers the initial warehouse seed to the new first event.
var beforeDeleteFirst = [
  { id: 'seed', shopId: 'A', transactionAt: '2026-11-22T08:00:00+07:00', openingSeedBottles: 300, salesBottles: 50 },
  { id: 'next', shopId: 'B', transactionAt: '2026-11-22T09:00:00+07:00', openingSeedBottles: 0, salesBottles: 10 }
];
var afterDeleteFirst = S.prepareLedger(beforeDeleteFirst, beforeDeleteFirst[0], 'delete');
equal(afterDeleteFirst[0].openingSeedBottles, 300, 'initial warehouse seed survives deletion of first event');
equal(S.recalculate(afterDeleteFirst)[0].openingBottles, 300, 'new first event starts from preserved warehouse seed');

var preview = S.previewAdjustment(151, { cases: 3, packs: 1, bottles: 1 });
equal(preview.differenceBottles, 10, 'adjustment delta');
equal(preview.differenceUnits, { cases: 0, packs: 1, bottles: 0 }, 'adjustment display');
console.log('PASS: 22 global-stock-ledger assertions');
