'use strict';
var assert = require('assert');
var S = require('../src/stock-engine.js');
function equal(actual, expected, message) { assert.deepStrictEqual(actual, expected, message); }

equal(S.calculateClosingByUnit({ cases: 30, packs: 20, bottles: 5 }, { cases: 4, packs: 3, bottles: 2 }),
  { cases: 26, packs: 17, bottles: 3 }, 'closing stock subtracts sales independently in each unit');
equal(S.calculateClosingByUnit({ cases: 30, packs: null, bottles: 5 }, { cases: 4, packs: 3, bottles: 0 }),
  { cases: 26, packs: null, bottles: 5 }, 'a missing unit balance stays blank without converting other units');
equal(S.calculateClosingByUnit(null, { cases: 4, packs: 3, bottles: 2 }),
  { cases: null, packs: null, bottles: null }, 'automatic balances stay blank when there is no earlier closing balance');
assert.throws(function () { S.calculateClosingByUnit({ cases: 1 }, { cases: 2 }); }, /ยอดขายเกิน Stock/);
equal(S.formatUnitTotals({ cases: 30, packs: 20, bottles: 0 }), '30 ลัง 20 แพ็ค', 'unit totals omit zero units');
equal(S.formatUnitTotals({ cases: 0, packs: 0, bottles: 0 }), '', 'all-zero unit totals are blank');
assert(S.compareRecords({ date: '2026-11-23', time: '08:00' }, { date: '2026-11-24', time: '08:00' }) < 0,
  'report records sort chronologically');
console.log('PASS: 7 independent stock, total, and ordering assertions');
