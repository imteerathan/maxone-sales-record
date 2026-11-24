/* MAXONE global stock ledger. ES5-compatible core for older Safari. */
(function (root) {
  'use strict';
  var BOTTLES_PER_PACK = 10;
  var PACKS_PER_CASE = 5;
  var BOTTLES_PER_CASE = 50;
  function toInt(value, fieldName) {
    var n = Number(value == null || value === '' ? 0 : value);
    if (!isFinite(n) || Math.floor(n) !== n || n < 0) throw new Error((fieldName || 'จำนวน') + ' ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
    return n;
  }
  function unitsToBottles(units) {
    units = units || {};
    return toInt(units.cases, 'ลัง') * 50 + toInt(units.packs, 'แพ็ค') * 10 + toInt(units.bottles, 'ขวด');
  }
  function bottlesToUnits(total) {
    total = toInt(total, 'สต๊อก');
    var cases = Math.floor(total / 50), remainder = total % 50, packs = Math.floor(remainder / 10);
    return { cases: cases, packs: packs, bottles: remainder % 10 };
  }
  function timeOf(record) {
    if (record.transactionAt) {
      var parsed = typeof record.transactionAt === 'number' ? record.transactionAt : Date.parse(record.transactionAt);
      if (isFinite(parsed)) return parsed;
    }
    if (record.date) {
      var date = String(record.date), time = String(record.time || '00:00');
      var fallback = Date.parse(date + 'T' + time + ':00');
      if (isFinite(fallback)) return fallback;
    }
    return Number(record.createdAt || 0);
  }
  function compareRecords(a, b) {
    var at = timeOf(a), bt = timeOf(b);
    if (at !== bt) return at - bt;
    var ac = Number(a.createdAt || 0), bc = Number(b.createdAt || 0);
    if (ac !== bc) return ac - bc;
    return String(a.id || '').localeCompare(String(b.id || ''));
  }
  function prepareLedger(existingRecords, candidate, action) {
    var previousLedger = (existingRecords || []).slice().sort(compareRecords);
    var previousFirst = previousLedger.length ? previousLedger[0] : null;
    var baseline = previousFirst ? Number(previousFirst.openingSeedBottles || 0) : Number(candidate.openingSeedBottles || 0);
    if (previousFirst && candidate.id === previousFirst.id && action !== 'delete') baseline = Number(candidate.openingSeedBottles || 0);
    var affected = (existingRecords || []).filter(function (record) { return record.id !== candidate.id; });
    if (action !== 'delete') affected.push(candidate);
    affected.sort(compareRecords);
    if (affected.length) {
      if (affected[0].id === candidate.id && Number(candidate.openingSeedBottles || 0) > 0) baseline = Number(candidate.openingSeedBottles || 0);
      affected.forEach(function (record, index) { record.openingSeedBottles = index === 0 ? baseline : 0; });
    }
    return affected;
  }
  /* Normalize legacy per-shop records into one company-wide ledger. Only the earliest
     event may carry the warehouse opening seed; all later per-shop seeds are discarded. */
  function normalizeLedger(records) {
    var sorted = (records || []).slice().sort(compareRecords);
    var seed = sorted.length ? toInt(sorted[0].openingSeedBottles, 'Stock ตั้งต้นคลัง') : 0;
    return sorted.map(function (record, index) {
      var copy = {}, key;
      for (key in record) if (Object.prototype.hasOwnProperty.call(record, key)) copy[key] = record[key];
      copy.openingSeedBottles = index === 0 ? seed : 0;
      return copy;
    });
  }
  /* Global stock chain: shopId is descriptive location only, never a stock partition. */
  function recalculate(records) {
    var sorted = (records || []).slice().sort(compareRecords), output = [], previous = null, i;
    for (i = 0; i < sorted.length; i += 1) {
      var source = sorted[i];
      var opening = previous ? previous.closingBottles : toInt(source.openingSeedBottles, 'Stock ตั้งต้น');
      var refill = toInt(source.refillBottles, 'เติมสินค้า');
      var sales = toInt(source.salesBottles, 'ยอดขาย');
      var calculated = opening + refill - sales;
      if (calculated < 0) throw new Error('สต๊อกไม่เพียงพอในรายการ ' + (source.id || (i + 1)) + ': ยอดขายมากกว่าสต๊อกที่มี');
      var hasOverride = source.closingOverrideBottles !== null && source.closingOverrideBottles !== undefined && source.closingOverrideBottles !== '';
      var closing = hasOverride ? toInt(source.closingOverrideBottles, 'สต๊อกคงเหลือที่แก้ไข') : calculated;
      var row = {}, key;
      for (key in source) if (Object.prototype.hasOwnProperty.call(source, key)) row[key] = source[key];
      row.openingBottles = opening;
      row.refillBottles = refill;
      row.salesBottles = sales;
      row.calculatedClosingBottles = calculated;
      row.adjustmentBottles = closing - calculated;
      row.closingBottles = closing;
      row.openingUnits = bottlesToUnits(opening);
      row.refillUnits = bottlesToUnits(refill);
      row.salesUnits = bottlesToUnits(sales);
      row.calculatedClosingUnits = bottlesToUnits(calculated);
      row.closingUnits = bottlesToUnits(closing);
      row.hasManualAdjustment = row.adjustmentBottles !== 0;
      output.push(row);
      previous = row;
    }
    return output;
  }
  function previewAdjustment(calculatedBottles, requestedUnits) {
    var requested = unitsToBottles(requestedUnits), calculated = toInt(calculatedBottles, 'ยอดคำนวณ');
    return { calculatedBottles: calculated, requestedBottles: requested, differenceBottles: requested - calculated,
      calculatedUnits: bottlesToUnits(calculated), requestedUnits: bottlesToUnits(requested),
      differenceUnits: bottlesToUnits(Math.abs(requested - calculated)),
      direction: requested === calculated ? 'none' : (requested > calculated ? 'increase' : 'decrease') };
  }
  var api = { BOTTLES_PER_PACK: 10, PACKS_PER_CASE: 5, BOTTLES_PER_CASE: 50,
    unitsToBottles: unitsToBottles, bottlesToUnits: bottlesToUnits, recalculate: recalculate, normalizeLedger: normalizeLedger,
    compareRecords: compareRecords, timeOf: timeOf, prepareLedger: prepareLedger, previewAdjustment: previewAdjustment };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; module.exports.MaxoneUnitStock = root.MaxoneUnitStock; }
  if (root) root.MaxoneStock = api;
}(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));

/* Independent-unit validation. Never converts cases, packs, and bottles. */
(function(root){'use strict';function n(v){if(v===null||v===undefined||v==='')return null;var x=Number(v);if(!isFinite(x)||x<0||Math.floor(x)!==x)throw new Error('จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');return x;}root.MaxoneUnitStock={number:n};}(typeof window!=='undefined'?window:this));
