(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var shops = [];
  var records = [];
  var editId = null;
  var override = false;
  var allMode = false;
  var opening = 0;
  var session = null;
  var syncBusy = false;
  var API_URL = 'https://dbyedilzgeuksjznnyhe.supabase.co';
  var API_KEY = 'sb_publishable_5U54VRoyr5LtWdEBh86J5A_rWxtMfzn';

  function uuid() {
    var cryptoObject = window.crypto || window.msCrypto;
    if (cryptoObject && cryptoObject.randomUUID) return cryptoObject.randomUUID();
    var d = new Date().getTime();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (d + Math.random() * 16) % 16 | 0;
      d = Math.floor(d / 16);
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function iso() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function thaiDate(s) {
    if (!s) return 'ไม่ระบุ';
    var a = s.split('-');
    return a[2] + '/' + a[1] + '/' + (Number(a[0]) + 543);
  }
  function toIsoTime(ms) { return new Date(ms || Date.now()).toISOString(); }
  function parseTime(value) { var t = Date.parse(value || ''); return isNaN(t) ? 0 : t; }
  function setStatus(message, bad) {
    $('status').textContent = message;
    $('status').className = bad ? 'status-error' : '';
  }
  function updateNetworkStatus() {
    var online = navigator.onLine;
    $('networkStatus').textContent = online ? '● ออนไลน์' : '● ออฟไลน์';
    $('networkStatus').className = online ? 'network-online' : 'network-offline';
  }
  function number(id) {
    var raw = $(id).value;
    if (raw === '') return 0;
    var value = Number(raw);
    if (!isFinite(value) || Math.floor(value) !== value || value < 0) throw new Error('จำนวนสินค้าแต่ละช่องต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
    return value;
  }
  function units(prefix) {
    return { cases: number(prefix + 'c'), packs: number(prefix + 'p'), bottles: number(prefix + 'b') };
  }
  function setUnits(prefix, value) {
    $(prefix + 'c').value = value.cases;
    $(prefix + 'p').value = value.packs;
    $(prefix + 'b').value = value.bottles;
  }
  function unitText(value) { return value.cases + ' ลัง ' + value.packs + ' แพ็ค ' + value.bottles + ' ขวด'; }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shopName(shopId) {
    var found = shops.filter(function (shop) { return shop.id === shopId; })[0];
    return found ? found.name : 'ไม่พบร้าน';
  }
  function transactionTimestamp(date, time) {
    var parsed = Date.parse(String(date || '') + 'T' + String(time || '00:00') + ':00');
    if (!isFinite(parsed)) throw new Error('วันที่หรือเวลาทำรายการไม่ถูกต้อง');
    return parsed;
  }
  function openingFor(date, time, currentRecord) {
    var target = { date: date, time: time, transactionAt: transactionTimestamp(date, time), createdAt: currentRecord ? currentRecord.createdAt : Date.now(), id: currentRecord ? currentRecord.id : 'new-record', openingSeedBottles: currentRecord ? currentRecord.openingSeedBottles : 0 };
    var previous = records.filter(function (record) {
      if (currentRecord && record.id === currentRecord.id) return false;
      return MaxoneStock.compareRecords(record, target) < 0;
    }).sort(MaxoneStock.compareRecords);
    if (previous.length) return { value: Number(previous[previous.length - 1].closingBottles || 0), first: false };
    return { value: currentRecord ? Number(currentRecord.openingSeedBottles || 0) : 0, first: true };
  }
  function refresh() {
    return Promise.all([MDB.all('shops'), MDB.all('records')]).then(function (data) {
      shops = data[0];
      records = data[1];
      var select = $('shop');
      var selected = select.value;
      select.innerHTML = '<option value="">เลือกร้านค้า</option>';
      shops.sort(function (a, b) { return a.name.localeCompare(b.name, 'th'); }).forEach(function (shop) {
        select.add(new Option(shop.name, shop.id));
      });
      if (selected) select.value = selected;
      history();
    });
  }
  /* One-time compatibility migration for IndexedDB/Cloud rows created by the old
     per-shop stock model. Rebuild every saved balance in global timestamp order. */
  function rebuildGlobalLedger() {
    return MDB.all('records').then(function (stored) {
      var normalized = MaxoneStock.normalizeLedger(stored);
      var recalculated = MaxoneStock.recalculate(normalized);
      var changed = false;
      var rows = recalculated.map(function (result) {
        var original = stored.filter(function (item) { return item.id === result.id; })[0] || {};
        var copy = {};
        Object.keys(result).forEach(function (key) { copy[key] = result[key]; });
        if (Number(original.openingBottles || 0) !== result.openingBottles ||
            Number(original.closingBottles || 0) !== result.closingBottles ||
            Number(original.openingSeedBottles || 0) !== Number(result.openingSeedBottles || 0) ||
            Number(original.adjustmentBottles || 0) !== result.adjustmentBottles) changed = true;
        return copy;
      });
      return MDB.write('records', rows).then(function () {
        records = rows;
        return { changed: changed, records: rows };
      });
    });
  }

  function updateOpening() {
    var current=records.filter(function(r){return r.id===editId;})[0], prev=records.filter(function(r){return r.id!==editId&&(r.date+String(r.time||'00:00'))<=($('date').value+String($('time').value||'00:00'));}).sort(function(a,b){return String(a.date+a.time).localeCompare(String(b.date+b.time));}).pop();
    ['cases','packs','bottles'].forEach(function(k){var id=k==='cases'?'c':k==='packs'?'p':'b',key=k==='bottles'?'loose_bottles':k,v=prev?prev['closing_'+key]:(current?current['opening_'+key]:null);$('o'+id).value=v==null?'':v;if(current)$('s'+id).value=current['opening_'+key]==null?'':current['opening_'+key];});
    $('seedBox').classList.toggle('hidden',!!prev);$('firstNote').classList.toggle('hidden',!!prev);calculate();
  }
  function getCalculation() {
    var keys=['cases','packs','bottles'],ids=['c','p','b'],r={opening:{},sales:{},closing:{},enabled:$('calcEnabled').checked};
    keys.forEach(function(k,i){var key=k==='bottles'?'loose_bottles':k;r.opening[k]=MaxoneUnitStock.number($('o'+ids[i]).value);if(r.opening[k]===null&&!$('seedBox').classList.contains('hidden'))r.opening[k]=MaxoneUnitStock.number($('s'+ids[i]).value);r.sales[k]=MaxoneUnitStock.number($('v'+ids[i]).value);r.closing[k]=r.enabled?(r.opening[k]===null||r.sales[k]===null?null:r.opening[k]-r.sales[k]):(override?MaxoneUnitStock.number($('x'+ids[i]).value):null);if(r.enabled&&r.closing[k]!==null&&r.closing[k]<0)throw new Error('ยอดขายเกิน Stock '+k);});return r;
  }
  function renderReview(calc,closingUnits){$('review').innerHTML='<div><span>ร้านค้า</span><b>'+escapeHtml(shopName($('shop').value))+'</b></div><div><span>ยอดขาย</span><b>'+unitText({cases:calc.sales.cases||0,packs:calc.sales.packs||0,bottles:calc.sales.bottles||0})+'</b></div><div><span>Stock คงเหลือ</span><b>'+unitText({cases:closingUnits.cases||0,packs:closingUnits.packs||0,bottles:closingUnits.bottles||0})+'</b></div><div><span>วันหมดอายุ</span><b>'+escapeHtml(thaiDate($('expiry').value))+'</b></div>';}
  function calculate(){try{var c=getCalculation(),v=c.closing;$('cc').textContent=v.cases==null?'':v.cases;$('cp').textContent=v.packs==null?'':v.packs;$('cb').textContent=v.bottles==null?'':v.bottles;$('delta').textContent=c.enabled?'คำนวณแยกหน่วย':'ปิดการคำนวณอัตโนมัติ';renderReview(c,v);$('error').classList.add('hidden');return true;}catch(e){$('error').textContent=e.message;$('error').classList.remove('hidden');return false;}}
  function resetForm() {
    editId = null;
    override = false;
    $('shop').disabled = false;
    $('addShop').disabled = false;
    $('rid').value = '';
    $('date').value = iso();
    var now = new Date();
    $('time').value = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    $('expiry').value = '';
    $('shop').value = '';
    ['fc','fp','fb','vc','vp','vb','sc','sp','sb','xc','xp','xb'].forEach(function (id) { $(id).value = 0; });
    $('overrideBox').classList.add('hidden');
    $('editBalance').textContent = 'แก้ไขยอดสต๊อกคงเหลือ';
    $('save').textContent = 'บันทึกยอดขาย';
    updateOpening();
  }
  function cloudQueueDelete(recordId) {
    return { id: 'delete-record-' + recordId, op: 'delete', entity: 'record', entityId: recordId, createdAt: Date.now() };
  }
  function persistChange(candidate,oldRecord,action){
    var affected=records.filter(function(r){return r.id!==candidate.id;});if(action!=='delete')affected.push(candidate);affected.sort(function(a,b){return String(a.date+a.time).localeCompare(String(b.date+b.time));});
    var prev=null;affected.forEach(function(r){if(r.stockCalculationEnabled){['cases','packs','bottles'].forEach(function(k){var key=k==='bottles'?'loose_bottles':k,o=prev?prev['closing_'+key]:r['opening_'+key],v=r['sales_'+key];r['opening_'+key]=o;r['closing_'+key]=o==null||v==null?null:o-v;});}prev=r;});
    var audit={id:uuid(),recordId:candidate.id,action:action,beforeData:oldRecord||null,afterData:action==='delete'?null:candidate,createdAt:Date.now()},queue=action==='delete'?cloudQueueDelete(candidate.id):null;
    return MDB.applyRecordChange(affected,action==='delete'?candidate.id:null,audit,queue).then(refresh);
  }
  function saveRecord(event){event.preventDefault();try{var shopId=$('shop').value;if(!shopId)throw new Error('กรุณาเลือกร้านค้า');var c=getCalculation(),old=records.filter(function(r){return r.id===editId;})[0]||null,now=Date.now(),row={id:editId||uuid(),shopId:shopId,date:$('date').value,time:$('time').value,transactionAt:transactionTimestamp($('date').value,$('time').value),createdAt:old?old.createdAt:now,updatedAt:now,expiryDate:$('expiry').value||null,stockCalculationEnabled:c.enabled,opening_cases:c.opening.cases,opening_packs:c.opening.packs,opening_loose_bottles:c.opening.bottles,sales_cases:c.sales.cases,sales_packs:c.sales.packs,sales_loose_bottles:c.sales.bottles,closing_cases:c.closing.cases,closing_packs:c.closing.packs,closing_loose_bottles:c.closing.bottles,openingSeedBottles:0,refillBottles:0,salesBottles:0,closingBottles:0,sourceType:'app'};persistChange(row,old,old?'update':'create').then(function(){resetForm();setStatus('● บันทึกในเครื่องแล้ว',false);if(session&&navigator.onLine)syncAll();}).catch(showError);}catch(e){showError(e);}}
  function showError(error) {
    $('error').textContent = error && error.message ? error.message : String(error);
    $('error').classList.remove('hidden');
    setStatus('● เกิดข้อผิดพลาด', true);
  }
  function loadRecord(recordId) {
    var record = records.filter(function (item) { return item.id === recordId; })[0];
    if (!record) return;
    editId = record.id;
    $('shop').disabled = true;
    $('addShop').disabled = true;
    $('date').value = record.date;
    $('time').value = record.time || (record.transactionAt ? (function (d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }(new Date(record.transactionAt))) : '00:00');
    $('expiry').value = record.expiryDate || '';
    $('shop').value = record.shopId;
    setUnits('f', MaxoneStock.bottlesToUnits(record.refillBottles));
    setUnits('v', MaxoneStock.bottlesToUnits(record.salesBottles));
    updateOpening();
    override = record.closingOverrideBottles !== null && record.closingOverrideBottles !== undefined;
    $('overrideBox').classList.toggle('hidden', !override);
    if (override) setUnits('x', MaxoneStock.bottlesToUnits(record.closingOverrideBottles));
    $('editBalance').textContent = override ? 'ยกเลิกแก้ไขยอด' : 'แก้ไขยอดสต๊อกคงเหลือ';
    $('save').textContent = 'บันทึกการแก้ไข';
    calculate();
    document.querySelector('[data-tab="entry"]').click();
    window.scrollTo(0, 0);
  }
  function history() {
    var cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 59);
    var cutoff = cutoffDate.getFullYear() + '-' + ('0' + (cutoffDate.getMonth() + 1)).slice(-2) + '-' + ('0' + cutoffDate.getDate()).slice(-2);
    var query = $('search').value.toLowerCase();
    var visible = records.filter(function (record) {
      return (allMode || record.date >= cutoff) && shopName(record.shopId).toLowerCase().indexOf(query) >= 0;
    }).sort(function (a, b) { return MaxoneStock.compareRecords(b, a); });
    $('range').textContent = (allMode ? 'รายการทั้งหมด' : 'ย้อนหลัง 60 วัน') + ' · ' + visible.length + ' รายการ';
    $('list').innerHTML = visible.length ? visible.map(function (record) {
      return '<article class="history-card"><small>' + escapeHtml(thaiDate(record.date)) + ' · ' + escapeHtml(record.time || '00:00') + '</small><strong>' + escapeHtml(shopName(record.shopId)) + '</strong>' +
        '<div class="hint">ขาย ' + unitText({cases:record.sales_cases||0,packs:record.sales_packs||0,bottles:record.sales_loose_bottles||0}) + '<br>คงเหลือ ' + unitText({cases:record.closing_cases||0,packs:record.closing_packs||0,bottles:record.closing_loose_bottles||0}) + '</div>' +
        '<div class="history-actions"><button type="button" data-edit="' + escapeHtml(record.id) + '">แก้ไข</button><button type="button" class="del" data-del="' + escapeHtml(record.id) + '">ลบ</button></div></article>';
    }).join('') : '<div class="empty">ยังไม่มีรายการ</div>';
  }
  function deleteRecord(recordId) {
    var record = records.filter(function (item) { return item.id === recordId; })[0];
    if (!record || !window.confirm('ลบรายการ ' + thaiDate(record.date) + ' ร้าน ' + shopName(record.shopId) + '? ระบบจะคำนวณ Stock กลางของรายการถัดไปทั้งหมดใหม่')) return;
    persistChange(record, record, 'delete').then(function () {
      setStatus('● ลบรายการในเครื่องแล้ว', false);
      if (session && navigator.onLine) syncAll();
    }).catch(showError);
  }
  function addShop() {
    var name = window.prompt('ชื่อร้านใหม่');
    if (!name || !name.replace(/^\s+|\s+$/g, '')) return;
    name = name.replace(/^\s+|\s+$/g, '');
    if (shops.some(function (shop) { return shop.name.toLowerCase() === name.toLowerCase(); })) {
      window.alert('มีร้านนี้อยู่แล้ว'); return;
    }
    var now = Date.now();
    var shop = { id: uuid(), name: name, isActive: true, createdAt: now, updatedAt: now };
    MDB.write('shops', shop).then(function () {
      return refresh().then(function () { $('shop').value = shop.id; updateOpening(); });
    }).then(function () {
      if (session && navigator.onLine) syncAll();
    }).catch(showError);
  }

  function openShopEditor() {
    $('shopEditor').classList.remove('hidden');
    $('shopSearch').value = '';
    $('shopEditName').value = '';
    $('shopEditId').value = '';
    renderShopChoices();
    $('shopSearch').focus();
  }
  function closeShopEditor() { $('shopEditor').classList.add('hidden'); }
  function renderShopChoices() {
    var query = $('shopSearch').value.replace(/^\\s+|\\s+$/g, '').toLowerCase();
    var found = shops.filter(function (shop) { return shop.name.toLowerCase().indexOf(query) >= 0; })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'th'); });
    $('shopChoices').innerHTML = found.length ? found.map(function (shop) {
      return '<div class="shop-choice-row' + (shop.id === $('shopEditId').value ? ' selected' : '') + '">' +
        '<button type="button" class="shop-choice-delete" data-shop-delete="' + escapeHtml(shop.id) + '" aria-label="ลบร้าน ' + escapeHtml(shop.name) + '" title="ลบร้านค้า">ลบ</button>' +
        '<button type="button" class="shop-choice-select" data-shop-choice="' + escapeHtml(shop.id) + '">' +
        '<span>' + escapeHtml(shop.name) + '</span><small>' + (shop.id === $('shop').value ? 'ร้านที่เลือกอยู่' : 'เลือกเพื่อแก้ไข') + '</small></button></div>';
    }).join('') : '<div class="empty">ไม่พบร้านค้าที่ค้นหา</div>';
  }
  function deleteShop(shopId) {
    var shop = shops.filter(function (item) { return item.id === shopId; })[0];
    if (!shop) return;
    if (!window.confirm('ยืนยันลบร้านค้า "' + shop.name + '"? ร้านค้าที่มีประวัติการขายจะไม่สามารถลบได้')) return;
    if (!navigator.onLine || !session) {
      $('shopEditMessage').textContent = 'การลบร้านค้าต้องออนไลน์และเข้าสู่ระบบ Cloud ก่อน เพื่อป้องกันข้อมูลซิงก์กลับมา';
      return;
    }
    $('shopEditMessage').textContent = 'กำลังตรวจสอบข้อมูลร้านค้า...';
    syncAll().then(function () {
      return refresh();
    }).then(function () {
      var hasRecords = records.some(function (record) { return record.shopId === shopId; });
      if (hasRecords) throw new Error('ร้านนี้มีประวัติการขายอยู่ จึงไม่สามารถลบได้ เพื่อรักษาประวัติและ Stock Ledger');
      return validSession().then(function (active) {
        if (!active) throw new Error('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
        return dbRequest('shops', 'DELETE', 'id=eq.' + encodeURIComponent(shopId), null, active, 'return=minimal');
      });
    }).then(function () {
      return MDB.del('shops', shopId);
    }).then(function () {
      if ($('shop').value === shopId) $('shop').value = '';
      $('shopEditId').value = '';
      $('shopEditName').value = '';
      return refresh();
    }).then(function () {
      $('shopEditMessage').textContent = 'ลบร้านค้าเรียบร้อยแล้ว';
      setStatus('● ลบร้านค้าแล้ว', false);
      renderShopChoices();
      updateOpening();
    }).catch(function (error) {
      $('shopEditMessage').textContent = error.message || 'ลบร้านค้าไม่สำเร็จ';
    });
  }
  function selectShopForEdit(shopId) {
    var shop = shops.filter(function (item) { return item.id === shopId; })[0];
    if (!shop) return;
    $('shopEditId').value = shop.id;
    $('shopEditName').value = shop.name;
    renderShopChoices();
    $('shopEditName').focus();
  }
  function saveShopEdit() {
    var shopId = $('shopEditId').value;
    var shop = shops.filter(function (item) { return item.id === shopId; })[0];
    var name = $('shopEditName').value.replace(/^\\s+|\\s+$/g, '');
    if (!shop) { $('shopEditMessage').textContent = 'กรุณาเลือกร้านค้าที่ต้องการแก้ไข'; return; }
    if (!name) { $('shopEditMessage').textContent = 'กรุณากรอกชื่อร้าน'; return; }
    if (shops.some(function (item) { return item.id !== shopId && item.name.toLowerCase() === name.toLowerCase(); })) {
      $('shopEditMessage').textContent = 'มีชื่อร้านนี้อยู่แล้ว'; return;
    }
    shop.name = name;
    shop.updatedAt = Date.now();
    MDB.write('shops', shop).then(function () {
      return refresh();
    }).then(function () {
      $('shop').value = shopId;
      updateOpening();
      closeShopEditor();
      setStatus('● แก้ไขชื่อร้านในเครื่องแล้ว', false);
      if (session && navigator.onLine) syncAll();
    }).catch(showError);
  }

  function suggestWeek() {
    var date = new Date();
    var daysBack = (date.getDay() + 1) % 7;
    if (!daysBack) daysBack = 7;
    var saturday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysBack);
    var monday = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() - 5);
    function format(value) {
      return value.getFullYear() + '-' + ('0' + (value.getMonth() + 1)).slice(-2) + '-' + ('0' + value.getDate()).slice(-2);
    }
    $('from').value = format(monday);
    $('to').value = format(saturday);
  }
  function excelDate(isoDate) {
    var parts = isoDate.split('-');
    return new Date(Number(parts[0]) + 543, Number(parts[1]) - 1, Number(parts[2]));
  }
  function exportExcel() {
    var from = $('from').value;
    var to = $('to').value;
    if (!from || !to || from > to) { window.alert('กรุณาเลือกช่วงวันที่ให้ถูกต้อง'); return; }
    if (!window.XLSX) { window.alert('ยังไม่มีไลบรารี Excel ในเครื่อง กรุณาเปิดแอปออนไลน์หนึ่งครั้งแล้วลองใหม่'); return; }
    var rows = records.filter(function (record) { return record.date >= from && record.date <= to; }).sort(MaxoneStock.compareRecords);
    if (!rows.length) { window.alert('ไม่พบข้อมูลในช่วงวันที่เลือก'); return; }
    var main = [
      ['แบบฟอร์มสรุปยอดขายทีมหน่วยรถ'],
      ['ทีม.....หมอก.อาม กุ๊กไก่ อาชิ.........เขต..........ภาคกลาง.......................................'],
      ['วัน-เดือน-ปี','ชื่อร้าน/จังหวัด','Stock ตั้งต้น','','','สต๊อกคงเหลือ','','','วันหมดอายุ','ยอดขาย','',''],
      ['','','ลัง','แพ็ค','ขวด','ลัง','แพ็ค','ขวด','','ลัง','แพ็ก','ขวด']
    ];
    var detail = [['วันที่','เวลา','ชื่อร้าน','เติมลัง','เติมแพ็ค','เติมขวด','ปรับสต๊อก (ขวด)','ยอดคงเหลือก่อนปรับ (ขวด)','ยอดคงเหลือจริง (ขวด)','ประเภทการบันทึก']];
    rows.forEach(function (record) {
      var start = MaxoneStock.bottlesToUnits(record.openingBottles || 0);
      var close = MaxoneStock.bottlesToUnits(record.closingBottles || 0);
      var sales = MaxoneStock.bottlesToUnits(record.salesBottles || 0);
      var refill = MaxoneStock.bottlesToUnits(record.refillBottles || 0);
      main.push([excelDate(record.date), shopName(record.shopId), start.cases, start.packs, start.bottles, close.cases, close.packs, close.bottles, record.expiryDate ? excelDate(record.expiryDate) : '', sales.cases, sales.packs, sales.bottles]);
      detail.push([excelDate(record.date), record.time || '00:00', shopName(record.shopId), refill.cases, refill.packs, refill.bottles, record.adjustmentBottles || 0, record.calculatedClosingBottles || 0, record.closingBottles || 0, record.sourceType || 'app']);
    });
    var book = XLSX.utils.book_new();
    var sheet = XLSX.utils.aoa_to_sheet(main);
    sheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
      { s: { r: 2, c: 0 }, e: { r: 3, c: 0 } }, { s: { r: 2, c: 1 }, e: { r: 3, c: 1 } },
      { s: { r: 2, c: 2 }, e: { r: 2, c: 4 } }, { s: { r: 2, c: 5 }, e: { r: 2, c: 7 } },
      { s: { r: 2, c: 8 }, e: { r: 3, c: 8 } }, { s: { r: 2, c: 9 }, e: { r: 2, c: 11 } }
    ];
    sheet['!cols'] = [{ wch: 15 },{ wch: 24 },{ wch: 10 },{ wch: 10 },{ wch: 10 },{ wch: 10 },{ wch: 10 },{ wch: 10 },{ wch: 15 },{ wch: 10 },{ wch: 10 },{ wch: 10 }];
    rows.forEach(function (record, index) {
      var rowNumber = index + 5;
      ['A','I'].forEach(function (col) {
        var cell = sheet[col + rowNumber];
        if (cell && cell.v) cell.z = 'd/m/yyyy';
      });
    });
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    var detailSheet = XLSX.utils.aoa_to_sheet(detail);
    detailSheet['!cols'] = [{ wch: 15 },{ wch: 10 },{ wch: 24 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 18 },{ wch: 24 },{ wch: 22 },{ wch: 18 }];
    XLSX.utils.book_append_sheet(book, detailSheet, 'รายละเอียดเพิ่มเติม');
    XLSX.writeFile(book, 'MAXONE_Sales_' + from + '_to_' + to + '.xlsx');
  }

  /* Small XHR client: avoids modern JS syntax in the app shell for older iOS Safari. */
  function request(path, method, body, token, extraHeaders) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, API_URL + path, true);
      xhr.setRequestHeader('apikey', API_KEY);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      if (extraHeaders) Object.keys(extraHeaders).forEach(function (key) { xhr.setRequestHeader(key, extraHeaders[key]); });
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        var data = null;
        try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch (ignore) { data = xhr.responseText; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else {
          var message = data && (data.msg || data.message || data.error_description || data.error) || ('HTTP ' + xhr.status);
          reject(new Error(message));
        }
      };
      xhr.onerror = function () { reject(new Error('เชื่อมต่อเครือข่ายไม่ได้')); };
      xhr.ontimeout = function () { reject(new Error('หมดเวลารอเซิร์ฟเวอร์')); };
      xhr.timeout = 20000;
      xhr.send(body == null ? null : JSON.stringify(body));
    });
  }
  function loadSession() {
    try { session = JSON.parse(localStorage.getItem('maxone-auth-session') || 'null'); } catch (ignore) { session = null; }
    return session;
  }
  function saveSession(value) {
    session = value;
    if (value) localStorage.setItem('maxone-auth-session', JSON.stringify(value));
    else localStorage.removeItem('maxone-auth-session');
    renderAccount();
  }
  function validSession() {
    if (!session || !session.access_token) return Promise.resolve(null);
    if (session.expires_at && session.expires_at * 1000 > Date.now() + 60000) return Promise.resolve(session);
    return request('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: session.refresh_token }, null).then(function (data) {
      data.expires_at = Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600);
      saveSession(data);
      return data;
    }).catch(function () { saveSession(null); return null; });
  }
  function authRequest(path, body) { return request(path, 'POST', body, null); }
  function renderAccount() {
    var user = session && session.user;
    $('accountButton').textContent = user ? 'บัญชี: ' + (user.email || 'เชื่อมต่อแล้ว') : 'เข้าสู่ระบบ / ซิงก์';
    $('accountEmail').textContent = user ? user.email : 'ยังไม่ได้เชื่อมต่อ Cloud';
    $('signOut').classList.toggle('hidden', !user);
    $('authActions').classList.toggle('hidden', !!user);
    $('syncNow').classList.toggle('hidden', !user);
  }
  function openAuth() { $('authModal').classList.remove('hidden'); }
  function closeAuth() { $('authModal').classList.add('hidden'); }
  function authMessage(message, bad) {
    $('authMessage').textContent = message;
    $('authMessage').className = bad ? 'error' : 'hint';
  }
  function signUp() {
    var email = $('authEmail').value.replace(/^\s+|\s+$/g, '');
    var password = $('authPassword').value;
    if (!email || password.length < 8) { authMessage('กรอกอีเมลและรหัสผ่านอย่างน้อย 8 ตัวอักษร', true); return; }
    authMessage('กำลังสมัครบัญชี...', false);
    authRequest('/auth/v1/signup?redirect_to=' + encodeURIComponent(location.origin + '/'), { email: email, password: password }).then(function (data) {
      if (data && data.access_token) {
        data.expires_at = Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600);
        saveSession(data);
        authMessage('สมัครและเข้าสู่ระบบแล้ว กำลังซิงก์ข้อมูล', false);
        return syncAll();
      }
      authMessage('ส่งคำขอสมัครแล้ว กรุณาตรวจอีเมลเพื่อยืนยันบัญชี จากนั้นกลับมาเข้าสู่ระบบ', false);
    }).catch(function (error) { authMessage(error.message, true); });
  }
  function signIn() {
    var email = $('authEmail').value.replace(/^\s+|\s+$/g, '');
    var password = $('authPassword').value;
    if (!email || !password) { authMessage('กรุณากรอกอีเมลและรหัสผ่าน', true); return; }
    authMessage('กำลังเข้าสู่ระบบ...', false);
    authRequest('/auth/v1/token?grant_type=password', { email: email, password: password }).then(function (data) {
      data.expires_at = Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600);
      saveSession(data);
      authMessage('เข้าสู่ระบบแล้ว กำลังซิงก์ข้อมูล', false);
      return syncAll();
    }).then(function (synced) { if (synced) authMessage('ซิงก์ข้อมูลเรียบร้อย', false); }).catch(function (error) { authMessage(error.message, true); });
  }
  function signOut() {
    validSession().then(function (active) {
      if (active) return request('/auth/v1/logout', 'POST', {}, active.access_token);
    }).catch(function () {}).then(function () {
      saveSession(null);
      setStatus('● บันทึกในเครื่องเท่านั้น', false);
      closeAuth();
    });
  }
  function dbRequest(table, method, query, body, active, prefer) {
    return request('/rest/v1/' + table + (query ? '?' + query : ''), method, body, active.access_token,
      prefer ? { Prefer: prefer } : null);
  }
  function localRecordToCloud(record, userId) {
    var refill = MaxoneStock.bottlesToUnits(record.refillBottles || 0);
    var sales = MaxoneStock.bottlesToUnits(record.salesBottles || 0);
    return {
      id: record.id, shop_id: record.shopId, sale_date: record.date, transaction_at: toIsoTime(record.transactionAt || transactionTimestamp(record.date, record.time)), sale_time: record.time || '00:00', entry_no: 1,
      opening_cases: record.opening_cases, opening_packs: record.opening_packs, opening_loose_bottles: record.opening_loose_bottles,
      closing_cases: record.closing_cases, closing_packs: record.closing_packs, closing_loose_bottles: record.closing_loose_bottles,
      sales_cases: record.sales_cases, sales_packs: record.sales_packs, sales_loose_bottles: record.sales_loose_bottles,
      stock_calculation_enabled: !!record.stockCalculationEnabled,
      opening_seed_bottles: record.openingSeedBottles || 0, opening_bottles: record.openingBottles || 0,
      refill_crates: refill.cases, refill_packs: refill.packs, refill_bottles: refill.bottles,
      sales_crates: sales.cases, sales_packs: record.sales_packs, sales_bottles: 0,
      stock_adjustment_bottles: record.adjustmentBottles || 0,
      adjustment_reason: record.adjustmentBottles ? 'แก้ไขยอดคงเหลือจากหน้าบันทึก' : null,
      expiry_date: record.expiryDate || null, created_by: userId,
      created_at: toIsoTime(record.createdAt), updated_at: toIsoTime(record.updatedAt || record.createdAt)
    };
  }
  function cloudRecordToLocal(row) {
    var refill = Number(row.refill_crates || 0) * 50 + Number(row.refill_packs || 0) * 10 + Number(row.refill_bottles || 0);
    var sales = Number(row.sales_crates || 0) * 50 + Number(row.sales_packs || 0) * 10 + Number(row.sales_bottles || 0);
    var calculated = Number(row.opening_bottles || 0) + refill - sales;
    var adjustment = Number(row.stock_adjustment_bottles || 0);
    return {
      id: row.id, shopId: row.shop_id, opening_cases:row.opening_cases, opening_packs:row.opening_packs, opening_loose_bottles:row.opening_loose_bottles, closing_cases:row.closing_cases, closing_packs:row.closing_packs, closing_loose_bottles:row.closing_loose_bottles, sales_cases:row.sales_cases, sales_packs:row.sales_packs, sales_loose_bottles:row.sales_loose_bottles, stockCalculationEnabled:!!row.stock_calculation_enabled, date: row.sale_date, time: row.sale_time || (row.transaction_at ? (function (d) { return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }(new Date(row.transaction_at))) : '00:00'), transactionAt: parseTime(row.transaction_at || row.created_at), sequence: 1,
      openingSeedBottles: Number(row.opening_seed_bottles || 0), openingBottles: Number(row.opening_bottles || 0),
      refillBottles: refill, salesBottles: sales, calculatedClosingBottles: calculated,
      adjustmentBottles: adjustment, closingBottles: Number(row.closing_bottles),
      closingOverrideBottles: adjustment ? calculated + adjustment : null,
      expiryDate: row.expiry_date || null, sourceType: 'app',
      createdAt: parseTime(row.created_at), updatedAt: parseTime(row.updated_at)
    };
  }
  function cloudShopToLocal(row) {
    return { id: row.id, name: row.name, isActive: true, createdAt: parseTime(row.created_at), updatedAt: parseTime(row.updated_at) };
  }
  function syncAll() {
    if (syncBusy) return Promise.resolve();
    if (!navigator.onLine) { setStatus('● ออฟไลน์: เก็บข้อมูลในเครื่อง', false); return Promise.resolve(); }
    syncBusy = true;
    setStatus('● กำลังซิงก์...', false);
    return validSession().then(function (active) {
      if (!active) throw new Error('กรุณาเข้าสู่ระบบก่อนซิงก์');
      var userId = active.user.id;
      return Promise.all([MDB.all('shops'), MDB.all('records'), MDB.all('syncQueue')]).then(function (local) {
        var localShops = local[0], localRecords = local[1], queue = local[2];
        var deletes = queue.filter(function (item) { return item.op === 'delete' && item.entity === 'record'; });
        var chain = Promise.resolve();
        deletes.forEach(function (item) {
          chain = chain.then(function () {
            var tombstone = { entity: 'record', entity_id: item.entityId, created_by: userId };
            return dbRequest('sync_tombstones', 'POST', 'on_conflict=created_by%2Centity%2Centity_id', [tombstone], active, 'resolution=merge-duplicates,return=minimal')
              .then(function () { return dbRequest('sales_records', 'DELETE', 'id=eq.' + encodeURIComponent(item.entityId), null, active, 'return=minimal'); });
          });
        });
        return chain.then(function () {
          return Promise.all([
            dbRequest('shops', 'GET', 'select=id,name,created_by,created_at,updated_at&order=created_at.asc', null, active),
            dbRequest('sales_records', 'GET', 'select=*&order=transaction_at.asc,created_at.asc,id.asc', null, active),
            dbRequest('sync_tombstones', 'GET', 'select=entity,entity_id,deleted_at&entity=eq.record', null, active)
          ]);
        }).then(function (remote) {
          var remoteShops = remote[0] || [], remoteRecords = remote[1] || [], tombstones = remote[2] || [];
          var deleted = {};
          tombstones.forEach(function (item) { deleted[item.entity_id] = true; });
          var pendingDeleteIds = {};
          deletes.forEach(function (item) { pendingDeleteIds[item.entityId] = true; });
          var shopMap = {}, shopNameMap = {}, recordMap = {};
          remoteShops.forEach(function (row) { shopMap[row.id] = row; shopNameMap[String(row.name || '').toLowerCase()] = row; });
          remoteRecords.forEach(function (row) { if (!deleted[row.id]) recordMap[row.id] = row; });
          var work = Promise.resolve();
          var remappedShops = false;
          localShops.forEach(function (shop) {
            work = work.then(function () {
              var cloud = shopMap[shop.id];
              if (!cloud && shopNameMap[String(shop.name || '').toLowerCase()]) {
                var canonical = shopNameMap[String(shop.name || '').toLowerCase()];
                var previousId = shop.id;
                shop.id = canonical.id;
                shop.name = canonical.name;
                shop.createdAt = parseTime(canonical.created_at);
                shop.updatedAt = parseTime(canonical.updated_at);
                localRecords.forEach(function (record) { if (record.shopId === previousId) record.shopId = canonical.id; });
                remappedShops = true;
                return MDB.del('shops', previousId).then(function () { return MDB.write('shops', cloudShopToLocal(canonical)); });
              }
              if (!cloud || Number(shop.updatedAt || shop.createdAt || 0) > parseTime(cloud.updated_at)) {
                return dbRequest('shops', 'POST', 'on_conflict=id', [{ id: shop.id, name: shop.name, created_by: userId, created_at: toIsoTime(shop.createdAt), updated_at: toIsoTime(shop.updatedAt || shop.createdAt) }], active, 'resolution=merge-duplicates,return=minimal');
              }
              return MDB.write('shops', cloudShopToLocal(cloud));
            });
          });
          work = work.then(function () { return remappedShops ? MDB.write('records', localRecords) : null; });
          remoteShops.forEach(function (row) {
            if (!localShops.some(function (shop) { return shop.id === row.id; })) work = work.then(function () { return MDB.write('shops', cloudShopToLocal(row)); });
          });
          localRecords.forEach(function (record) {
            work = work.then(function () {
              if (deleted[record.id] || pendingDeleteIds[record.id]) return MDB.del('records', record.id);
              var cloud = recordMap[record.id];
              if (!cloud || Number(record.updatedAt || record.createdAt || 0) > parseTime(cloud.updated_at)) {
                return dbRequest('sales_records', 'POST', 'on_conflict=id', [localRecordToCloud(record, userId)], active, 'resolution=merge-duplicates,return=minimal');
              }
              return MDB.write('records', cloudRecordToLocal(cloud));
            });
          });
          remoteRecords.forEach(function (row) {
            if (!deleted[row.id] && !localRecords.some(function (record) { return record.id === row.id; })) {
              work = work.then(function () { return MDB.write('records', cloudRecordToLocal(row)); });
            }
          });
          return work.then(function () {
            var cleanup = deletes.map(function (item) { return MDB.del('syncQueue', item.id); });
            return Promise.all(cleanup);
          }).then(function () {
            /* Rebuild legacy cloud/local balances globally after merge, then publish the
               corrected opening/closing values back to Cloud for every event. */
            return rebuildGlobalLedger().then(function (result) {
              var corrected = result.records;
              var writes = corrected.map(function (record) {
                return dbRequest('sales_records', 'POST', 'on_conflict=id', [localRecordToCloud(record, userId)], active,
                  'resolution=merge-duplicates,return=minimal');
              });
              return Promise.all(writes);
            });
          });
        }).then(function () { return refresh(); });
      });
    }).then(function () {
      setStatus('● ซิงก์แล้ว · ' + new Date().toLocaleTimeString('th-TH'), false);
      $('authMessage').textContent = 'ข้อมูลในเครื่องและ Cloud ตรงกันแล้ว';
      return true;
    }).catch(function (error) {
      setStatus('● ซิงก์ไม่สำเร็จ · ข้อมูลยังอยู่ในเครื่อง', true);
      $('authMessage').textContent = error.message;
      $('authMessage').className = 'error';
      return false;
    }).then(function (synced) { syncBusy = false; return synced; });
  }

  function seedDefaultShops() {
    return MDB.write('shops', ['โพธิ์แก้วสโตร์','บางบอน','วิลล่า'].map(function (name) {
      var now = Date.now();
      return { id: uuid(), name: name, isActive: true, source: 'workbook-name-only', createdAt: now, updatedAt: now };
    }));
  }
  function init() {
    loadSession();
    renderAccount();
    MDB.open().then(function () {
      if (localStorage.getItem('maxone-v040-data-reset') === 'done') return Promise.resolve();
      return MDB.clearAll().then(function () {
        localStorage.setItem('maxone-v040-data-reset', 'done');
      });
    }).then(function () {
      return MDB.all('shops');
    }).then(function (existing) {
      if (existing.length) return refresh();
      if (session && navigator.onLine) {
        return syncAll().then(function () {
          return MDB.all('shops').then(function (afterSync) {
            if (afterSync.length) return refresh();
            return seedDefaultShops().then(refresh).then(syncAll);
          });
        });
      }
      return seedDefaultShops().then(refresh);
    }).then(function () {
      resetForm();
      if (session && navigator.onLine) syncAll();
    }).catch(showError);
    updateNetworkStatus();
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.onclick = function () {
        document.querySelectorAll('.tab').forEach(function (item) { item.classList.toggle('active', item === tab); });
        document.querySelectorAll('.panel').forEach(function (panel) { panel.classList.toggle('active', panel.id === tab.getAttribute('data-tab')); });
        history();
      };
    });
    $('form').onsubmit = saveRecord;
    $('calcEnabled').onchange = calculate;
    $('shop').onchange = updateOpening;
    $('date').onchange = updateOpening;
    $('time').onchange = updateOpening;
    $('addShop').onclick = addShop;
    $('editShop').onclick = openShopEditor;
    $('closeShopEditor').onclick = closeShopEditor;
    $('shopSearch').oninput = renderShopChoices;
    $('shopChoices').onclick = function (event) {
      var target = event.target;
      while (target && target !== $('shopChoices') && !target.getAttribute('data-shop-choice') && !target.getAttribute('data-shop-delete')) target = target.parentNode;
      if (!target || target === $('shopChoices')) return;
      if (target.getAttribute('data-shop-delete')) deleteShop(target.getAttribute('data-shop-delete'));
      else if (target.getAttribute('data-shop-choice')) selectShopForEdit(target.getAttribute('data-shop-choice'));
    };
    $('saveShopEdit').onclick = saveShopEdit;
    $('shopEditor').onclick = function (event) { if (event.target === $('shopEditor')) closeShopEditor(); };
    $('reset').onclick = resetForm;
    $('editBalance').onclick = function () {
      override = !override;
      $('overrideBox').classList.toggle('hidden', !override);
      if (override) setUnits('x', MaxoneStock.bottlesToUnits(getCalculation().closing));
      $('editBalance').textContent = override ? 'ยกเลิกแก้ไขยอด' : 'แก้ไขยอดสต๊อกคงเหลือ';
      calculate();
    };
    ['fc','fp','fb','vc','vp','vb','sc','sp','sb','xc','xp','xb'].forEach(function (id) { $(id).oninput = calculate; });
    $('list').onclick = function (event) {
      var target = event.target;
      if (target.getAttribute('data-edit')) loadRecord(target.getAttribute('data-edit'));
      if (target.getAttribute('data-del')) deleteRecord(target.getAttribute('data-del'));
    };
    $('allHistory').onclick = function () {
      allMode = !allMode;
      $('allHistory').textContent = allMode ? 'แสดงเฉพาะ 60 วันล่าสุด' : 'ดูรายการย้อนหลังทั้งหมด';
      history();
    };
    $('search').oninput = history;
    $('week').onclick = suggestWeek;
    $('export').onclick = exportExcel;
    $('accountButton').onclick = openAuth;
    $('closeAuth').onclick = closeAuth;
    $('signUp').onclick = signUp;
    $('signIn').onclick = signIn;
    $('signOut').onclick = signOut;
    $('syncNow').onclick = syncAll;
    $('authModal').onclick = function (event) { if (event.target === $('authModal')) closeAuth(); };
    window.addEventListener('online', function () { updateNetworkStatus(); if (session) syncAll(); else setStatus('● ยังไม่ได้เชื่อม Cloud', false); });
    window.addEventListener('offline', function () { updateNetworkStatus(); setStatus('● บันทึกในเครื่องได้', false); });
    $('date').value = iso();
    var initialNow = new Date();
    $('time').value = ('0' + initialNow.getHours()).slice(-2) + ':' + ('0' + initialNow.getMinutes()).slice(-2);
    init();
  });
}());
