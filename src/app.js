(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var shops = [];
  var records = [];
  var reportTeams = [];
  var selectedReportTeamId = '';
  var editId = null;
  var allMode = false;
  var session = null;
  var syncBusy = false;
  var shopEditorMode = 'edit';
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
    if (!s) return '';
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
    return MaxoneUnitStock.number($(id).value);
  }
  function units(prefix) {
    return { cases: number(prefix + 'c'), packs: number(prefix + 'p'), bottles: number(prefix + 'b') };
  }
  function setUnits(prefix, value) {
    $(prefix + 'c').value = value.cases;
    $(prefix + 'p').value = value.packs;
    $(prefix + 'b').value = value.bottles;
  }
  function unitText(value) { return (value.cases==null?'—':value.cases) + ' ลัง ' + (value.packs==null?'—':value.packs) + ' แพ็ค ' + (value.bottles==null?'—':value.bottles) + ' ขวด'; }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shopName(shopId) {
    var found = shops.filter(function (shop) { return shop.id === shopId; })[0];
    return found ? found.name : '';
  }
  function transactionTimestamp(date, time) {
    var parsed = Date.parse(String(date || '') + 'T' + String(time || '00:00') + ':00');
    if (!isFinite(parsed)) throw new Error('วันที่หรือเวลาทำรายการไม่ถูกต้อง');
    return parsed;
  }
  function refresh() {
    return Promise.all([MDB.all('shops'), MDB.all('records'), MDB.all('reportTeams')]).then(function (data) {
      shops = data[0];
      records = data[1];
      reportTeams = data[2] || [];
      if (!reportTeams.length) {
        var seedTeam = { id: uuid(), name: 'หมอก', members: ['หมอก','อาม','กุ๊กไก่','อาชิ'], createdAt: Date.now(), updatedAt: Date.now() };
        return MDB.write('reportTeams', seedTeam).then(function () { return refresh(); });
      }
      populateReportTeams();
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
  function selectedReportTeam() {
    return reportTeams.filter(function (team) { return team.id === selectedReportTeamId; })[0] || reportTeams[0] || null;
  }
  function populateReportTeams() {
    var select = $('reportTeam');
    if (!select) return;
    var previous = selectedReportTeamId || window.localStorage.getItem('maxone-report-team-id') || select.value;
    select.innerHTML = '<option value="">เลือกหน่วย</option>';
    reportTeams.slice().sort(function(a,b){return a.name.localeCompare(b.name,'th');}).forEach(function(team){select.add(new Option(team.name,team.id));});
    selectedReportTeamId = reportTeams.some(function(team){return team.id===previous;}) ? previous : (reportTeams[0] ? reportTeams[0].id : '');
    select.value = selectedReportTeamId;
    if (selectedReportTeamId) window.localStorage.setItem('maxone-report-team-id',selectedReportTeamId);
    renderSelectedMembers();
  }
  function persistReportTeams() {
    return MDB.write('reportTeams', reportTeams).then(function(){populateReportTeams();});
  }
  function renderSelectedMembers() {
    var team = selectedReportTeam();
    if (!$('selectedMembers')) return;
    var members = team ? team.members || [] : [];
    $('selectedMembers').innerHTML = members.length ? members.map(function(name,index){
      return '<button type="button" class="member-tag" data-member-remove="'+index+'" title="นำสมาชิกออก">'+escapeHtml(name)+' <span>×</span></button>';
    }).join('') : '<span class="hint">ยังไม่ได้เลือกสมาชิก</span>';
    renderMemberSuggestions();
  }
  function renderMemberSuggestions() {
    if (!$('memberSuggestions')) return;
    var team=selectedReportTeam(), query=$('memberSearch').value.trim().toLowerCase();
    var members=team ? team.members || [] : [];
    var matches=members.filter(function(name){return query && name.toLowerCase().indexOf(query)>=0;});
    $('memberSuggestions').innerHTML=matches.map(function(name){return '<button type="button" class="member-suggestion" data-member-pick="'+escapeHtml(name)+'">'+escapeHtml(name)+' เพิ่ม</button>';}).join('');
    $('memberSuggestions').classList.toggle('hidden',!matches.length);
  }
  function openReportTeamEditor() {
    $('reportTeamEditor').classList.remove('hidden'); $('reportTeamSearch').value='';
    $('reportTeamName').value=''; $('reportTeamEditId').value='';
    $('reportTeamMessage').textContent='เพิ่มหน่วยใหม่หรือเลือกหน่วยเพื่อแก้ไข'; renderReportTeamChoices();
  }
  function renderReportTeamChoices() {
    var q=$('reportTeamSearch').value.trim().toLowerCase();
    var matches=reportTeams.filter(function(t){return t.name.toLowerCase().indexOf(q)>=0;});
    $('reportTeamChoices').innerHTML=matches.map(function(t){
      return '<div class="shop-choice-row"><button type="button" class="shop-choice-delete" data-team-delete="'+escapeHtml(t.id)+'">ลบ</button><button type="button" class="shop-choice-select" data-team-edit="'+escapeHtml(t.id)+'"><span>'+escapeHtml(t.name)+'</span><small>เลือกแก้ไข</small></button></div>';
    }).join('') || '<div class="empty">ไม่พบหน่วย</div>';
  }
  function saveReportTeam() {
    var name=$('reportTeamName').value.trim(), id=$('reportTeamEditId').value;
    if(!name){$('reportTeamMessage').textContent='กรุณากรอกชื่อหน่วย';return;}
    if(reportTeams.some(function(t){return t.id!==id && t.name.toLowerCase()===name.toLowerCase();})){$('reportTeamMessage').textContent='มีชื่อหน่วยนี้แล้ว';return;}
    var existing=reportTeams.filter(function(t){return t.id===id;})[0], now=Date.now();
    var team=existing?Object.assign({},existing,{name:name,updatedAt:now}):{id:uuid(),name:name,members:[],createdAt:now,updatedAt:now};
    if(existing) reportTeams=reportTeams.map(function(t){return t.id===id?team:t;}); else reportTeams.push(team);
    persistReportTeams().then(function(){selectedReportTeamId=team.id;populateReportTeams();$('reportTeamEditor').classList.add('hidden');setStatus('● บันทึกหน่วยแล้ว',false);}).catch(showError);
  }
  function deleteReportTeam(id) {
    var team=reportTeams.filter(function(t){return t.id===id;})[0]; if(!team)return;
    if(reportTeams.length===1){$('reportTeamMessage').textContent='ต้องมีอย่างน้อย 1 หน่วย ไม่สามารถลบหน่วยสุดท้ายได้';return;}
    if(!window.confirm('ยืนยันลบหน่วย "'+team.name+'"?'))return;
    reportTeams=reportTeams.filter(function(t){return t.id!==id;});
    persistReportTeams().then(function(){setStatus('● ลบหน่วยแล้ว',false);renderReportTeamChoices();}).catch(showError);
  }
  function openMemberEditor() {
    $('memberEditor').classList.remove('hidden'); $('memberName').value=''; $('memberEditName').value='';
    $('memberEditorMessage').textContent='เพิ่มสมาชิกใหม่ หรือเลือกชื่อด้านล่างเพื่อแก้ไข/ลบ'; renderMemberChoices();
  }
  function renderMemberChoices() {
    var team=selectedReportTeam(), members=team?team.members||[]:[];
    $('memberChoices').innerHTML=members.map(function(name){return '<div class="shop-choice-row"><button type="button" class="shop-choice-delete" data-member-delete="'+escapeHtml(name)+'">ลบ</button><button type="button" class="shop-choice-select" data-member-edit="'+escapeHtml(name)+'"><span>'+escapeHtml(name)+'</span><small>แก้ไข</small></button></div>';}).join('') || '<div class="empty">ยังไม่มีสมาชิก</div>';
  }
  function saveMember() {
    var team=selectedReportTeam(), name=$('memberName').value.trim(), old=$('memberEditName').value;
    if(!team){$('memberEditorMessage').textContent='กรุณาเลือกหน่วยก่อน';return;}
    if(!name){$('memberEditorMessage').textContent='กรุณากรอกชื่อสมาชิก';return;}
    if((team.members||[]).some(function(n){return n!==old&&n.toLowerCase()===name.toLowerCase();})){$('memberEditorMessage').textContent='มีสมาชิกชื่อนี้แล้ว';return;}
    team.members=(team.members||[]).map(function(n){return n===old?name:n;});
    if(!old)team.members.push(name);
    team.updatedAt=Date.now();
    persistReportTeams().then(function(){renderMemberChoices();$('memberName').value='';$('memberEditName').value='';$('memberEditorMessage').textContent='บันทึกสมาชิกแล้ว';setStatus('● บันทึกสมาชิกแล้ว',false);}).catch(showError);
  }
  function deleteMember(name) {
    var team=selectedReportTeam(); if(!team)return;
    if(!window.confirm('ยืนยันลบสมาชิก "'+name+'" ?'))return;
    team.members=(team.members||[]).filter(function(n){return n!==name;});team.updatedAt=Date.now();
    persistReportTeams().then(function(){renderMemberChoices();setStatus('● ลบสมาชิกแล้ว',false);}).catch(showError);
  }
  function addMemberTag(name) {
    var team=selectedReportTeam(); if(!team)return;
    if((team.members||[]).indexOf(name)<0)team.members.push(name);
    team.updatedAt=Date.now();persistReportTeams().then(function(){$('memberSearch').value='';renderSelectedMembers();});
  }
  function previousClosingForDate(date) {
    var previous = records.filter(function (record) { return record.id !== editId && record.date < date; })
      .sort(MaxoneStock.compareRecords).pop();
    return previous ? { cases: previous.closing_cases, packs: previous.closing_packs, bottles: previous.closing_loose_bottles } : null;
  }
  function getCalculation() {
    var ids=['c','p','b'], keys=['cases','packs','bottles'];
    var result={opening:{},sales:{},closing:{},enabled:$('closingAuto').checked};
    keys.forEach(function(key,index){
      result.opening[key]=MaxoneUnitStock.number($('o'+ids[index]).value);
      result.sales[key]=MaxoneUnitStock.number($('v'+ids[index]).value);
      result.closing[key]=MaxoneUnitStock.number($('x'+ids[index]).value);
    });
    if(result.enabled){
      result.closing=MaxoneStock.calculateClosingByUnit(previousClosingForDate($('date').value),result.sales);
      keys.forEach(function(key,index){$('x'+ids[index]).value=result.closing[key]==null?'':result.closing[key];});
    }
    return result;
  }
  function renderReview(calc,closingUnits){$('review').innerHTML='<div><span>ร้านค้า</span><b>'+escapeHtml(shopName($('shop').value))+'</b></div><div><span>ยอดขาย</span><b>'+unitText(calc.sales)+'</b></div><div><span>Stock คงเหลือ</span><b>'+unitText(closingUnits)+'</b></div><div><span>วันหมดอายุ</span><b>'+escapeHtml(thaiDate($('expiry').value))+'</b></div>';}
  function calculate(){try{var c=getCalculation();['c','p','b'].forEach(function(id){$('x'+id).disabled=c.enabled;});renderReview(c,c.closing);$('error').classList.add('hidden');return true;}catch(e){$('error').textContent=e.message;$('error').classList.remove('hidden');return false;}}
  function resetForm() {
    editId = null;
    $('shop').disabled = false;
    $('addShop').disabled = false;
    $('rid').value = '';
    $('date').value = iso();
    var now = new Date();
    $('time').value = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    $('expiry').value = '';
    $('shop').value = '';
    $('closingAuto').checked = false;
    ['vc','vp','vb','xc','xp','xb'].forEach(function (id) { $(id).value = id.charAt(0)==='v' ? 0 : ''; });
    $('save').textContent = 'บันทึกยอดขาย';
    ['oc','op','ob'].forEach(function(id){$(id).value='';});
    calculate();
  }
  function cloudQueueDelete(recordId) {
    return { id: 'delete-record-' + recordId, op: 'delete', entity: 'record', entityId: recordId, createdAt: Date.now() };
  }
  function persistChange(candidate,oldRecord,action){
    var affected=action==='delete'?[]:[candidate];
    var audit={id:uuid(),recordId:candidate.id,action:action,beforeData:oldRecord||null,afterData:action==='delete'?null:candidate,createdAt:Date.now()};
    var queue=action==='delete'?cloudQueueDelete(candidate.id):null;
    return MDB.applyRecordChange(affected,action==='delete'?candidate.id:null,audit,queue).then(refresh);
  }
  function saveRecord(event){event.preventDefault();try{var shopId=$('shop').value;if(!shopId)throw new Error('กรุณาเลือกร้านค้า');var c=getCalculation(),old=records.filter(function(r){return r.id===editId;})[0]||null,now=Date.now(),row={id:editId||uuid(),shopId:shopId,date:$('date').value,time:$('time').value,transactionAt:transactionTimestamp($('date').value,$('time').value),createdAt:old?old.createdAt:now,updatedAt:now,expiryDate:$('expiry').value||null,stockCalculationEnabled:c.enabled,opening_cases:c.opening.cases,opening_packs:c.opening.packs,opening_loose_bottles:c.opening.bottles,sales_cases:c.sales.cases,sales_packs:c.sales.packs,sales_loose_bottles:c.sales.bottles,closing_cases:c.closing.cases,closing_packs:c.closing.packs,closing_loose_bottles:c.closing.bottles,refill_cases:0,refill_packs:0,refill_loose_bottles:0,openingSeedBottles:0,refillBottles:0,salesBottles:0,closingBottles:0,sourceType:'app',adjustmentReason:null};persistChange(row,old,old?'update':'create').then(function(){resetForm();setStatus('● บันทึกในเครื่องแล้ว',false);window.alert('บันทึกรายการเรียบร้อย');if(session&&navigator.onLine)syncAll();}).catch(showError);}catch(e){showError(e);}}
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
    $('closingAuto').checked=false;
    setUnits('o',{cases:record.opening_cases==null?'':record.opening_cases,packs:record.opening_packs==null?'':record.opening_packs,bottles:record.opening_loose_bottles==null?'':record.opening_loose_bottles});
    setUnits('v',{cases:record.sales_cases==null?'':record.sales_cases,packs:record.sales_packs==null?'':record.sales_packs,bottles:record.sales_loose_bottles==null?'':record.sales_loose_bottles});
    setUnits('x',{cases:record.closing_cases==null?'':record.closing_cases,packs:record.closing_packs==null?'':record.closing_packs,bottles:record.closing_loose_bottles==null?'':record.closing_loose_bottles});
    $('save').textContent = 'บันทึกการแก้ไข';
    calculate();
    document.querySelector('[data-tab="entry"]').click();
    window.scrollTo(0, 0);
  }
  function historyWeekRange() {
    var today = new Date();
    var daysBack = (today.getDay() + 1) % 7;
    if (!daysBack) daysBack = 7;
    var saturday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysBack);
    var monday = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() - 5);
    return { from: formatLocalDate(monday), to: formatLocalDate(saturday) };
  }
  function history() {
    var week = historyWeekRange();
    var query = $('search').value.trim().toLowerCase();
    var visible = records.filter(function (record) {
      var inRange = allMode || (record.date >= week.from && record.date <= week.to);
      return inRange && shopName(record.shopId).toLowerCase().indexOf(query) >= 0;
    }).sort(function (a, b) { return MaxoneStock.compareRecords(b, a); });
    $('range').textContent = (allMode ? 'ประวัติทั้งหมด' : 'สัปดาห์ล่าสุด ' + thaiDate(week.from) + ' - ' + thaiDate(week.to)) + ' · ' + visible.length + ' รายการ';
    $('allHistory').textContent = allMode ? 'แสดงเฉพาะสัปดาห์ล่าสุด' : 'ดูประวัติย้อนหลัง';
    $('list').innerHTML = visible.length ? visible.map(function (record) {
      return '<article class="history-card"><small>' + escapeHtml(thaiDate(record.date)) + ' · ' + escapeHtml(record.time || '00:00') + '</small><strong>' + escapeHtml(shopName(record.shopId)) + '</strong>' +
        '<div class="hint">ขาย ' + unitText({cases:record.sales_cases==null?'—':record.sales_cases,packs:record.sales_packs==null?'—':record.sales_packs,bottles:record.sales_loose_bottles==null?'—':record.sales_loose_bottles}) + '<br>คงเหลือ ' + unitText({cases:record.closing_cases==null?'—':record.closing_cases,packs:record.closing_packs==null?'—':record.closing_packs,bottles:record.closing_loose_bottles==null?'—':record.closing_loose_bottles}) + '</div>' +
        '<div class="history-actions"><button type="button" data-edit="' + escapeHtml(record.id) + '">แก้ไข</button><button type="button" class="del" data-del="' + escapeHtml(record.id) + '">ลบ</button></div></article>';
    }).join('') : '<div class="empty">ยังไม่มีรายการในช่วงสัปดาห์ล่าสุด</div>';
  }
  function deleteRecord(recordId) {
    var record = records.filter(function (item) { return item.id === recordId; })[0];
    if (!record || !window.confirm('ลบรายการ ' + thaiDate(record.date) + ' ร้าน ' + shopName(record.shopId) + '?')) return;
    persistChange(record, record, 'delete').then(function () {
      setStatus('● ลบรายการในเครื่องแล้ว', false);
      if (session && navigator.onLine) syncAll();
    }).catch(showError);
  }
  function addShop() { openShopEditor('create'); }

  function openShopEditor(mode) {
    shopEditorMode = mode || 'edit';
    $('shopEditor').classList.remove('hidden');
    $('shopSearch').value = '';
    $('shopEditName').value = '';
    $('shopEditId').value = '';
    $('shopEditorTitle').textContent = shopEditorMode === 'create' ? 'เพิ่มร้านค้า' : 'จัดการชื่อร้านค้า';
    $('shopEditLabel').textContent = shopEditorMode === 'create' ? 'ชื่อร้านใหม่' : 'ชื่อร้าน';
    $('saveShopEdit').textContent = shopEditorMode === 'create' ? 'บันทึกร้านค้า' : 'บันทึกชื่อและเลือกร้านนี้';
    $('shopEditMessage').textContent = shopEditorMode === 'create' ? 'กรอกชื่อร้านใหม่ แล้วกดบันทึก' : 'เลือกร้านที่ต้องการแก้ไข แล้วกดบันทึก';
    $('shopChoices').classList.toggle('hidden', shopEditorMode === 'create');
    $('shopSearch').classList.toggle('hidden', shopEditorMode === 'create');
    $('shopSearchLabel').classList.toggle('hidden', shopEditorMode === 'create');
    renderShopChoices();
    $('shopEditName').focus();
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
      calculate();
    }).catch(function (error) {
      $('shopEditMessage').textContent = error.message || 'ลบร้านค้าไม่สำเร็จ';
    });
  }
  function selectShopForEdit(shopId) {
    var shop = shops.filter(function (item) { return item.id === shopId; })[0];
    if (!shop) return;
    shopEditorMode = 'edit';
    $('shopEditorTitle').textContent = 'แก้ไขชื่อร้านค้า';
    $('shopEditLabel').textContent = 'แก้ไขชื่อร้าน';
    $('saveShopEdit').textContent = 'บันทึกชื่อและเลือกร้านนี้';
    $('shopEditMessage').textContent = 'แก้ไขชื่อร้านที่เลือก แล้วกดบันทึก';
    $('shopChoices').classList.remove('hidden');
    $('shopSearch').classList.remove('hidden');
    $('shopSearchLabel').classList.remove('hidden');
    $('shopEditId').value = shop.id;
    $('shopEditName').value = shop.name;
    renderShopChoices();
    $('shopEditName').focus();
  }
  function saveShopEdit() {
    var shopId = $('shopEditId').value;
    var existing = shops.filter(function (item) { return item.id === shopId; })[0];
    var name = $('shopEditName').value.trim();
    if (!name) { $('shopEditMessage').textContent = 'กรุณากรอกชื่อร้าน'; $('shopEditName').focus(); return; }
    if (shops.some(function (item) { return item.id !== (shopEditorMode === 'edit' ? shopId : '') && item.name.trim().toLowerCase() === name.toLowerCase(); })) {
      $('shopEditMessage').textContent = 'มีชื่อร้านนี้อยู่แล้ว'; return;
    }
    if (shopEditorMode === 'edit' && !existing) { $('shopEditMessage').textContent = 'กรุณาเลือกร้านค้าที่ต้องการแก้ไข'; return; }
    var now = Date.now();
    var shop = shopEditorMode === 'create'
      ? { id: uuid(), name: name, isActive: true, createdAt: now, updatedAt: now }
      : Object.assign({}, existing, { name: name, updatedAt: now });
    $('saveShopEdit').disabled = true;
    $('shopEditMessage').textContent = 'กำลังบันทึกร้านค้า...';
    MDB.write('shops', shop).then(function () {
      return refresh();
    }).then(function () {
      $('shop').value = shop.id;
      calculate();
      closeShopEditor();
      setStatus(shopEditorMode === 'create' ? '● เพิ่มร้านค้าในเครื่องแล้ว' : '● แก้ไขชื่อร้านในเครื่องแล้ว', false);
      if (session && navigator.onLine) return syncAll();
    }).catch(function (error) {
      $('shopEditMessage').textContent = error.message || 'บันทึกร้านค้าไม่สำเร็จ';
      showError(error);
    }).then(function () { $('saveShopEdit').disabled = false; });
  }

  function formatLocalDate(value) {
    return value.getFullYear() + '-' + ('0' + (value.getMonth() + 1)).slice(-2) + '-' + ('0' + value.getDate()).slice(-2);
  }
  function suggestMonthStart() {
    var now=new Date(), first=new Date(now.getFullYear(),now.getMonth(),1);
    var offset=(8-first.getDay())%7;
    first.setDate(first.getDate()+offset);
    $('from').value=formatLocalDate(first);
  }
  function suggestToday() {
    var today = formatLocalDate(new Date());
    $('from').value = today;
    $('to').value = today;
  }
  function suggestWeek() {
    var date = new Date();
    var daysBack = (date.getDay() + 1) % 7;
    if (!daysBack) daysBack = 7;
    var saturday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysBack);
    var monday = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() - 5);
    $('from').value = formatLocalDate(monday);
    $('to').value = formatLocalDate(saturday);
  }
  function excelDate(isoDate) {
    var parts = isoDate.split('-');
    return new Date(Number(parts[0]) + 543, Number(parts[1]) - 1, Number(parts[2]));
  }
  function reportRows() {
    var from = $('from').value, to = $('to').value;
    if (!from || !to || from > to) { window.alert('กรุณาเลือกช่วงวันที่ให้ถูกต้อง'); return null; }
    var rows = records.filter(function (r) { return r.date >= from && r.date <= to; }).sort(MaxoneStock.compareRecords);
    if (!rows.length) { window.alert('ไม่พบข้อมูลในช่วงวันที่เลือก'); return null; }
    return { from: from, to: to, rows: rows };
  }
  function reportCell(v) { return v == null || v === '' || (typeof v === 'number' && v === 0) || (typeof v === 'string' && v.trim() !== '' && Number(v) === 0) ? '' : v; }
  function reportTotals(rows, key) {
    return rows.reduce(function (sum, r) { var n = Number(r[key]); return sum + (isFinite(n) ? n : 0); }, 0);
  }
  function reportSalesValue(rows) {
    return reportTotals(rows, 'sales_cases') * 450 + reportTotals(rows, 'sales_packs') * 90;
  }
  function formatBaht(value) {
    return Number(value || 0).toLocaleString('en-US') + ' บาท';
  }
  function salesTotalCells(rows) {
    var values = {
      cases: reportTotals(rows, 'sales_cases'),
      packs: reportTotals(rows, 'sales_packs'),
      bottles: reportTotals(rows, 'sales_loose_bottles')
    };
    return ['cases','packs','bottles'].map(function (key) {
      var unit = { cases: 0, packs: 0, bottles: 0 };
      unit[key] = values[key];
      return values[key] > 0 ? MaxoneStock.formatUnitTotals(unit) : '';
    });
  }
  function exportExcel() {
    var report = reportRows();
    if (!report) return;
    if (!window.XLSX) { window.alert('ยังไม่มีไลบรารี Excel กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่'); return; }
    var rows = report.rows;
    var team = selectedReportTeam();
    var teamTitle = 'แบบฟอร์มสรุปยอดขาย หน่วย' + (team ? team.name : '') + ' เขตกทม.';
    var memberLine = 'ทีม: ' + (team && team.members ? team.members.join(', ') : '');
    var aoa = [
      [teamTitle],
      [memberLine],
      ['วัน-เดือน-ปี','ชื่อร้าน/จังหวัด','Stock ตั้งต้น','','','สต๊อกคงเหลือ','','','วันหมดอายุ','ยอดขาย','',''],
      ['','','ลัง','แพ็ค','ขวด','ลัง','แพ็ค','ขวด','','ลัง','แพ็ค','ขวด']
    ];
    rows.forEach(function (r) {
      aoa.push([
        r.date ? excelDate(r.date) : '', shopName(r.shopId),
        reportCell(r.opening_cases), reportCell(r.opening_packs), reportCell(r.opening_loose_bottles),
        reportCell(r.closing_cases), reportCell(r.closing_packs), reportCell(r.closing_loose_bottles),
        r.expiryDate ? excelDate(r.expiryDate) : '',
        reportCell(r.sales_cases), reportCell(r.sales_packs), reportCell(r.sales_loose_bottles)
      ]);
    });
    var totalRow = aoa.length + 1;
    var totalCells = salesTotalCells(rows);
    aoa.push(['รวมยอดขาย · ยอดขายรวม ' + formatBaht(reportSalesValue(rows)),'','','','','','','','',totalCells[0],totalCells[1],totalCells[2]]);
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [
      {s:{r:0,c:0},e:{r:0,c:11}}, {s:{r:1,c:0},e:{r:1,c:11}},
      {s:{r:2,c:0},e:{r:3,c:0}}, {s:{r:2,c:1},e:{r:3,c:1}},
      {s:{r:2,c:2},e:{r:2,c:4}}, {s:{r:2,c:5},e:{r:2,c:7}},
      {s:{r:2,c:8},e:{r:3,c:8}}, {s:{r:2,c:9},e:{r:2,c:11}},
      {s:{r:totalRow-1,c:0},e:{r:totalRow-1,c:8}}
    ];
    ws['!cols'] = [{wch:18.6},{wch:53.3},{wch:13},{wch:13},{wch:13},{wch:13},{wch:13},{wch:13},{wch:17.5},{wch:13},{wch:13},{wch:13}];
    ws['!rows'] = [{hpt:27},{hpt:27},{hpt:27},{hpt:27}].concat(rows.map(function(){return {hpt:23.25};}),[{hpt:31.5}]);
    ws['!pageSetup'] = { paperSize: 9, orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 };
    ws['!pageMargins'] = { left:0.25,right:0.25,top:0.25,bottom:0.25,header:0.1,footer:0.1 };
    ws['!printOptions'] = { horizontalCentered:true };
    var border = { top:{style:'thin',color:{rgb:'FF808080'}},bottom:{style:'thin',color:{rgb:'FF808080'}},left:{style:'thin',color:{rgb:'FF808080'}},right:{style:'thin',color:{rgb:'FF808080'}} };
    function styleRange(r1,r2,c1,c2,style) {
      for(var r=r1;r<=r2;r++) for(var c=c1;c<=c2;c++) {
        var ref=XLSX.utils.encode_cell({r:r,c:c});
        if(!ws[ref]) ws[ref]={t:'s',v:''};
        ws[ref].s=style;
      }
    }
    var titleStyle={font:{name:'Helvetica Neue',sz:18,bold:true},alignment:{horizontal:'center',vertical:'center'},fill:{fgColor:{rgb:'FFFFFFFF'}}};
    var teamStyle={font:{name:'Segoe UI',sz:18},alignment:{horizontal:'center',vertical:'center'}};
    var headBlue={font:{name:'Segoe UI',sz:18,bold:true,color:{rgb:'FFFFFFFF'}},fill:{fgColor:{rgb:'FF073763'}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:border};
    var subBlue={font:{name:'Segoe UI',sz:18,bold:true,color:{rgb:'FFFFFFFF'}},fill:{fgColor:{rgb:'FF4A86E8'}},alignment:{horizontal:'center',vertical:'center'},border:border};
    var dataStyle={font:{name:'Arial',sz:11},alignment:{horizontal:'center',vertical:'center'},border:border};
    var shopStyle={font:{name:'Arial',sz:11},alignment:{horizontal:'left',vertical:'center'},border:border};
    var totalStyle={font:{name:'Segoe UI',sz:18,bold:true},alignment:{horizontal:'center',vertical:'center'},border:border};
    styleRange(0,0,0,11,titleStyle); styleRange(1,1,0,11,teamStyle);
    styleRange(2,3,0,11,headBlue); styleRange(3,3,2,7,subBlue); styleRange(3,3,9,11,subBlue);
    styleRange(4,totalRow-2,0,11,dataStyle);
    for(var rr=4;rr<totalRow-1;rr++) ws['B'+(rr+1)].s=shopStyle;
    styleRange(totalRow-1,totalRow-1,0,11,totalStyle);
    for(var dr=5;dr<=rows.length+4;dr++){ if(ws['A'+dr]) ws['A'+dr].z='d/m/yyyy'; if(ws['I'+dr]) ws['I'+dr].z='d/m/yyyy'; }
    var wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'สรุปยอดขาย');
    XLSX.writeFile(wb,'MAXONE_Sales_'+report.from+'_to_'+report.to+'.xlsx',{cellStyles:true});
  }
  function exportPdf() {
    var report = reportRows();
    if (!report) return;
    if (typeof window.html2pdf !== 'function') {
      window.alert('ยังโหลดระบบสร้าง PDF ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง');
      return;
    }
    var rows = report.rows;
    var team = selectedReportTeam();
    var teamTitle = 'แบบฟอร์มสรุปยอดขาย หน่วย' + (team ? team.name : '') + ' เขตกทม.';
    var memberLine = 'ทีม: ' + (team && team.members ? team.members.join(', ') : '');
    var body = rows.map(function(r) {
      var cells = [thaiDate(r.date),shopName(r.shopId),reportCell(r.opening_cases),reportCell(r.opening_packs),reportCell(r.opening_loose_bottles),
        reportCell(r.closing_cases),reportCell(r.closing_packs),reportCell(r.closing_loose_bottles),thaiDate(r.expiryDate),
        reportCell(r.sales_cases),reportCell(r.sales_packs),reportCell(r.sales_loose_bottles)];
      return '<tr>'+cells.map(function(v){return '<td>'+escapeHtml(v)+'</td>';}).join('')+'</tr>';
    }).join('');
    var totals=salesTotalCells(rows);
    var host=document.createElement('div');
    host.setAttribute('aria-hidden','true');
    /* Keep the capture target inside the viewport. html2canvas can return a
       blank canvas when the source is positioned far outside the viewport. */
    host.style.cssText='position:fixed;left:0;top:0;width:1050px;background:#fff;z-index:2147483647;pointer-events:none;';
    host.innerHTML='<style>'+
      '*{box-sizing:border-box} .maxone-pdf{width:1050px;padding:18px;background:#fff;color:#111;font-family:Arial,Tahoma,sans-serif}'+
      '.maxone-pdf h1,.maxone-pdf h2{margin:0;text-align:center;font-weight:700}.maxone-pdf h1{font-size:23px;line-height:34px}.maxone-pdf h2{font-size:19px;line-height:34px;font-weight:400}'+
      '.maxone-pdf table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px}'+
      '.maxone-pdf th,.maxone-pdf td{border:1px solid #808080;text-align:center;vertical-align:middle;padding:5px 3px;overflow-wrap:anywhere;height:31px}'+
      '.maxone-pdf thead tr{height:36px}.maxone-pdf thead th{background:#073763;color:#fff;font-size:14px;font-weight:700}.maxone-pdf thead tr.sub th{background:#4a86e8;color:#fff;font-size:13px}'+
      '.maxone-pdf td:nth-child(2){text-align:left;padding-left:6px}.maxone-pdf tfoot td{height:42px;font-weight:bold;font-size:14px;text-align:center}'+
      '.maxone-pdf col.a{width:9%}.maxone-pdf col.b{width:22%}.maxone-pdf col.c,.maxone-pdf col.d,.maxone-pdf col.e,.maxone-pdf col.f,.maxone-pdf col.g,.maxone-pdf col.h,.maxone-pdf col.j,.maxone-pdf col.k,.maxone-pdf col.l{width:6%}.maxone-pdf col.i{width:9%}'+
      '</style><div class="maxone-pdf"><h1>'+escapeHtml(teamTitle)+'</h1><h2>'+escapeHtml(memberLine)+'</h2>'+
      '<table><colgroup><col class="a"><col class="b"><col class="c"><col class="d"><col class="e"><col class="f"><col class="g"><col class="h"><col class="i"><col class="j"><col class="k"><col class="l"></colgroup>'+
      '<thead><tr><th rowspan="2">วัน-เดือน-ปี</th><th rowspan="2">ชื่อร้าน/จังหวัด</th><th colspan="3">Stock ตั้งต้น</th><th colspan="3">สต๊อกคงเหลือ</th><th rowspan="2">วันหมดอายุ</th><th colspan="3">ยอดขาย</th></tr>'+
      '<tr class="sub"><th>ลัง</th><th>แพ็ค</th><th>ขวด</th><th>ลัง</th><th>แพ็ค</th><th>ขวด</th><th>ลัง</th><th>แพ็ค</th><th>ขวด</th></tr></thead><tbody>'+body+'</tbody>'+
      '<tfoot><tr><td colspan="12">รวมยอดขาย '+escapeHtml(totals[0])+' · '+escapeHtml(totals[1])+' · '+escapeHtml(totals[2])+' &nbsp; | &nbsp; ยอดขายรวม '+escapeHtml(formatBaht(reportSalesValue(rows)))+'</td></tr></tfoot></table></div>';
    document.body.appendChild(host);
    var filename='MAXONE_Sales_'+report.from+'_to_'+report.to+'.pdf';
    var options={margin:[6,6,6,6],filename:filename,image:{type:'jpeg',quality:0.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:0},jsPDF:{unit:'mm',format:'a4',orientation:'landscape'},pagebreak:{mode:['css','legacy']}};
    /* host.firstChild is the STYLE element, not the report. Passing it to
       html2pdf creates a valid PDF container with no visible report content. */
    var reportElement=host.querySelector('.maxone-pdf');
    if(!reportElement || !reportElement.querySelector('table tbody tr')) {
      if(host.parentNode)host.parentNode.removeChild(host);
      showError(new Error('ไม่พบเนื้อหารายงานสำหรับสร้าง PDF'));
      return;
    }
    var worker=window.html2pdf().set(options).from(reportElement).save();
    worker.then(function(){if(host.parentNode)host.parentNode.removeChild(host);}).catch(function(error){
      if(host.parentNode)host.parentNode.removeChild(host);
      showError(error || new Error('สร้างไฟล์ PDF ไม่สำเร็จ'));
    });
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
    var refill = {cases:Number(record.refill_cases||0),packs:Number(record.refill_packs||0),bottles:Number(record.refill_loose_bottles||0)};
    return {
      id:record.id, shop_id:record.shopId, sale_date:record.date,
      transaction_at:toIsoTime(record.transactionAt||transactionTimestamp(record.date,record.time)),
      sale_time:record.time||'00:00', entry_no:1,
      opening_cases:record.opening_cases, opening_packs:record.opening_packs, opening_loose_bottles:record.opening_loose_bottles,
      closing_cases:record.closing_cases, closing_packs:record.closing_packs, closing_loose_bottles:record.closing_loose_bottles,
      sales_cases:record.sales_cases, sales_packs:record.sales_packs, sales_loose_bottles:record.sales_loose_bottles,
      stock_calculation_enabled:!!record.stockCalculationEnabled,
      opening_seed_bottles:0, opening_bottles:0,
      refill_crates:refill.cases, refill_packs:refill.packs, refill_bottles:refill.bottles,
      sales_crates:0, sales_bottles:0, stock_adjustment_bottles:0, adjustment_reason:null,
      expiry_date:record.expiryDate||null, created_by:userId,
      created_at:toIsoTime(record.createdAt), updated_at:toIsoTime(record.updatedAt||record.createdAt)
    };
  }
  function cloudRecordToLocal(row) {
    return {
      id:row.id, shopId:row.shop_id,
      opening_cases:row.opening_cases, opening_packs:row.opening_packs, opening_loose_bottles:row.opening_loose_bottles,
      closing_cases:row.closing_cases, closing_packs:row.closing_packs, closing_loose_bottles:row.closing_loose_bottles,
      sales_cases:row.sales_cases, sales_packs:row.sales_packs, sales_loose_bottles:row.sales_loose_bottles,
      refill_cases:row.refill_crates, refill_packs:row.refill_packs, refill_loose_bottles:row.refill_bottles,
      stockCalculationEnabled:!!row.stock_calculation_enabled, date:row.sale_date,
      time:row.sale_time||(row.transaction_at?(function(d){return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}(new Date(row.transaction_at))):'00:00'),
      transactionAt:parseTime(row.transaction_at||row.created_at), expiryDate:row.expiry_date||null, adjustmentReason:row.adjustment_reason||null,
      createdAt:parseTime(row.created_at), updatedAt:parseTime(row.updated_at), sourceType:'app'
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
            /* v0.4 stores independent unit balances as entered. Never run the legacy
               bottle-conversion ledger across these rows during synchronization. */
            return Promise.resolve();
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
    return MDB.write('shops', ['ศิริชัยค้าส่ง','ศุชานันท์ เทรดดิ้ง','ธีรเชษฐ','โพธิ์แก้วสโตร์'].map(function (name) {
      var now = Date.now();
      return { id: uuid(), name: name, isActive: true, source: 'workbook-name-only', createdAt: now, updatedAt: now };
    }));
  }
  function init() {
    loadSession();
    renderAccount();
    MDB.open().then(function () { return MDB.all('shops'); }).then(function (existing) {
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
    $('shop').onchange = calculate;
    $('date').onchange = calculate;
    $('time').onchange = calculate;
    $('closingAuto').onchange = calculate;
    $('addShop').onclick = addShop;
    $('editShop').onclick = function () { openShopEditor('edit'); };
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
    ['vc','vp','vb','xc','xp','xb','oc','op','ob'].forEach(function (id) { $(id).oninput = calculate; });
    $('list').onclick = function (event) {
      var target = event.target;
      if (target.getAttribute('data-edit')) loadRecord(target.getAttribute('data-edit'));
      if (target.getAttribute('data-del')) deleteRecord(target.getAttribute('data-del'));
    };
    $('allHistory').onclick = function () {
      allMode = !allMode;
      $('allHistory').textContent = allMode ? 'แสดงเฉพาะสัปดาห์ล่าสุด' : 'ดูประวัติย้อนหลัง';
      history();
    };
    $('search').oninput = history;
    $('today').onclick = suggestToday;
    $('week').onclick = suggestWeek;
    $('setMonthStart').onclick = suggestMonthStart;
    $('setToday').onclick = function(){ $('to').value=iso(); };
    $('reportTeam').onchange = function(){selectedReportTeamId=$('reportTeam').value;window.localStorage.setItem('maxone-report-team-id',selectedReportTeamId);renderSelectedMembers();};
    $('addReportTeam').onclick = openReportTeamEditor;
    $('editReportTeam').onclick = openReportTeamEditor;
    $('closeReportTeamEditor').onclick = function(){$('reportTeamEditor').classList.add('hidden');};
    $('reportTeamSearch').oninput = renderReportTeamChoices;
    $('reportTeamChoices').onclick = function(e){var t=e.target.closest('button');if(!t)return;if(t.dataset.teamDelete)deleteReportTeam(t.dataset.teamDelete);if(t.dataset.teamEdit){var team=reportTeams.filter(function(x){return x.id===t.dataset.teamEdit;})[0];if(team){$('reportTeamEditId').value=team.id;$('reportTeamName').value=team.name;$('reportTeamMessage').textContent='แก้ไขชื่อหน่วยแล้วกดบันทึก';}}};
    $('saveReportTeam').onclick = saveReportTeam;
    $('closeMemberEditor').onclick = function(){$('memberEditor').classList.add('hidden');};
    $('manageMembers').onclick = openMemberEditor;
    $('addMember').onclick = function(){var n=$('memberSearch').value.trim();if(n)addMemberTag(n);else openMemberEditor();};
    $('memberSearch').oninput = renderMemberSuggestions;
    $('memberSuggestions').onclick = function(e){var t=e.target.closest('button');if(t&&t.dataset.memberPick)addMemberTag(t.dataset.memberPick);};
    $('selectedMembers').onclick = function(e){var t=e.target.closest('button');if(!t||t.dataset.memberRemove==null)return;var team=selectedReportTeam();if(team){team.members.splice(Number(t.dataset.memberRemove),1);team.updatedAt=Date.now();persistReportTeams();}};
    $('memberChoices').onclick = function(e){var t=e.target.closest('button');if(!t)return;if(t.dataset.memberEdit){$('memberEditName').value=t.dataset.memberEdit;$('memberName').value=t.dataset.memberEdit;$('memberEditorMessage').textContent='แก้ไขชื่อสมาชิกแล้วกดบันทึก';$('saveMember').textContent='บันทึกการแก้ไข';}if(t.dataset.memberDelete)deleteMember(t.dataset.memberDelete);};
    $('saveMember').onclick = saveMember;
    $('reportTeamEditor').onclick = function(e){if(e.target===$('reportTeamEditor'))$('reportTeamEditor').classList.add('hidden');};
    $('memberEditor').onclick = function(e){if(e.target===$('memberEditor'))$('memberEditor').classList.add('hidden');};
    $('export').onclick = exportExcel;
    $('exportPdf').onclick = exportPdf;
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
