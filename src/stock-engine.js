/* MAXONE independent stock-unit helpers. ES5-compatible for older Safari. */
(function (root) {
  'use strict';
  function timeOf(record) {
    if (record.transactionAt) {
      var parsed = typeof record.transactionAt === 'number' ? record.transactionAt : Date.parse(record.transactionAt);
      if (isFinite(parsed)) return parsed;
    }
    if (record.date) {
      var fallback = Date.parse(String(record.date) + 'T' + String(record.time || '00:00') + ':00');
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
  function toInt(value, fieldName) {
    var n = Number(value);
    if (!isFinite(n) || Math.floor(n) !== n || n < 0) throw new Error((fieldName || 'จำนวน') + ' ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
    return n;
  }
  function calculateClosingByUnit(previousClosing, sales) {
    var keys = ['cases', 'packs', 'bottles'], result = {};
    keys.forEach(function (key) {
      var previous = previousClosing && previousClosing[key];
      var sold = sales && sales[key];
      if (previous === null || previous === undefined || previous === '' || sold === null || sold === undefined || sold === '') {
        result[key] = null;
        return;
      }
      var closing = toInt(previous, key) - toInt(sold, key);
      if (closing < 0) throw new Error('ยอดขายเกิน Stock ' + key);
      result[key] = closing;
    });
    return result;
  }
  function formatUnitTotals(value) {
    var labels = { cases: 'ลัง', packs: 'แพ็ค', bottles: 'ขวด' }, keys = ['cases', 'packs', 'bottles'], parts = [];
    keys.forEach(function (key) {
      var amount = Number(value && value[key]);
      if (isFinite(amount) && amount !== 0) parts.push(amount + ' ' + labels[key]);
    });
    return parts.join(' ');
  }
  var api = { compareRecords: compareRecords, timeOf: timeOf,
    calculateClosingByUnit: calculateClosingByUnit, formatUnitTotals: formatUnitTotals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MaxoneStock = api;
}(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));

(function (root) {
  'use strict';
  function number(value) {
    if (value === null || value === undefined || value === '') return null;
    var n = Number(value);
    if (!isFinite(n) || n < 0 || Math.floor(n) !== n) throw new Error('จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
    return n;
  }
  root.MaxoneUnitStock = { number: number };
  if (typeof module !== 'undefined' && module.exports) module.exports.MaxoneUnitStock = root.MaxoneUnitStock;
}(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
